// ── Nhận biết "đang chạy trong khung nhúng của Hub" (chỉ dùng phía trình duyệt) ─────────────────
// Factory là miniapp: khi nằm trong Hub thì nút THOÁT do Hub vẽ ở ngoài khung, còn toàn bộ điều
// hướng NỘI BỘ (sidebar, chuyển màn, tab) vẫn là của Factory — Hub không giới hạn phần đó.
export const HUB_ORIGIN = "https://hub.truongvietanh.com";

export function dangNhung(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.top !== window.self; } catch { return true; } // chặn cross-origin = chắc chắn đang bị nhúng
}

export function guiHub(msg: Record<string, unknown>): void {
  if (!dangNhung()) return;
  try { window.parent.postMessage(msg, HUB_ORIGIN); } catch { /* khung đóng giữa chừng, bỏ qua */ }
}

// Hub tự chỉnh chiều cao khung theo số này, khỏi cuộn hai lớp.
export function baoChieuCao(): void {
  guiHub({ type: "embed:resize", height: document.body.scrollHeight });
}

// Mất phiên khi đang ở trong khung thì KHÔNG được đá sang /login: trang đó có nút đăng nhập Google,
// mà Google chặn hiển thị trong iframe → người dùng nhìn thấy khung trắng. Quay về /embed để bắt tay
// lại với Hub, im lặng và không cần ai bấm gì.
export function diToiTrangDangNhap(): void {
  window.location.href = dangNhung() ? "/embed" : "/login";
}
