// ── Đăng nhập một lần (OpenID Connect) — Biến thể B trong hợp đồng app ngoài của trường ─────────
// Hôm nay nhà cung cấp là Google; ngày trường dựng xong School Data Hub thì CHỈ đổi hai biến
// môi trường (Discovery URL + client id/secret), redirect_uri và bảng liên kết giữ nguyên.
//
// Giao thức do `openid-client` (thư viện OIDC được OpenID Foundation chứng nhận) lo — KHÔNG tự viết:
// nó tự đọc discovery, tự kiểm chữ ký id_token theo JWKS và tự xoay khoá khi nhà cung cấp đổi khoá.
// Phần của app chỉ còn: chọn cấu hình, ràng buộc domain, và nối định danh vào đúng tài khoản cũ.
import * as client from "openid-client";
import type { NextRequest } from "next/server";
import type { DB } from "./store";

export const OIDC_COOKIE = "vaks_oidc";
const DEFAULT_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration";
const DEFAULT_DOMAINS = "truongvietanh.com";
export const SCOPE = "openid email profile"; // KHÔNG xin thêm scope nào khác

export interface OidcConfig {
  discoveryUrl: string; clientId: string; clientSecret: string;
  domains: string[]; source: "app" | "env" | null;
}

export function oidcConfig(db: DB): OidcConfig {
  const appId = (db.settings.googleClientId || "").trim();
  const appSecret = (db.settings.googleClientSecret || "").trim();
  const clientId = appId || (process.env.OIDC_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = appSecret || (process.env.OIDC_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const raw = db.settings.googleDomains ?? process.env.OIDC_ALLOWED_DOMAINS ?? process.env.GOOGLE_DOMAINS ?? DEFAULT_DOMAINS;
  const domains = String(raw).split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  return {
    discoveryUrl: (db.settings.oidcDiscoveryUrl || process.env.OIDC_DISCOVERY_URL || DEFAULT_DISCOVERY).trim(),
    clientId, clientSecret, domains,
    source: clientId && clientSecret ? (appId ? "app" : "env") : null,
  };
}

export const oidcEnabled = (db: DB): boolean => { const c = oidcConfig(db); return !!(c.clientId && c.clientSecret); };

// Nhãn nút trên trang đăng nhập đi theo nhà cung cấp đang khai — đổi sang Hub thì nút tự đổi chữ.
export function providerLabel(cfg: OidcConfig): string {
  try { return new URL(cfg.discoveryUrl).hostname.includes("google") ? "Google" : "tài khoản trường"; }
  catch { return "tài khoản trường"; }
}

// discovery() nhận URL của issuer; nếu khai sẵn đường .well-known thì cắt bớt cho đúng dạng.
function issuerUrl(discoveryUrl: string): URL {
  const u = new URL(discoveryUrl);
  u.pathname = u.pathname.replace(/\/?\.well-known\/openid-configuration\/?$/, "") || "/";
  return u;
}

// Discovery gọi mạng nên nhớ lại theo (discoveryUrl + clientId); đổi cấu hình trong Cài đặt là cache tự rụng.
let cached: { key: string; at: number; config: client.Configuration } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function discover(cfg: OidcConfig): Promise<client.Configuration> {
  const key = `${cfg.discoveryUrl}|${cfg.clientId}|${cfg.clientSecret.slice(-6)}`;
  if (cached && cached.key === key && Date.now() - cached.at < CACHE_MS) return cached.config;
  const config = await client.discovery(issuerUrl(cfg.discoveryUrl), cfg.clientId, cfg.clientSecret);
  cached = { key, at: Date.now(), config };
  return config;
}

export const clearDiscoveryCache = (): void => { cached = null; };

// Địa chỉ công khai của app: sau Cloudflare + Coolify thì req.nextUrl là địa chỉ nội bộ, phải đọc header proxy.
export function originOf(req: NextRequest): string {
  const env = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  if (!host) return req.nextUrl.origin;
  const proto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Địa chỉ quay về — TRUNG LẬP NHÀ CUNG CẤP. Đây là "địa chỉ nhà" của app, không đổi khi chuyển sang Hub.
export const callbackUrl = (origin: string): string => `${origin}/api/auth/oidc/callback`;

export interface Handshake { state: string; verifier: string }
export const packHandshake = (h: Handshake): string => `${h.state}.${h.verifier}`;
export function readHandshake(cookie: string | undefined): Handshake | null {
  const [state, verifier] = String(cookie || "").split(".");
  return state && verifier ? { state, verifier } : null;
}

export async function startLogin(cfg: OidcConfig, origin: string): Promise<{ url: string; handshake: Handshake }> {
  const config = await discover(cfg);
  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const params: Record<string, string> = {
    redirect_uri: callbackUrl(origin), scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  };
  // hd chỉ là GỢI Ý giao diện của Google (mở sẵn tài khoản trường). Hàng rào thật nằm ở checkAudience() phía dưới.
  if (cfg.domains.length === 1) params.hd = cfg.domains[0];
  return { url: client.buildAuthorizationUrl(config, params).href, handshake: { state, verifier } };
}

export interface IdClaims { issuer: string; subject: string; email: string; emailVerified: boolean; name: string; hd?: string }

export async function finishLogin(cfg: OidcConfig, currentUrl: URL, hs: Handshake): Promise<IdClaims> {
  const config = await discover(cfg);
  // Thư viện kiểm chữ ký id_token, iss/aud/exp, state và PKCE. Sai bất kỳ điểm nào là ném lỗi.
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: hs.verifier, expectedState: hs.state,
  });
  const c = tokens.claims();
  if (!c) throw new Error("Nhà cung cấp không trả id_token");
  return {
    issuer: String(c.iss), subject: String(c.sub),
    email: String(c.email || "").trim().toLowerCase(),
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: String(c.name || String(c.email || "").split("@")[0] || "Người dùng"),
    hd: c.hd ? String(c.hd).toLowerCase() : undefined,
  };
}

export const domainOf = (email: string): string => email.split("@")[1] || "";

const isGoogle = (issuer: string): boolean => /(^|\/\/)(accounts\.)?google\.com\/?$/.test(issuer.replace(/^https?:\/\//, "//"));

// BẮT BUỘC 3 của hợp đồng: chặn người ngoài trường ở PHÍA MÁY CHỦ.
// Tham số `hd` lúc chuyển hướng chỉ là gợi ý giao diện — ai có Gmail cũng bấm vào được, hàng rào thật ở đây.
// truongvietanh.com đã xác minh là Google Workspace (MX trỏ về aspmx.l.google.com), nên với Google ta ĐÒI
// claim `hd`: tài khoản do trường cấp luôn có, tài khoản cá nhân thì không. Nhà cung cấp khác (School Data
// Hub sau này) không phát `hd` → lúc đó xét domain của email đã xác thực.
export function checkAudience(cfg: OidcConfig, c: IdClaims): { ok: true } | { ok: false; err: string } {
  if (!c.email) return { ok: false, err: "thieu-email" };
  if (!c.emailVerified) return { ok: false, err: "email-chua-xac-thuc" };
  if (!cfg.domains.length) return { ok: false, err: "chua-cau-hinh" };
  if (isGoogle(c.issuer) && !c.hd) return { ok: false, err: "sai-domain" };   // tài khoản Google cá nhân
  if (c.hd && !cfg.domains.includes(c.hd)) return { ok: false, err: "sai-domain" };
  if (!cfg.domains.includes(domainOf(c.email))) return { ok: false, err: "sai-domain" };
  return { ok: true };
}
