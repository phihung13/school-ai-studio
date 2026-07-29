// ── Gửi sự kiện nghiệp vụ về School Data Hub (Đường B — cổng nhận chung) ────────────────────────
// Bản TÓM TẮT gửi song song để Hub có bức tranh toàn trường; dữ liệu chi tiết vẫn nằm nguyên trong
// DB của Factory. Không phải đồng bộ hai chiều, Hub không thành nơi lưu chính.
//
// Ba luật tự đặt cho mình, vì chúng dễ vi phạm trong lúc vội:
//  1. external_id phải SINH LẠI GIỐNG HỆT cho cùng một sự kiện (băm từ id bản ghi + phiên bản +
//     loại sự kiện). Sinh ngẫu nhiên là mất hết tác dụng chống trùng của Hub.
//  2. Fire-and-forget: Hub tắt hay mạng chậm KHÔNG được làm chậm hay hỏng thao tác của giáo viên.
//  3. Không gửi gì dính học sinh. Factory là rổ Xanh; ngày nào Factory chạm dữ liệu học sinh thì
//     phải dừng và báo Hub trước.
import crypto from "crypto";
import { getDB } from "./store";
import type { DB } from "./store";

const HUB_WEBHOOK = process.env.HUB_WEBHOOK_URL || "https://hub.truongvietanh.com/api/embed/webhook";
const APP_NAME = process.env.HUB_EMBED_APP || "factory";
// Secret nhập trong Cai dat (uu tien) hoac bien moi truong — giong khuon key AI/Google,
// de doi khong phai deploy lai.
const secretNow = (): string => (getDB().settings.hubEmbedSecret || "").trim() || (process.env.HUB_EMBED_SECRET || "").trim();
const HUB_ISSUER = process.env.HUB_ISSUER || "https://hub.truongvietanh.com";

export const hubEventsOn = (): boolean => !!secretNow();

// actor là "sub" bên Hub, không phải id nội bộ. Người đăng nhập bằng mật khẩu/Google mà chưa liên
// kết Hub thì KHÔNG có sub — để trống còn hơn bịa ra một mã Hub không tồn tại.
export function hubSubOf(db: DB, userId: string): string | undefined {
  return (db.identityLinks ?? []).find((l) => l.userId === userId && l.issuer.replace(/\/+$/, "") === HUB_ISSUER.replace(/\/+$/, ""))?.subject;
}

export const eventId = (...phan: (string | number)[]): string =>
  crypto.createHash("sha1").update([APP_NAME, ...phan].join("|")).digest("hex").slice(0, 32);

export interface HubEvent {
  externalId: string; eventType: string; actorUserId?: string; payload: Record<string, unknown>;
}

// Hàng đợi nhẹ + gửi tuần tự: một lượt duyệt gói có thể phát vài sự kiện, không mở vài kết nối cùng lúc.
const hangDoi: HubEvent[] = [];
let dangGui = false;

async function xaHangDoi(): Promise<void> {
  if (dangGui) return;
  dangGui = true;
  try {
    while (hangDoi.length) {
      const ev = hangDoi.shift()!;
      try {
        const res = await fetch(HUB_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-embed-app": APP_NAME, "x-embed-secret": secretNow() },
          body: JSON.stringify({
            external_id: ev.externalId, event_type: ev.eventType,
            actor_user_id: ev.actorUserId, payload: ev.payload,
          }),
          signal: AbortSignal.timeout(8000), // Hub đang chạy hạ tầng tạm — treo thì bỏ, đừng giữ tiến trình
        });
        if (!res.ok) console.error(`[hub-events] ${ev.eventType} → ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
      } catch (e) {
        console.error(`[hub-events] ${ev.eventType} không gửi được:`, e instanceof Error ? e.message : e);
      }
    }
  } finally { dangGui = false; }
}

export function sendHubEvent(ev: HubEvent): void {
  if (!hubEventsOn()) return;   // chưa khai secret → tắt hoàn toàn, app chạy y như cũ
  hangDoi.push(ev);
  void xaHangDoi();
}
