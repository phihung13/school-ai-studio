"use client";
import React, { useEffect, useState } from "react";
import { User as UserIcon, ShieldCheck, Settings2, GraduationCap, Plus, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { getData, api, Card, Button, Modal, PageLoading, LoadError, Empty, useToast, cls } from "@/components/ui";
import { User, Role, ROLE_LABEL } from "@/lib/shared";

interface UsersData { users: User[]; counts: Record<Role, number>; subjects: string[] }

const ROLES: Role[] = ["teacher", "lead", "admin", "principal"];

const ROLE_ICON: Record<Role, LucideIcon> = {
  teacher: UserIcon, lead: ShieldCheck, admin: Settings2, principal: GraduationCap,
};
const ROLE_BADGE: Record<Role, string> = {
  teacher: "bg-brand-bg text-brand-ink",
  lead: "bg-info-bg text-info",
  admin: "bg-warn-bg text-warn",
  principal: "bg-brass-bg text-brass-ink",
};
const AVATAR_TINT: Record<Role, string> = {
  teacher: "bg-brand-bg text-brand-ink",
  lead: "bg-info-bg text-info",
  admin: "bg-warn-bg text-warn",
  principal: "bg-brass-bg text-brass-ink",
};

function initial(name: string) { return name.split(" ").pop()?.[0]?.toUpperCase() || "?"; }

interface FormState { name: string; role: Role; subject: string; id: string; email: string; password: string }
const EMPTY_FORM: FormState = { name: "", role: "teacher", subject: "", id: "", email: "", password: "" };

export function UsersPanel({ me }: { me: User | null }) {
  const [data, setData] = useState<UsersData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, show] = useToast();

  // modal tạo mới
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);
  // modal sửa
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = () => getData<UsersData>("users").then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Lỗi"));

  useEffect(() => { load(); }, []);

  if (err) return <LoadError msg={err} />;
  if (!data) return <PageLoading />;

  const openCreate = () => { setCreateForm(EMPTY_FORM); setCreateOpen(true); };
  const openEdit = (u: User) => { setEditing(u); setEditForm({ name: u.name, role: u.role, subject: u.subject || "", id: u.id, email: u.email || "", password: "" }); };

  const submitCreate = async () => {
    if (!createForm.name.trim()) { show("Nhập tên", "err"); return; }
    setBusy(true);
    try {
      await api("userCreate", {
        name: createForm.name.trim(), role: createForm.role,
        subject: createForm.subject.trim() || undefined, id: createForm.id.trim() || undefined,
        email: createForm.email.trim() || undefined, password: createForm.password.trim() || undefined,
      });
      show("Đã tạo tài khoản");
      setCreateOpen(false);
      await load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  const submitEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim()) { show("Nhập tên", "err"); return; }
    setBusy(true);
    try {
      await api("userUpdate", {
        id: editing.id, name: editForm.name.trim(), role: editForm.role,
        subject: editForm.subject.trim(), email: editForm.email.trim(),
        ...(editForm.password.trim() ? { password: editForm.password.trim() } : {}),
      });
      show("Đã cập nhật");
      setEditing(null);
      await load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
    setBusy(false);
  };

  const remove = async (u: User) => {
    if (!window.confirm(`Xoá tài khoản “${u.name}” (${u.id})? Không thể hoàn tác.`)) return;
    try {
      await api("userDelete", { id: u.id });
      show("Đã xoá tài khoản");
      await load();
    } catch (e) { show(e instanceof Error ? e.message : "Lỗi", "err"); }
  };

  const subjectOptions = data.subjects;

  return (
    <>
      {toast}
      <div className="fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">Người dùng &amp; phân quyền</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">Tạo tài khoản và cấp quyền cho giáo viên, tổ trưởng, quản trị và BGH.</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} strokeWidth={2} aria-hidden /> Tạo tài khoản</Button>
        </div>

        {/* Thẻ đếm theo vai trò */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ROLES.map((r) => {
            const Icon = ROLE_ICON[r];
            return (
              <Card key={r} className="flex items-center gap-3 p-4">
                <span className={cls("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", ROLE_BADGE[r])}>
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-muted">{ROLE_LABEL[r]}</p>
                  <p className="font-display text-3xl font-semibold text-ink">{data.counts[r] ?? 0}</p>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bảng người dùng */}
        <h2 className="mt-8 mb-3 font-display text-lg font-semibold text-ink">Tất cả người dùng</h2>
        {data.users.length === 0 ? (
          <Empty icon={<UserIcon size={44} strokeWidth={1.25} />} title="Chưa có tài khoản nào" hint="Bấm “Tạo tài khoản” để thêm người dùng đầu tiên." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Tên</th>
                  <th className="px-4 py-2.5 font-medium">Vai trò</th>
                  <th className="px-4 py-2.5 font-medium">Môn</th>
                  <th className="w-px px-4 py-2.5 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className={cls("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", AVATAR_TINT[u.role])}>
                          {initial(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{u.name}{me && u.id === me.id && <span className="ml-1.5 text-[11px] font-normal text-muted">(bạn)</span>}</p>
                          <p className="truncate font-mono text-[11px] text-muted">{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cls("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", ROLE_BADGE[u.role])}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{u.subject || <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="secondary" onClick={() => openEdit(u)} className="px-2.5 py-1.5"><Pencil size={14} strokeWidth={1.75} aria-hidden /> Sửa</Button>
                        <Button variant="danger" onClick={() => remove(u)} className="px-2.5 py-1.5"><Trash2 size={14} strokeWidth={1.75} aria-hidden /> Xoá</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Modal tạo tài khoản */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo tài khoản">
        <UserForm form={createForm} setForm={setCreateForm} subjects={subjectOptions} showId />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Huỷ</Button>
          <Button onClick={submitCreate} disabled={busy}><Plus size={16} strokeWidth={2} aria-hidden /> Tạo tài khoản</Button>
        </div>
      </Modal>

      {/* Modal sửa tài khoản */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Sửa “${editing.name}”` : "Sửa tài khoản"}>
        <UserForm form={editForm} setForm={setEditForm} subjects={subjectOptions} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditing(null)}>Huỷ</Button>
          <Button onClick={submitEdit} disabled={busy}><Pencil size={16} strokeWidth={1.75} aria-hidden /> Lưu thay đổi</Button>
        </div>
      </Modal>
    </>
  );
}

// Route cũ /users → chuyển vào tab trong trang Cài đặt
export default function UsersRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?tab=users"); }, [router]);
  return null;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputCls = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition focus:border-brand";

function UserForm({ form, setForm, subjects, showId }: {
  form: FormState; setForm: (f: FormState) => void; subjects: string[]; showId?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Tên">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="VD: Nguyễn Thị Lan" className={inputCls} />
      </Field>
      <Field label="Vai trò">
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} className={inputCls}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </Field>
      <Field label="Môn" hint="tuỳ chọn">
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
          list="subject-options" placeholder="VD: Toán" className={inputCls} />
        <datalist id="subject-options">
          {subjects.map((s) => <option key={s} value={s} />)}
        </datalist>
      </Field>
      {showId && (
        <Field label="Mã đăng nhập" hint="tuỳ chọn — bỏ trống sẽ tự sinh từ tên">
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })}
            placeholder="VD: nguyen.thi.lan" className={cls(inputCls, "font-mono")} />
        </Field>
      )}
      <Field label="Email" hint="tuỳ chọn — có thể dùng để đăng nhập">
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="vd: lan@truongvietanh.com" className={inputCls} />
      </Field>
      <Field label="Mật khẩu" hint={showId ? "bỏ trống → dùng mật khẩu demo chung" : "để trống nếu không đổi"}>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="••••••••" className={inputCls} autoComplete="new-password" />
      </Field>
    </div>
  );
}
