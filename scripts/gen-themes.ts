// Bộ sinh THƯ VIỆN MẪU slide: 1 khung xương CSS (var-driven) × N bảng màu → N file marp-<id>.css.
// Thêm mẫu = thêm 1 bảng màu ở PALETTES bên dưới rồi chạy: npm run gen:themes
// (Theme "va-kids" KHÔNG sinh ở đây — nó có cấu trúc riêng, giữ file tay.)
import fs from "fs";
import path from "path";

// ── KHUNG XƯƠNG: mọi màu đều qua var(); cấu trúc/bố cục giống nhau cho mọi mẫu ──
const BASE = `@import 'default';

section{
  width:1280px; height:720px; padding:52px 72px 0;
  font-family:var(--font-body);
  background:linear-gradient(157deg,var(--bg1) 0%,var(--bg2) 100%);
  color:var(--ink); font-size:24px; line-height:1.5; letter-spacing:.1px;
  /* ghi đè justify/align của theme 'default' — nếu không cả slide co lại dồn vào giữa */
  display:grid; grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr) auto; row-gap:22px;
  justify-content:stretch; align-content:stretch; justify-items:stretch;
  overflow:hidden; position:relative;
}
section:after{ display:none; }
strong{ color:var(--brand); font-weight:700; }
em{ color:var(--brand-soft); font-style:normal; font-weight:600; }

/* đầu slide */
.hd{ position:relative; z-index:2; }
.kick{ font-family:var(--font-head); font-size:13.5px; letter-spacing:.24em; color:var(--kick); font-weight:700; text-transform:uppercase; }
.rule{ width:54px; height:4px; background:var(--accent); border-radius:3px; margin:11px 0 16px; }
/* số trang bóng mờ khổ lớn — dấu ấn "trang sách", biến theo slide (không phải đồ đạc lặp) */
.idx{ position:absolute; right:64px; top:26px; z-index:1; font-family:var(--font-head); font-size:150px; font-weight:800;
  line-height:1; letter-spacing:-5px; color:var(--brand); opacity:.055; pointer-events:none; user-select:none; }
h1{ font-family:var(--font-head); font-size:56px; font-weight:800; line-height:1.1; letter-spacing:-1px; margin:0; color:var(--cov-ink); }
h2{ font-family:var(--font-head); font-size:35px; font-weight:700; line-height:1.2; letter-spacing:-.5px; margin:0; color:var(--brand); }
.lead{ margin:12px 0 0; font-size:19px; color:var(--muted); line-height:1.5; max-width:92%; }

/* thân slide — grid để bảng/biểu đồ căng hết chiều ngang */
.bd{ position:relative; z-index:2; display:grid; grid-template-columns:1fr; align-content:center; justify-items:stretch; gap:18px; min-height:0; }
/* slide chữ (ít bullet) — neo lên trên thay vì trôi giữa vùng trống; bullet to hơn cho đầy đặn */
.bd.text{ align-content:start; padding-top:6px; gap:16px; }
.bd.text .blist li{ min-height:70px; padding:18px 26px 18px 54px; }
.bd.text .blist .tx{ font-size:23px; line-height:1.5; }
.bd.center{ text-align:center; }
.bd.split{ grid-template-columns:1fr 1.12fr; align-content:center; align-items:center; gap:36px; }
.bd.split .col{ min-width:0; }

/* chân slide */
.ft{ position:relative; z-index:2; display:flex; justify-content:space-between; align-items:center;
  font-size:13.5px; color:var(--foot); border-top:1px solid var(--line); padding:11px 0 16px; }
.ft .pg{ font-weight:700; color:var(--muted); font-variant-numeric:tabular-nums; }

/* bullets — hàng thẻ full-width */
.blist{ list-style:none; padding:0; margin:0; width:100%; display:grid; gap:13px; }
.blist li{ position:relative; display:flex; align-items:center; min-height:60px;
  padding:14px 22px 14px 50px; background:var(--paper); border:1px solid var(--line); border-radius:14px; box-shadow:var(--sh-card); }
.blist li:before{ content:""; position:absolute; left:22px; top:50%; width:11px; height:11px; margin-top:-5.5px;
  background:var(--accent); border-radius:3px; transform:rotate(45deg); }
.blist .tx{ font-size:22px; line-height:1.45; color:var(--ink); }
.blist li.bad{ background:var(--bad-bg); border-color:var(--bad-bd); } .blist li.bad:before{ background:var(--bad-mk); }
.blist li.good{ background:var(--good-bg); border-color:var(--good-bd); } .blist li.good:before{ background:var(--good-mk); }
.blist li.tip{ background:var(--tip-bg); border-color:var(--tip-bd); }

/* thẻ ý chính */
.cards{ display:grid; gap:18px; width:100%; }
.cards.n2{ grid-template-columns:repeat(2,1fr); } .cards.n3{ grid-template-columns:repeat(3,1fr); } .cards.n4{ grid-template-columns:repeat(2,1fr); }
.card{ position:relative; background:var(--paper); border:1px solid var(--line); border-radius:16px;
  padding:22px 22px 20px; overflow:hidden; box-shadow:var(--sh-card); --ac:var(--brand); }
.card:before{ content:""; position:absolute; left:0; right:0; top:0; height:4px; background:var(--ac); }
.card.c1{ --ac:var(--accent); } .card.c2{ --ac:var(--accent2); }
.card .ci{ font-size:31px; line-height:1; margin-bottom:8px; }
.card h4{ margin:0 0 6px; font-size:20px; color:var(--brand); font-weight:700; line-height:1.25; }
.card p{ margin:0; font-size:16.5px; color:var(--muted); line-height:1.5; }

/* các bước — badge số */
.steps{ list-style:none; padding:0; margin:0; counter-reset:st; width:100%; display:grid; gap:15px; }
.steps.two{ grid-template-columns:1fr 1fr; column-gap:40px; }
.steps li{ position:relative; padding:12px 22px 12px 76px; min-height:66px; display:flex; align-items:center;
  background:var(--paper); border:1px solid var(--line); border-radius:14px; box-shadow:var(--sh-card); }
.steps li:before{ counter-increment:st; content:counter(st); position:absolute; left:16px; top:50%; margin-top:-22px;
  width:44px; height:44px; border-radius:14px; background:var(--brand); color:var(--on-brand); font-weight:700;
  display:flex; align-items:center; justify-content:center; font-size:19px; box-shadow:var(--sh-badge); }
.steps li:last-child:before{ background:var(--accent); }
.steps li .tx{ font-size:21px; line-height:1.4; color:var(--ink); }

/* con số biết nói */
.stat{ text-align:left; } .bd.center .stat{ text-align:center; }
.stat .val{ font-family:var(--font-head); font-size:104px; font-weight:800; line-height:1; color:var(--brand); letter-spacing:-2px; }
.stat .lbl{ font-size:21px; color:var(--muted); margin-top:16px; line-height:1.4; }
.bd.center .stat .val:after{ content:""; display:block; width:80px; height:5px; background:var(--accent); border-radius:3px; margin:18px auto 0; }

/* bảng số liệu */
.tblw{ width:100%; }
.tbl{ display:table; table-layout:auto; width:100%; border-collapse:separate; border-spacing:0; font-size:19px;
  border-radius:14px; overflow:hidden; box-shadow:var(--sh-strong); }
.tbl th{ background:var(--brand); color:var(--on-brand); font-weight:700; padding:13px 16px; text-align:center; font-size:17px; }
.tbl td{ padding:12px 16px; text-align:center; background:var(--paper); color:var(--ink); border-bottom:1px solid var(--line); }
.tbl tr:nth-child(even) td{ background:var(--paper2); }
.tbl tr:last-child td{ border-bottom:none; }

/* biểu đồ */
.chart{ margin:0; width:100%; background:var(--paper); border:1px solid var(--line); border-radius:16px; padding:14px 16px; box-shadow:var(--sh-strong); }
.chart svg{ width:100%; height:auto; display:block; max-height:428px; }

/* lớp trang trí */
.decor{ position:absolute; inset:0; pointer-events:none; } .decor.back{ z-index:0; } .decor.front{ z-index:6; }
.dc{ position:absolute; transform:translate(-50%,-50%); }
.dc.blob{ border-radius:58% 42% 61% 39% / 47% 57% 43% 53%; filter:blur(14px); }
.dc.ring{ border:2.5px solid; border-radius:50%; }
.dc.stk{ line-height:1; }
.dc.chip{ padding:9px 18px; border-radius:999px; color:#fff; font-size:16px; font-weight:700; white-space:nowrap; box-shadow:0 10px 22px -12px rgba(0,0,0,.5); }
.dc.dsvg{ inset:0; width:100%; height:100%; transform:none; }

/* slide cảnh báo */
section.warn{ background:linear-gradient(157deg,var(--warn-bg1) 0%,var(--warn-bg2) 100%); }
section.warn h2{ color:var(--warn-h2); }
section.warn .kick{ color:var(--warn-kick); }
section.warn .rule{ background:var(--brand); }
section.warn .card:before{ background:var(--warn-kick); }
section.warn .blist li:before{ background:var(--warn-mk); }

/* bìa & trang chốt — bookend */
section.cover,section.closing{ color:var(--cov-ink); padding:0 88px 74px; display:flex; flex-direction:column; justify-content:center;
  background:linear-gradient(152deg,var(--cov-bg1) 0%,var(--cov-bg2) 100%); }
section.cover .glow,section.closing .glow{ position:absolute; z-index:0; width:760px; height:760px; border-radius:50%;
  background:radial-gradient(circle,var(--glow) 0%,transparent 62%); }
section.cover .glow{ right:-180px; top:-300px; } section.closing .glow{ left:-240px; bottom:-330px; }
section.cover .kick,section.closing .kick{ color:var(--cov-accent); }
section.cover strong,section.cover em,section.closing strong,section.closing em{ color:var(--cov-accent); }
section.cover .lead{ color:var(--cov-lead); font-size:21px; max-width:70%; margin-top:18px; }
section.cover h1{ max-width:78%; }
section.closing h2{ color:var(--cov-ink); font-size:38px; }
section.cover .mark{ position:absolute; right:88px; top:76px; z-index:1; width:126px; height:126px; border-radius:34px;
  display:flex; align-items:center; justify-content:center; font-size:62px;
  background:linear-gradient(150deg,var(--mark-bg1),var(--mark-bg2)); box-shadow:inset 0 0 0 1px var(--mark-ring), 0 26px 48px -22px rgba(0,0,0,.65); }
section.cover .stat{ margin-top:22px; }
section.cover .stat .val{ font-size:70px; color:var(--cov-accent); }
section.cover .stat .lbl{ color:var(--cov-mist); font-size:19px; margin-top:10px; }
section.closing .num{ list-style:none; counter-reset:cn; padding:0; margin:26px 0 0; position:relative; z-index:2; display:grid; gap:14px; }
section.closing .num li{ counter-increment:cn; position:relative; padding-left:64px; font-size:22px; color:var(--cov-text2); line-height:1.45; display:flex; align-items:center; min-height:46px; }
section.closing .num li:before{ content:counter(cn); position:absolute; left:0; top:0; width:46px; height:46px; border-radius:15px;
  background:var(--num-bg); color:var(--num-ink); font-weight:700; display:flex; align-items:center; justify-content:center; font-size:20px; }
section.cover .bar,section.closing .bar{ position:absolute; left:0; right:0; bottom:0; height:52px; z-index:2;
  background:var(--bar-bg); display:flex; align-items:center; padding:0 88px; color:var(--bar-ink); font-size:14px; letter-spacing:.4px; }
`;

// ── BẢNG MÀU từng mẫu (thêm mẫu = thêm 1 mục). head/body = font riêng (mặc định Be Vietnam Pro);
//    extra = CSS đặc thù nối sau khung xương (nền giấy, in hoa, bo tròn…). ──
const DEF_FONT = '"Be Vietnam Pro","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
type P = Record<string, string>;
const THEMES: { id: string; note: string; head?: string; body?: string; extra?: string; v: P }[] = [
  { id: "va-green", note: "Xanh brand + đồng brass — học thuật, mặc định", v: {
    bg1:"#FAFCFA", bg2:"#EFF4F0", ink:"#1A2620", muted:"#63756B", line:"#E1EAE4", paper:"#FFFFFF", paper2:"#F5F9F6", foot:"#8E9C93",
    brand:"#123D2C", "brand-soft":"#1E4D38", accent:"#C9A94E", accent2:"#5B9E7E", "on-brand":"#FFFFFF", kick:"#A8862E",
    "sh-card":"0 12px 26px -22px rgba(18,61,44,.55)", "sh-strong":"0 16px 34px -24px rgba(18,61,44,.6)", "sh-badge":"0 8px 18px -10px rgba(18,61,44,.7)",
    "bad-bg":"#FDF4F2","bad-bd":"#EFD8D1","bad-mk":"#C0523A","good-bg":"#F1F8F4","good-bd":"#D2E7DB","good-mk":"#2E9C6A","tip-bg":"#FBF7EC","tip-bd":"#EADFC4",
    "warn-bg1":"#FDFAF2","warn-bg2":"#F8F1E0","warn-h2":"#8A6A20","warn-kick":"#B08A3C","warn-mk":"#B08A3C",
    "d-brand":"#1E4D38","d-brass":"#C9A94E","d-mist":"#9DBBA8","d-ink":"#1A2620",
    "cov-bg1":"#17492F","cov-bg2":"#0B2418","cov-ink":"#FFFFFF","cov-lead":"#C8DACE","cov-mist":"#9DBBA8","cov-accent":"#E8C87A","cov-text2":"#EDF3EF",
    glow:"rgba(232,200,122,.20)","mark-bg1":"#1E5638","mark-bg2":"#0E2E20","mark-ring":"rgba(232,200,122,.32)","num-bg":"#C9A94E","num-ink":"#12301F","bar-bg":"rgba(0,0,0,.26)","bar-ink":"#8FAE9C",
  }},
  { id: "va-minimal", note: "Tối giản trang nhã — nền sáng, mực + đất nung", v: {
    bg1:"#FCFCFB", bg2:"#F4F4F2", ink:"#23232B", muted:"#77777F", line:"#E7E7E5", paper:"#FFFFFF", paper2:"#F7F7F5", foot:"#9A9AA0",
    brand:"#2B2B33", "brand-soft":"#44444C", accent:"#C2703D", accent2:"#8A8A96", "on-brand":"#FFFFFF", kick:"#B06A3A",
    "sh-card":"0 10px 24px -20px rgba(20,20,30,.35)", "sh-strong":"0 14px 30px -22px rgba(20,20,30,.4)", "sh-badge":"0 8px 16px -10px rgba(20,20,30,.45)",
    "bad-bg":"#FBF2EF","bad-bd":"#EBD8CF","bad-mk":"#B85C3E","good-bg":"#F1F6F1","good-bd":"#D7E4D4","good-mk":"#4C8A55","tip-bg":"#FAF6EE","tip-bd":"#EAE0CE",
    "warn-bg1":"#FBF6EF","warn-bg2":"#F5EEE2","warn-h2":"#9A5A2E","warn-kick":"#B06A3A","warn-mk":"#B06A3A",
    "d-brand":"#2B2B33","d-brass":"#C2703D","d-mist":"#C9C9CE","d-ink":"#23232B",
    "cov-bg1":"#2B2B33","cov-bg2":"#16161C","cov-ink":"#FFFFFF","cov-lead":"#C9C9CE","cov-mist":"#A6A6AC","cov-accent":"#E0A374","cov-text2":"#ECECEE",
    glow:"rgba(224,163,116,.16)","mark-bg1":"#33333B","mark-bg2":"#1A1A20","mark-ring":"rgba(224,163,116,.30)","num-bg":"#C2703D","num-ink":"#FFFFFF","bar-bg":"rgba(0,0,0,.28)","bar-ink":"#9A9AA0",
  }},
  { id: "va-ocean", note: "Xanh biển hiện đại — xanh dương + hổ phách", v: {
    bg1:"#F8FBFD", bg2:"#EDF4F9", ink:"#14304A", muted:"#5B7488", line:"#DEEAF1", paper:"#FFFFFF", paper2:"#F2F8FC", foot:"#8CA6B8",
    brand:"#1E6FB8", "brand-soft":"#12557F", accent:"#F2A93B", accent2:"#12B5B0", "on-brand":"#FFFFFF", kick:"#1E6FB8",
    "sh-card":"0 12px 26px -22px rgba(20,64,100,.5)", "sh-strong":"0 16px 34px -24px rgba(20,64,100,.55)", "sh-badge":"0 8px 18px -10px rgba(20,64,100,.6)",
    "bad-bg":"#FCF2F0","bad-bd":"#F0D8D2","bad-mk":"#C9543E","good-bg":"#EBF7F4","good-bd":"#C9E9E1","good-mk":"#12A08C","tip-bg":"#FFF6E9","tip-bd":"#F6E3C2",
    "warn-bg1":"#FFF9EE","warn-bg2":"#FDF0D8","warn-h2":"#A9711A","warn-kick":"#D99A2B","warn-mk":"#D99A2B",
    "d-brand":"#1E6FB8","d-brass":"#F2A93B","d-mist":"#A9CBE0","d-ink":"#14304A",
    "cov-bg1":"#145C9E","cov-bg2":"#0A2E52","cov-ink":"#FFFFFF","cov-lead":"#C6DCEC","cov-mist":"#9FC0DA","cov-accent":"#F6C560","cov-text2":"#E7F1F9",
    glow:"rgba(246,197,96,.20)","mark-bg1":"#1C6BAE","mark-bg2":"#0C355E","mark-ring":"rgba(246,197,96,.32)","num-bg":"#F2A93B","num-ink":"#10344F","bar-bg":"rgba(0,0,0,.24)","bar-ink":"#9FC0DA",
  }},
  { id: "va-night", note: "Trình chiếu tối — nền tối tương phản cao", v: {
    bg1:"#16211C", bg2:"#0E1712", ink:"#EAF2EE", muted:"#9DB1AB", line:"#2A3A33", paper:"#1E2A24", paper2:"#22302A", foot:"#7E938B",
    brand:"#67E8C3", "brand-soft":"#8FE8CF", accent:"#F6C560", accent2:"#7CB8FF", "on-brand":"#0E1712", kick:"#E0B24D",
    "sh-card":"0 14px 30px -24px rgba(0,0,0,.6)", "sh-strong":"0 18px 36px -26px rgba(0,0,0,.65)", "sh-badge":"0 8px 16px -10px rgba(0,0,0,.7)",
    "bad-bg":"rgba(240,138,110,.15)","bad-bd":"rgba(240,138,110,.42)","bad-mk":"#F08A6E","good-bg":"rgba(103,224,166,.15)","good-bd":"rgba(103,224,166,.42)","good-mk":"#67E0A6","tip-bg":"rgba(246,197,96,.12)","tip-bd":"rgba(246,197,96,.34)",
    "warn-bg1":"#2A2413","warn-bg2":"#1E1A0E","warn-h2":"#F6C560","warn-kick":"#E0B24D","warn-mk":"#E0B24D",
    "d-brand":"#67E8C3","d-brass":"#F6C560","d-mist":"#3A4E46","d-ink":"#EAF2EE",
    "cov-bg1":"#10312A","cov-bg2":"#071411","cov-ink":"#FFFFFF","cov-lead":"#BFD6CE","cov-mist":"#8FA89F","cov-accent":"#67E8C3","cov-text2":"#E4EFEA",
    glow:"rgba(103,232,195,.16)","mark-bg1":"#16473C","mark-bg2":"#0A241E","mark-ring":"rgba(103,232,195,.30)","num-bg":"#67E8C3","num-ink":"#0E1712","bar-bg":"rgba(0,0,0,.40)","bar-ink":"#8FA89F",
  }},
  { id: "va-chalk", note: "Bảng xanh học đường — tông bảng phấn", v: {
    bg1:"#2A5245", bg2:"#1B3B30", ink:"#F3F6EE", muted:"#B9C9BC", line:"#3C5B4F", paper:"#23473B", paper2:"#2A5045", foot:"#93A89C",
    brand:"#FFF3C4", "brand-soft":"#FCEAA6", accent:"#7FD1B9", accent2:"#F4A9C0", "on-brand":"#1B3B30", kick:"#F4D48A",
    "sh-card":"0 10px 22px -20px rgba(0,0,0,.5)", "sh-strong":"0 14px 28px -22px rgba(0,0,0,.55)", "sh-badge":"0 8px 16px -10px rgba(0,0,0,.55)",
    "bad-bg":"rgba(244,169,192,.14)","bad-bd":"rgba(244,169,192,.42)","bad-mk":"#F4A9C0","good-bg":"rgba(127,209,185,.14)","good-bd":"rgba(127,209,185,.42)","good-mk":"#7FD1B9","tip-bg":"rgba(255,243,196,.12)","tip-bd":"rgba(255,243,196,.34)",
    "warn-bg1":"#3A4A2A","warn-bg2":"#2C3A20","warn-h2":"#FFF3C4","warn-kick":"#F4D48A","warn-mk":"#F4D48A",
    "d-brand":"#7FD1B9","d-brass":"#FFF3C4","d-mist":"#4A6A5C","d-ink":"#F3F6EE",
    "cov-bg1":"#1F4034","cov-bg2":"#122A21","cov-ink":"#FFF9E8","cov-lead":"#C9D9CC","cov-mist":"#A6BCAB","cov-accent":"#FFF3C4","cov-text2":"#E9F1E6",
    glow:"rgba(255,243,196,.14)","mark-bg1":"#2A5245","mark-bg2":"#163127","mark-ring":"rgba(255,243,196,.30)","num-bg":"#FFF3C4","num-ink":"#1B3B30","bar-bg":"rgba(0,0,0,.30)","bar-ink":"#A6BCAB",
  }},
  { id: "va-editorial", note: "Biên tập nghiêm túc — Oswald in hoa, nền giấy (Lịch sử/Địa lý)",
    head: '"Oswald","Be Vietnam Pro",sans-serif',
    extra: `section{ background-image:
  url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='140' height='140' filter='url(%23n)' opacity='0.05'/></svg>"),
  linear-gradient(157deg,var(--bg1) 0%,var(--bg2) 100%); }
h1{ font-size:68px; font-weight:700; text-transform:uppercase; letter-spacing:0; }
h2{ font-size:41px; font-weight:700; text-transform:uppercase; letter-spacing:0; }
section.closing h2{ text-transform:uppercase; }
.stat .val{ font-weight:700; }
.kick{ letter-spacing:.3em; }
.card,.blist li,.steps li,.tbl,.chart{ border-radius:7px; }
.tbl th{ background:var(--ink); }`,
    v: {
    bg1:"#F6F4EF", bg2:"#EEEAE2", ink:"#201C18", muted:"#6E655C", line:"#E1DBD0", paper:"#FFFFFF", paper2:"#F7F4EE", foot:"#9A9084",
    brand:"#A32A22", "brand-soft":"#7E211B", accent:"#C6862E", accent2:"#5B6152", "on-brand":"#FFFFFF", kick:"#A32A22",
    "sh-card":"0 10px 24px -20px rgba(40,30,20,.30)", "sh-strong":"0 14px 30px -22px rgba(40,30,20,.34)", "sh-badge":"0 8px 16px -10px rgba(40,30,20,.40)",
    "bad-bg":"#FBF0EE","bad-bd":"#EBD3CE","bad-mk":"#B23B2E","good-bg":"#F2F5EC","good-bd":"#DBE3CC","good-mk":"#5B7A3F","tip-bg":"#FAF4E7","tip-bd":"#EADFC6",
    "warn-bg1":"#FBF5E9","warn-bg2":"#F5ECD8","warn-h2":"#8A5A1E","warn-kick":"#B47D24","warn-mk":"#B47D24",
    "d-brand":"#A32A22","d-brass":"#C6862E","d-mist":"#CFC7BA","d-ink":"#201C18",
    "cov-bg1":"#211C18","cov-bg2":"#100D0B","cov-ink":"#FFFFFF","cov-lead":"#C9BFB2","cov-mist":"#A69C8E","cov-accent":"#E0A93A","cov-text2":"#ECE7DE",
    glow:"rgba(224,169,58,.14)","mark-bg1":"#2A231E","mark-bg2":"#12100E","mark-ring":"rgba(224,169,58,.28)","num-bg":"#A32A22","num-ink":"#FFFFFF","bar-bg":"rgba(0,0,0,.30)","bar-ink":"#A69C8E",
  }},
  { id: "va-bloom", note: "Hoạt hình dễ thương — Baloo 2 bo tròn, kem-xanh, chấm bi",
    head: '"Baloo 2","Be Vietnam Pro",sans-serif', body: '"Baloo 2","Be Vietnam Pro",sans-serif',
    extra: `section{ background-image:
  radial-gradient(var(--dot) 1.6px, transparent 1.8px),
  linear-gradient(157deg,var(--bg1) 0%,var(--bg2) 100%);
  background-size:24px 24px, cover; }
h1,h2,.kick,.stat .val{ font-weight:800; }
.card{ border-radius:28px; border-width:2px; }
.blist li{ border-radius:24px; border-width:2px; }
.blist li:before{ border-radius:50%; transform:none; width:13px; height:13px; margin-top:-6.5px; }
.steps li{ border-radius:24px; border-width:2px; }
.steps li:before{ border-radius:50%; }
.tbl{ border-radius:22px; } .chart{ border-radius:24px; border-width:2px; }
.rule{ height:7px; border-radius:99px; }`,
    v: {
    bg1:"#FBF7EA", bg2:"#F1F4DD", ink:"#47512F", muted:"#7E8863", line:"#E4E8CB", paper:"#FFFFFF", paper2:"#F7FAE7", foot:"#99A37E", dot:"#E0E7C6",
    brand:"#6E9A3E", "brand-soft":"#567A31", accent:"#EC894A", accent2:"#E7B93F", "on-brand":"#FFFFFF", kick:"#C6763A",
    "sh-card":"0 12px 26px -20px rgba(80,90,40,.40)", "sh-strong":"0 16px 32px -22px rgba(80,90,40,.45)", "sh-badge":"0 8px 16px -10px rgba(80,90,40,.50)",
    "bad-bg":"#FDF1EA","bad-bd":"#F6D9C6","bad-mk":"#E0663A","good-bg":"#F0F7E4","good-bd":"#D6E7BB","good-mk":"#6E9A3E","tip-bg":"#FDF6E4","tip-bd":"#F0E2B8",
    "warn-bg1":"#FEF6E6","warn-bg2":"#FBEECB","warn-h2":"#B4701E","warn-kick":"#E8A23A","warn-mk":"#E8A23A",
    "d-brand":"#6E9A3E","d-brass":"#EC894A","d-mist":"#C7D6A2","d-ink":"#47512F",
    "cov-bg1":"#7BA84A","cov-bg2":"#5A8433","cov-ink":"#FFFFFF","cov-lead":"#EAF3D8","cov-mist":"#CFE3AE","cov-accent":"#FBE7A0","cov-text2":"#F0F6E2",
    glow:"rgba(251,231,160,.22)","mark-bg1":"#86B455","mark-bg2":"#5E8A36","mark-ring":"rgba(255,255,255,.35)","num-bg":"#EC894A","num-ink":"#FFFFFF","bar-bg":"rgba(0,0,0,.20)","bar-ink":"#EAF3D8",
  }},
];

const dir = path.join(process.cwd(), "src", "lib", "templates");
for (const t of THEMES) {
  const v = { "font-head": t.head || DEF_FONT, "font-body": t.body || DEF_FONT, ...t.v };
  const vars = Object.entries(v).map(([k, val]) => `  --${k}:${val};`).join("\n");
  const extra = t.extra ? `\n/* ── riêng mẫu ${t.id} ── */\n${t.extra}\n` : "";
  const css = `/* @theme ${t.id}\n   ${t.note}. SINH TỰ ĐỘNG bởi scripts/gen-themes.ts — đừng sửa tay, sửa bảng màu rồi chạy lại. */\n:root{\n${vars}\n}\n${BASE}${extra}`;
  fs.writeFileSync(path.join(dir, `marp-${t.id}.css`), css, "utf-8");
  console.log("wrote marp-" + t.id + ".css");
}
