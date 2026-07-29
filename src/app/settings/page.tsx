"use client";
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FolderTree, Users, Bot, SlidersHorizontal, Save, UploadCloud, KeyRound, Zap, CheckCircle2, XCircle, Trash2, GraduationCap, LogIn, Link as LinkIcon } from "lucide-react";
import Shell from "@/components/shell";
import { getData, api, Card, PageLoading, Button, Spinner, useToast, cls } from "@/components/ui";
import { Settings, User } from "@/lib/shared";
import { CurriculumPanel } from "@/app/curriculum/page";
import { UsersPanel } from "@/app/users/page";
import { AgentsPanel } from "@/app/agents/page";
import ImportPanel from "@/components/import-panel";

const TABS = [
  { key: "curriculum", label: "Chương trình", icon: FolderTree },
  { key: "import", label: "Nhập & cập nhật", icon: UploadCloud },
  { key: "users", label: "Tài khoản & phân quyền", icon: Users },
  { key: "agents", label: "Xưởng agent AI", icon: Bot },
  { key: "general", label: "Phong cách & chi phí", icon: SlidersHorizontal },
];

// ===== Tab "Chung": Instruction Pack (phong cách trường + quy tắc + trần chi phí) =====
function F({ label, hint, value, onChange, rows = 4, isAdmin }: { label: string; hint: string; value: string; onChange: (v: string) => void; rows?: number; isAdmin: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} disabled={!isAdmin}
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:bg-surface-2" />
    </Card>
  );
}

interface TutorStatus { url: string; email: string; configured: boolean; hasPassword: boolean; hasJwt: boolean }
interface SsoProvider { id: string; label: string; clientId: string; hasSecret: boolean; domains: string; discoveryUrl: string; source: "app" | "env"; sessionMinutes: number }
interface SsoStatus { enabled: boolean; callbackUrl: string; backchannelLogoutUrl: string; providers: SsoProvider[] }
interface SettingsData { settings: Settings; packPreview: string; hasKey: boolean; model: string; keySource: "app" | "env" | null; keyTail: string; tutor: TutorStatus; sso: SsoStatus }

// Model cho dropdown — id model trên OpenRouter (có thể gõ id khác trong tương lai)
const AI_MODELS = [
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro — mạnh nhất (khuyến nghị)" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash — nhanh & siêu rẻ" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2 — ổn định, rẻ" },
];

// ===== Kết nối app Gia sư (tutor): tài khoản teacher tutor để đẩy học liệu Chuẩn trường =====
function TutorCard({ tutor, isAdmin, onSaved }: { tutor: TutorStatus; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const [email, setEmail] = useState(tutor.email);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);

  const save = async () => {
    setBusy("save"); setRes(null);
    try {
      await api("tutorSaveConfig", { email, password: pw || undefined });
      setPw("");
      setRes(await api<{ ok: boolean; message: string }>("tutorTest", {}));
      await onSaved();
    } catch (e) { setRes({ ok: false, message: e instanceof Error ? e.message : "Lỗi" }); }
    setBusy(null);
  };
  const test = async () => {
    setBusy("test"); setRes(null);
    try { setRes(await api<{ ok: boolean; message: string }>("tutorTest", {})); }
    catch (e) { setRes({ ok: false, message: e instanceof Error ? e.message : "Lỗi" }); }
    setBusy(null);
  };

  return (
    <Card className={cls("mt-4 p-4", tutor.configured ? "border-ok-line bg-ok-bg/40" : "border-warn-line bg-warn-bg/40")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><GraduationCap size={16} className={tutor.configured ? "text-ok" : "text-warn"} aria-hidden />Kết nối app Gia sư</p>
        <span className="text-sm text-ink-2">
          {tutor.configured
            ? <>Sẵn sàng đẩy học liệu Chuẩn trường {tutor.hasJwt ? <>bằng <b>JWT dán sẵn</b></> : <>bằng tài khoản <b>{tutor.email}</b></>}</>
            : <>Chưa cấu hình — nhập tài khoản teacher của app Gia sư để bật nút &ldquo;Đẩy sang Gia sư&rdquo; trong Kho học liệu.</>}
        </span>
      </div>
      {isAdmin && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setRes(null); }} placeholder="email teacher tutor…"
              autoComplete="off" spellCheck={false}
              className="w-full max-w-[15rem] rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
            <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setRes(null); }}
              placeholder={tutor.hasPassword ? "Mật khẩu mới (đang có sẵn)" : "mật khẩu…"}
              autoComplete="new-password" spellCheck={false}
              className="w-full max-w-[13rem] rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
            <Button onClick={save} disabled={!!busy || !email.trim() || (!pw && !tutor.hasPassword && !tutor.hasJwt)}>{busy === "save" ? <Spinner /> : <><Save size={15} aria-hidden />Lưu & kiểm tra</>}</Button>
            {tutor.configured && <Button variant="secondary" onClick={test} disabled={!!busy}>{busy === "test" ? <Spinner label="Đang thử…" /> : <><Zap size={15} aria-hidden />Kiểm tra</>}</Button>}
          </div>
          {res && (
            <p className={cls("mt-2 flex items-start gap-1.5 text-sm", res.ok ? "text-ok" : "text-danger")}>
              {res.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden />}
              {res.message}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted">Studio tự đăng nhập Supabase tutor lấy token khi đẩy — mật khẩu lưu trên máy chủ trường, client không nhận lại. Chỉ đẩy được học liệu thuộc gói <b>Chuẩn trường</b>, môn Toán · Hóa · Tiếng Anh · Văn. Host: {tutor.url}</p>
        </>
      )}
    </Card>
  );
}

// ===== Đăng nhập một lần (OIDC) — nhiều nhà cung cấp chạy song song =====
// Factory là miniapp: đích cuối là School Data Hub, Google là đường lùi khi hạ tầng Hub còn tạm.
// Địa chỉ quay về và bảng liên kết định danh dùng CHUNG cho mọi nhà cung cấp, nên thêm/bớt nhà cung
// cấp không ai phải đăng nhập lại từ đầu.
function ProviderRow({ p, onSaved }: { p: SsoProvider; onSaved: () => Promise<void> }) {
  const [clientId, setClientId] = useState(p.clientId);
  const [secret, setSecret] = useState("");
  const [domains, setDomains] = useState(p.domains);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  const isGoogle = p.id === "google";

  const save = async () => {
    setBusy("save"); setRes(null);
    try {
      await api("saveSso", { id: p.id, clientId, clientSecret: secret || undefined, domains, discoveryUrl: p.discoveryUrl, label: p.label });
      setSecret("");
      setRes({ ok: true, message: "Đã lưu — có hiệu lực ngay, không cần khởi động lại." });
      await onSaved();
    } catch (e) { setRes({ ok: false, message: e instanceof Error ? e.message : "Lỗi" }); }
    setBusy(null);
  };
  const clear = async () => {
    setBusy("clear"); setRes(null);
    try {
      await api("saveSso", { id: p.id, clientId: "", clientSecret: "" });
      setClientId(""); setSecret("");
      setRes({ ok: true, message: `Đã tắt lối đăng nhập ${p.label}.` });
      await onSaved();
    } catch (e) { setRes({ ok: false, message: e instanceof Error ? e.message : "Lỗi" }); }
    setBusy(null);
  };

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">{p.label}</p>
        <span className="text-xs text-muted">
          {p.domains ? <>chỉ nhận email <b className="text-ink-2">@{p.domains}</b></> : <>nhà cung cấp tự bảo đảm người của trường</>}
          {" · "}phiên {p.sessionMinutes >= 1440 ? `${Math.round(p.sessionMinutes / 1440)} ngày` : `${p.sessionMinutes} phút`}
          {" · "}cấu hình {p.source === "app" ? "trong app" : "từ biến môi trường"}
        </span>
      </div>
      <p className="mt-1 truncate font-mono text-[11px] text-muted">{p.discoveryUrl}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input value={clientId} onChange={(e) => { setClientId(e.target.value); setRes(null); }}
          placeholder={isGoogle ? "Client ID …apps.googleusercontent.com" : "client_id"}
          autoComplete="off" spellCheck={false}
          className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-brand" />
        <input type="password" value={secret} onChange={(e) => { setSecret(e.target.value); setRes(null); }}
          placeholder={p.hasSecret ? "Client secret mới (đang có sẵn)" : "Client secret…"}
          autoComplete="new-password" spellCheck={false}
          className="w-full max-w-[15rem] rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-brand" />
        {isGoogle && (
          <input value={domains} onChange={(e) => { setDomains(e.target.value); setRes(null); }} placeholder="truongvietanh.com"
            autoComplete="off" spellCheck={false}
            className="w-full max-w-[13rem] rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
        )}
        <Button onClick={save} disabled={!!busy || !clientId.trim() || (!secret && !p.hasSecret)}>{busy === "save" ? <Spinner /> : <><Save size={15} aria-hidden />Lưu</>}</Button>
        {p.source === "app" && <Button variant="ghost" onClick={clear} disabled={!!busy}>{busy === "clear" ? <Spinner /> : <><Trash2 size={15} aria-hidden />Tắt</>}</Button>}
      </div>
      {res && (
        <p className={cls("mt-2 flex items-start gap-1.5 text-sm", res.ok ? "text-ok" : "text-danger")}>
          {res.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden />}
          {res.message}
        </p>
      )}
      {!isGoogle && (
        <p className="mt-2 text-[11px] text-muted">
          Nhà cung cấp này không phát email, nên người <b>đã có tài khoản</b> phải tự nối: đăng nhập như thường rồi bấm liên kết bên dưới.
          Ai chưa có tài khoản sẽ được mở tài khoản Giáo viên mới.
        </p>
      )}
      <p className="mt-2 text-[11px]">
        <a href={`/api/auth/oidc?p=${encodeURIComponent(p.id)}&link=1`}
          className="inline-flex items-center gap-1.5 font-medium text-brand underline decoration-dotted underline-offset-2 hover:text-brand-ink">
          <LinkIcon size={12} aria-hidden />Liên kết tài khoản của tôi với {p.label}
        </a>
        <span className="ml-2 text-muted">gắn định danh {p.label} vào chính tài khoản bạn đang dùng</span>
      </p>
    </div>
  );
}

function SsoCard({ sso, isAdmin, onSaved }: { sso: SsoStatus; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const [copied, setCopied] = useState("");
  const copy = (what: string, value: string) => {
    navigator.clipboard?.writeText(value); setCopied(what); setTimeout(() => setCopied(""), 2000);
  };
  return (
    <Card className={cls("mt-4 p-4", sso.enabled ? "border-ok-line bg-ok-bg/40" : "border-warn-line bg-warn-bg/40")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><LogIn size={16} className={sso.enabled ? "text-ok" : "text-warn"} aria-hidden />Đăng nhập một lần</p>
        <span className="text-sm text-ink-2">
          {sso.enabled
            ? <>Đang bật {sso.providers.length} lối: {sso.providers.map((p) => p.label).join(" · ")}. Đăng nhập bằng mật khẩu vẫn chạy song song.</>
            : <>Chưa bật — giáo viên phải nhớ mật khẩu riêng.</>}
        </span>
      </div>
      {isAdmin && (
        <>
          {sso.providers.map((p) => <ProviderRow key={p.id} p={p} onSaved={onSaved} />)}
          <div className="mt-3 space-y-1 text-[11px] text-muted">
            <p>Hai địa chỉ phải nộp khi đăng ký app với nhà cung cấp (bấm để chép):</p>
            {([["Địa chỉ quay về", sso.callbackUrl], ["Đăng xuất từ xa", sso.backchannelLogoutUrl]] as const).map(([ten, url]) => (
              <p key={ten}>
                {ten}:{" "}
                <button type="button" onClick={() => copy(ten, url)}
                  className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink-2 underline decoration-dotted underline-offset-2 transition hover:text-ink">{url}</button>
                {copied === ten ? <b className="ml-1 text-ok">đã chép</b> : null}
              </p>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function GeneralPanel({ me }: { me: User | null }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [modelSel, setModelSel] = useState("");
  const [aiBusy, setAiBusy] = useState<"test" | "save" | "clear" | null>(null);
  const [testRes, setTestRes] = useState<{ ok: boolean; model: string; error?: string } | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    getData<SettingsData>("settings").then((d) => { setData(d); setS(d.settings); setModelSel(d.model); }).catch(() => {});
  }, []);

  if (!data || !s) return <PageLoading />;
  const isAdmin = me?.role === "admin";

  const save = async () => {
    setBusy(true);
    try { await api("saveSettings", { settings: s }); show("Đã lưu Instruction Pack — mọi lượt sinh tiếp theo dùng bản mới"); }
    catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  // chỉ làm mới phần trạng thái kết nối — KHÔNG đè bản nháp textarea đang sửa dở
  const refreshStatus = () => getData<SettingsData>("settings").then((d) => setData(d)).catch(() => {});

  const testKey = async () => {
    setAiBusy("test"); setTestRes(null);
    try { setTestRes(await api<{ ok: boolean; model: string; error?: string }>("testAiKey", { key: keyInput || undefined, model: modelSel })); }
    catch (e) { setTestRes({ ok: false, model: modelSel, error: e instanceof Error ? e.message : "Lỗi" }); }
    setAiBusy(null);
  };
  const saveKey = async () => {
    setAiBusy("save");
    try {
      await api("saveAiKey", { key: keyInput || undefined, model: modelSel });
      setKeyInput(""); setTestRes(null);
      show("Đã lưu kết nối OpenRouter — có hiệu lực ngay, không cần khởi động lại");
      await refreshStatus();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setAiBusy(null);
  };
  const clearKey = async () => {
    setAiBusy("clear");
    try {
      await api("saveAiKey", { key: "" });
      setKeyInput(""); setTestRes(null);
      show("Đã gỡ key khỏi app");
      await refreshStatus();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setAiBusy(null);
  };

  return (
    <div className="fade-up">
      {toast}
      <p className="max-w-2xl text-sm text-ink-2">
        AI không nhận một &ldquo;prompt&rdquo; trần — mỗi lượt sinh được đóng gói: <b>tri thức</b> (gói + vị trí trong cây) + <b>phong cách trường</b> + <b>quy tắc khối lớp</b> + <b>schema đầu ra</b>. Sửa ở đây là đổi giọng của toàn bộ dây chuyền.
      </p>
      <Card className={cls("mt-4 p-4", data.hasKey ? "border-ok-line bg-ok-bg/40" : "border-warn-line bg-warn-bg/40")}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink"><KeyRound size={16} className={data.hasKey ? "text-ok" : "text-warn"} aria-hidden />Kết nối OpenRouter (DeepSeek)</p>
          <span className="text-sm text-ink-2">
            {data.hasKey
              ? <>Đang dùng <b>AI thật</b> · model <b>{data.model}</b> · key {data.keySource === "app" ? "lưu trong app" : "từ biến môi trường"}{data.keyTail ? <> (…{data.keyTail})</> : null}</>
              : <>Đang chạy <b>bộ soạn mô phỏng</b> — nội dung chỉ là khung. Dán API key để AI viết nội dung thật.</>}
          </span>
        </div>
        {isAdmin && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="password" value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setTestRes(null); }}
                placeholder={data.hasKey ? `Dán key mới để thay (đang dùng …${data.keyTail})` : "sk-or-v1-…"}
                autoComplete="off" spellCheck={false}
                className="w-full max-w-sm rounded-md border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-brand" />
              <select value={modelSel} onChange={(e) => { setModelSel(e.target.value); setTestRes(null); }}
                className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand">
                {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                {!AI_MODELS.some((m) => m.id === modelSel) && modelSel && <option value={modelSel}>{modelSel}</option>}
              </select>
              <Button variant="secondary" onClick={testKey} disabled={!!aiBusy}>{aiBusy === "test" ? <Spinner label="Đang gọi thử…" /> : <><Zap size={15} aria-hidden />Kiểm tra</>}</Button>
              <Button onClick={saveKey} disabled={!!aiBusy || (!keyInput && modelSel === data.model)}>{aiBusy === "save" ? <Spinner /> : <><Save size={15} aria-hidden />Lưu kết nối</>}</Button>
              {data.keySource === "app" && (
                <Button variant="ghost" onClick={clearKey} disabled={!!aiBusy}>{aiBusy === "clear" ? <Spinner /> : <><Trash2 size={15} aria-hidden />Gỡ key</>}</Button>
              )}
            </div>
            {testRes && (
              <p className={cls("mt-2 flex items-start gap-1.5 text-sm", testRes.ok ? "text-ok" : "text-danger")}>
                {testRes.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden /> : <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden />}
                {testRes.ok ? <>Kết nối OK — model phản hồi: <b>{testRes.model}</b>. Bấm &ldquo;Lưu kết nối&rdquo; để dùng.</> : <>Không kết nối được: {testRes.error}</>}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">Key lưu trong dữ liệu app trên máy chủ trường (chỉ quản trị thấy trang này; client chỉ nhận 4 ký tự cuối). Có hiệu lực ngay — không cần khởi động lại. Lấy key tại openrouter.ai/keys.</p>
          </>
        )}
      </Card>
      <TutorCard tutor={data.tutor} isAdmin={isAdmin} onSaved={refreshStatus} />
      <SsoCard sso={data.sso} isAdmin={isAdmin} onSaved={refreshStatus} />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <F label="Phong cách trường (Style Guide)" hint="Giọng văn, xưng hô, kiểu ví dụ, thuật ngữ" value={s.styleGuide} onChange={(v) => setS({ ...s, styleGuide: v })} rows={5} isAdmin={isAdmin} />
          <F label="Quy tắc khối lớp" hint="Giới hạn độ khó, độ dài, ký hiệu theo từng khối" value={s.gradeRules} onChange={(v) => setS({ ...s, gradeRules: v })} isAdmin={isAdmin} />
          <F label="Triết lý giáo dục" hint="Kim chỉ nam xuyên suốt mọi nội dung" value={s.philosophy} onChange={(v) => setS({ ...s, philosophy: v })} rows={3} isAdmin={isAdmin} />
          <Card className="p-4">
            <p className="text-sm font-semibold text-ink">Trần chi phí AI mỗi tháng (USD)</p>
            <input type="number" value={s.monthlyBudgetUsd} disabled={!isAdmin} onChange={(e) => setS({ ...s, monthlyBudgetUsd: Number(e.target.value) || 0 })}
              className="mt-2 w-40 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand disabled:bg-surface-2" />
          </Card>
          {isAdmin && <Button onClick={save} disabled={busy}><Save size={16} strokeWidth={1.75} aria-hidden /> Lưu Instruction Pack</Button>}
        </div>
        <Card className="p-4 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-semibold text-ink">Xem trước gói lệnh gửi AI</p>
          <p className="mb-2 text-xs text-muted">Ví dụ với một nguyên tử thật trong cây</p>
          <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-md bg-ink p-4 font-mono text-xs leading-relaxed text-on-brand/85 scrollthin">{data.packPreview}</pre>
        </Card>
      </div>
    </div>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  useEffect(() => { getData<{ user: User }>("me").then((d) => setMe(d.user)).catch(() => {}); }, []);
  const tab = params.get("tab") || "curriculum";
  const setTab = (k: string) => router.replace(`/settings?tab=${k}`);

  return (
    <Shell user={me}>
      <div className="fade-up">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={22} strokeWidth={1.75} className="text-brand" aria-hidden />
          <h1 className="font-display text-2xl font-semibold text-ink">Cài đặt &amp; quản trị</h1>
        </div>
        <div className="mt-4 flex flex-wrap gap-0.5 overflow-x-auto border-b border-line scrollthin">
          {TABS.map((t) => {
            const active = tab === t.key; const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cls("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
                  active ? "border-brand text-brand" : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink")}>
                <Icon size={16} strokeWidth={active ? 2 : 1.75} aria-hidden /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-5">
          {tab === "curriculum" && <CurriculumPanel />}
          {tab === "import" && <ImportPanel />}
          {tab === "users" && <UsersPanel me={me} />}
          {tab === "agents" && <AgentsPanel />}
          {tab === "general" && <GeneralPanel me={me} />}
        </div>
      </div>
    </Shell>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<Shell user={null}><PageLoading /></Shell>}><SettingsInner /></Suspense>;
}
