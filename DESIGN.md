# Design

## Theme

"Son mài học thuật" — thư viện gỗ dưới ánh đèn ấm, huy hiệu trường men đỏ và đồng thau trên giấy ngà. Light mode, product register, chiến lược màu Restrained: một màu thương hiệu đỏ son gánh điểm nhấn, phần còn lại là mực nâu / giấy / đường kẻ mảnh. Hơi ấm nằm ở màu thương hiệu + đồng thau + serif, KHÔNG dồn vào nền.

## Color (OKLCH)

- Canvas (nền app): `oklch(0.972 0.005 70)` — giấy ngà rất kiềm chế
- Surface (thẻ, panel): `oklch(0.995 0.003 75)` — gần trắng
- Surface-2 (ô lõm, mã): `oklch(0.955 0.006 70)`
- Ink (chữ chính): `oklch(0.24 0.02 40)` — mực nâu gần đen
- Ink-2 (phụ): `oklch(0.44 0.02 45)`
- Muted (gợi ý): `oklch(0.56 0.015 50)`
- Line: `oklch(0.90 0.008 60)`; Line-strong: `oklch(0.84 0.01 55)`
- Brand đỏ son: `oklch(0.44 0.13 27)`; hover đậm `oklch(0.38 0.13 27)`; tint nền `oklch(0.95 0.03 30)`; on-brand `oklch(0.99 0.005 75)`
- Brass đồng thau (nhấn phụ, huy hiệu): `oklch(0.62 0.10 78)`; tint `oklch(0.94 0.045 82)`
- Semantic: success/pine `oklch(0.46 0.09 155)`, warning/amber `oklch(0.60 0.12 70)`, danger `oklch(0.53 0.17 28)`, info/slate `oklch(0.50 0.06 250)` — mỗi cái có tint nền tương ứng
- Mức độ (ramp tăng dần): Mức 1 brass, Mức 2 terracotta `oklch(0.55 0.13 45)`, Mức 3 oxblood — đọc như độ khó tăng

## Typography

- Display (tiêu đề, thương hiệu): **Lora** (serif, có bộ Vietnamese) — bookish, học thuật, ấm. Dùng cho h1–h3, tên gói, logo chữ.
- Sans (thân, nhãn, nút, dữ liệu): **Be Vietnam Pro** — sans thiết kế cho tiếng Việt. Trọng số 400/500/600/700.
- Mono (mã nguyên tử): stack hệ thống ui-monospace.
- Cặp tương phản trục serif + sans (không phải hai sans na ná). Scale rem cố định (product), tỉ lệ ~1.2.

## Components

- Radius kiềm chế: `--radius` 8px cho control/thẻ; không bo tròn kiểu viên thuốc trừ badge/chip. Không over-round.
- Card: nền surface, viền `1px` line, radius 8px, đổ bóng cực nhẹ (hairline + shadow-sm). Không bóng màu, không nested card.
- Button: primary = nền brand, chữ on-brand; secondary = viền line + nền surface; ghost = chữ brand. Có đủ default/hover/focus/active/disabled/loading.
- Icon: **lucide-react** stroke ~1.75, KHÔNG emoji. Kích thước 16–20px inline.
- Badge trạng thái: nền tint + chữ cùng hệ màu đậm + đôi khi chấm/hình. Không side-stripe border.
- Sidebar: lớp neutral thứ hai (surface hơi khác canvas), mục active có nền brand-tint + chữ brand + thanh chỉ báo mảnh bên trái (1px).

## Layout

- App shell: sidebar trái cố định (desktop), thu gọn thành drawer trên mobile. Nội dung max-width ~ 72rem.
- Bảng ma trận học liệu: cuộn ngang trong khung riêng trên mobile.
- Nhịp khoảng cách thay đổi (không đều đều). Flex cho 1D, grid cho 2D.

## Motion

- 150–250ms, ease-out. fade-up nhẹ khi vào trang; stagger nhẹ danh sách. Không choreography tải trang. Tôn trọng prefers-reduced-motion (crossfade/instant).
