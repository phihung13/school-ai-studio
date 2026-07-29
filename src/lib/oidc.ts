// ── Đăng nhập một lần (OpenID Connect) — nhiều nhà cung cấp chạy SONG SONG ──────────────────────
// Factory là MINIAPP trong hệ sinh thái Trường Việt Anh. Đích cuối là School Data Hub (super app);
// Google Workspace là đường lùi trong lúc hạ tầng Hub còn tạm. Đăng nhập bằng mật khẩu vẫn giữ.
//
// Giao thức do `openid-client` (thư viện OIDC được OpenID Foundation chứng nhận) lo — KHÔNG tự viết:
// nó đọc discovery, kiểm chữ ký id_token theo JWKS và tự xoay khoá. Phần của app chỉ còn: chọn nhà
// cung cấp, ràng buộc ai được vào, và nối định danh vào đúng tài khoản.
//
// KHÁC BIỆT CỐT LÕI GIỮA HAI NHÀ CUNG CẤP (quyết định gần hết thiết kế bên dưới):
//   Google → scope "openid email profile", có email + claim hd → lọc theo domain, nối theo email.
//   Hub    → scope "openid profile", claims chỉ có sub/name/hub_role/sid — KHÔNG CÓ EMAIL.
//            Không lọc domain (Hub đã xác thực người của trường), và không thể nối theo email:
//            phải khoá thuần theo (issuer, sub), người có sẵn tài khoản thì dùng nút Liên kết.
import * as client from "openid-client";
import type { NextRequest } from "next/server";
import type { DB } from "./store";
import type { OidcProviderConfig } from "./shared";

export const OIDC_COOKIE = "vaks_oidc";
export const LAST_PROVIDER_COOKIE = "vaks_idp";     // gợi ý gia hạn im lặng, không phải dữ liệu nhạy cảm
const GOOGLE_DISCOVERY = "https://accounts.google.com/.well-known/openid-configuration";
const DEFAULT_DOMAINS = "truongvietanh.com";
export const DEFAULT_SESSION_MINUTES = 60 * 24 * 7;  // đường mật khẩu/Google: 7 ngày như trước

export interface Provider extends OidcProviderConfig { domainList: string[]; source: "app" | "env" }

function parseDomains(raw: string | undefined): string[] {
  return String(raw ?? "").split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

// Danh sách nhà cung cấp đang bật. "google" dựng sẵn từ các trường googleClientId/Secret/Domains
// (giữ nguyên khuôn cũ để bản đang chạy không gãy); các nhà cung cấp khác nằm trong settings.oidcProviders
// hoặc biến môi trường HUB_* / OIDC_*.
export function providers(db: DB): Provider[] {
  const out: Provider[] = [];

  const gId = (db.settings.googleClientId || "").trim() || (process.env.OIDC_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const gSecret = (db.settings.googleClientSecret || "").trim() || (process.env.OIDC_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
  if (gId && gSecret) {
    out.push({
      id: "google", label: "Google",
      discoveryUrl: (db.settings.oidcDiscoveryUrl || process.env.OIDC_DISCOVERY_URL || GOOGLE_DISCOVERY).trim(),
      clientId: gId, clientSecret: gSecret, scope: "openid email profile",
      domains: db.settings.googleDomains ?? process.env.OIDC_ALLOWED_DOMAINS ?? DEFAULT_DOMAINS,
      domainList: parseDomains(db.settings.googleDomains ?? process.env.OIDC_ALLOWED_DOMAINS ?? DEFAULT_DOMAINS),
      source: (db.settings.googleClientId || "").trim() ? "app" : "env",
      sessionMinutes: DEFAULT_SESSION_MINUTES,
    });
  }

  for (const p of db.settings.oidcProviders ?? []) {
    if (!p?.id || !p.clientId || !p.clientSecret || !p.discoveryUrl) continue;
    if (out.some((x) => x.id === p.id)) continue;
    out.push({ ...p, domainList: parseDomains(p.domains), source: "app" });
  }

  // Hub khai bằng biến môi trường (tiện cho lần dựng đầu, trước khi có UI)
  const hubId = (process.env.HUB_CLIENT_ID || "").trim();
  const hubSecret = (process.env.HUB_CLIENT_SECRET || "").trim();
  if (hubId && hubSecret && !out.some((x) => x.id === "hub")) {
    out.push({
      id: "hub", label: "tài khoản trường",
      discoveryUrl: (process.env.HUB_DISCOVERY_URL || "https://hub.truongvietanh.com/.well-known/openid-configuration").trim(),
      clientId: hubId, clientSecret: hubSecret, scope: "openid profile",
      domains: "", domainList: [], source: "env", sessionMinutes: 15,
    });
  }
  return out;
}

export const providerById = (db: DB, id: string): Provider | undefined => providers(db).find((p) => p.id === id);
export const oidcEnabled = (db: DB): boolean => providers(db).length > 0;
export const sessionMinutes = (p: Provider | undefined): number => p?.sessionMinutes || DEFAULT_SESSION_MINUTES;

// discovery() nhận URL của issuer; khai sẵn đường .well-known thì cắt bớt cho đúng dạng.
function issuerUrl(discoveryUrl: string): URL {
  const u = new URL(discoveryUrl);
  u.pathname = u.pathname.replace(/\/?\.well-known\/openid-configuration\/?$/, "") || "/";
  return u;
}

// Discovery gọi mạng nên nhớ lại theo (discoveryUrl + clientId); đổi cấu hình là cache tự rụng.
const cache = new Map<string, { at: number; config: client.Configuration }>();
const CACHE_MS = 10 * 60 * 1000;

export async function discover(p: Provider): Promise<client.Configuration> {
  const key = `${p.discoveryUrl}|${p.clientId}|${p.clientSecret.slice(-6)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.config;
  const config = await client.discovery(issuerUrl(p.discoveryUrl), p.clientId, p.clientSecret);
  cache.set(key, { at: Date.now(), config });
  return config;
}

export const clearDiscoveryCache = (): void => { cache.clear(); };

// Địa chỉ công khai của app: sau Cloudflare + Coolify thì req.nextUrl là địa chỉ NỘI BỘ, phải đọc header proxy.
export function originOf(req: NextRequest): string {
  const env = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim();
  if (!host) return req.nextUrl.origin;
  const proto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// MỘT địa chỉ quay về cho MỌI nhà cung cấp — trung lập, không mang tên hãng nào. Đây là "địa chỉ nhà"
// của app: đã khai với Google, sẽ khai với Hub, và không đổi khi thêm nhà cung cấp thứ ba.
export const callbackUrl = (origin: string): string => `${origin}/api/auth/oidc/callback`;
export const backchannelLogoutUrl = (origin: string): string => `${origin}/api/auth/oidc/backchannel-logout`;

// Lượt bắt tay nhớ luôn NHÀ CUNG CẤP (callback dùng chung nên phải biết mình đang trả lời ai),
// và ý định: đăng nhập mới hay nối định danh vào tài khoản đang mở.
export interface Handshake { state: string; verifier: string; providerId: string; linkTo?: string }
export const packHandshake = (h: Handshake): string =>
  [h.state, h.verifier, h.providerId, h.linkTo ?? ""].join("|");
export function readHandshake(cookie: string | undefined): Handshake | null {
  const [state, verifier, providerId, linkTo] = String(cookie || "").split("|");
  return state && verifier && providerId ? { state, verifier, providerId, linkTo: linkTo || undefined } : null;
}

export async function startLogin(
  p: Provider, origin: string, opts: { linkTo?: string; silent?: boolean } = {},
): Promise<{ url: string; handshake: Handshake }> {
  const config = await discover(p);
  const verifier = client.randomPKCECodeVerifier();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const state = client.randomState();
  const params: Record<string, string> = {
    redirect_uri: callbackUrl(origin), scope: p.scope || "openid profile", state,
    code_challenge: challenge, code_challenge_method: "S256",
  };
  // `prompt` KHÔNG phải chỗ để đoán: Hub trả invalid_request cho "select_account" (nó chỉ nhận
  // login/consent/none theo OIDC core). Chỉ xin select_account khi nhà cung cấp khai là hỗ trợ,
  // hoặc khi đó là Google — nơi ta đã biết chắc. "none" thì mọi nhà cung cấp OIDC đều phải nhận.
  const supported = config.serverMetadata().prompt_values_supported as string[] | undefined;
  if (opts.silent) params.prompt = "none";
  else if (supported ? supported.includes("select_account") : p.id === "google") params.prompt = "select_account";
  // hd chỉ là GỢI Ý giao diện của Google (mở sẵn tài khoản trường). Hàng rào thật ở checkAudience().
  if (p.id === "google" && p.domainList.length === 1) params.hd = p.domainList[0];
  return {
    url: client.buildAuthorizationUrl(config, params).href,
    handshake: { state, verifier, providerId: p.id, linkTo: opts.linkTo },
  };
}

export interface IdClaims {
  issuer: string; subject: string; name: string;
  email?: string; emailVerified: boolean; hd?: string; sid?: string; role?: string; idToken?: string;
}

export async function finishLogin(p: Provider, currentUrl: URL, hs: Handshake): Promise<IdClaims> {
  const config = await discover(p);
  // Thư viện kiểm chữ ký id_token, iss/aud/exp, state và PKCE. Sai bất kỳ điểm nào là ném lỗi.
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: hs.verifier, expectedState: hs.state,
  });
  const c = tokens.claims();
  if (!c) throw new Error("Nhà cung cấp không trả id_token");
  const email = String(c.email || "").trim().toLowerCase();
  return {
    issuer: String(c.iss), subject: String(c.sub),
    name: String(c.name || email.split("@")[0] || "Người dùng"),
    email: email || undefined,
    emailVerified: c.email_verified === true || c.email_verified === "true",
    hd: c.hd ? String(c.hd).toLowerCase() : undefined,
    sid: c.sid ? String(c.sid) : undefined,
    role: c.hub_role ? String(c.hub_role) : undefined,
    idToken: tokens.id_token,
  };
}

export const domainOf = (email: string): string => (email.split("@")[1] || "");
const isGoogle = (issuer: string): boolean => /(^|\/\/)(accounts\.)?google\.com\/?$/.test(issuer.replace(/^https?:\/\//, "//"));

// Ai được vào — kiểm ở PHÍA MÁY CHỦ.
//  · Nhà cung cấp KHÔNG khai domain (Hub): đã xác thực người của trường rồi, và không phát email
//    nên chẳng có gì để lọc → cho qua.
//  · Google: đòi email đã xác thực + đúng domain, và vì truongvietanh.com là Google Workspace nên
//    BẮT BUỘC có claim hd — tài khoản Google cá nhân không có hd, chặn được kẻ mạo danh địa chỉ.
export function checkAudience(p: Provider, c: IdClaims): { ok: true } | { ok: false; err: string } {
  if (!p.domainList.length) return { ok: true };
  if (!c.email) return { ok: false, err: "thieu-email" };
  if (!c.emailVerified) return { ok: false, err: "email-chua-xac-thuc" };
  if (isGoogle(c.issuer) && !c.hd) return { ok: false, err: "sai-domain" };
  if (c.hd && !p.domainList.includes(c.hd)) return { ok: false, err: "sai-domain" };
  if (!p.domainList.includes(domainOf(c.email))) return { ok: false, err: "sai-domain" };
  return { ok: true };
}

// Địa chỉ đăng xuất phía nhà cung cấp — bấm Đăng xuất trong app phải kết thúc CẢ phiên bên đó,
// nếu không lần bấm đăng nhập kế tiếp sẽ vào lại im lặng và người dùng tưởng chưa thoát được.
export async function endSessionUrl(p: Provider, origin: string, idToken?: string): Promise<string | null> {
  try {
    const config = await discover(p);
    const meta = config.serverMetadata();
    if (!meta.end_session_endpoint) return null;
    const u = new URL(meta.end_session_endpoint);
    if (idToken) u.searchParams.set("id_token_hint", idToken);
    u.searchParams.set("client_id", p.clientId);
    u.searchParams.set("post_logout_redirect_uri", `${origin}/login`);
    return u.href;
  } catch { return null; }
}
