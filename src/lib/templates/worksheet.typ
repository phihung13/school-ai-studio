// Phiếu học tập — Trường Việt Anh (đổ dữ liệu từ data.json do export route sinh)
// Chuỗi từ JSON được chèn dạng VĂN BẢN THÔ (không parse markup) → nội dung AI không phá layout.
// Body đã được tách khối ở tầng JS: text / table (bảng kẻ thật) / drawbox (khung ô ly để học sinh vẽ).
#import "@preview/mitex:0.2.7": mi   // mi = công thức LaTeX INLINE (đã cache) — render thật trong PDF
#let fx(s) = box[#h(0.12em)#mi(s)#h(0.12em)]   // công thức inline + hơi thở hai bên (nội dung nguồn hay thiếu space)
#let d = json("data.json")
#let brand = rgb("#1E4D38")
#let brass = rgb("#B08A3C")
#let ink = rgb("#26332B")
#let muted = rgb("#6B7A6E")
#let mist = rgb("#F4F7F2")
#let hairline = rgb("#DDE5DC")
#let gridline = rgb("#E3EBE4")

#set document(title: d.title)
#set page(
  paper: "a4",
  margin: (x: 1.7cm, top: 2.4cm, bottom: 2cm),
  header: context {
    if counter(page).get().first() > 1 {
      set text(size: 9pt, fill: muted)
      grid(columns: (1fr, auto), [#d.school], [#d.code])
      v(-0.45em)
      line(length: 100%, stroke: 0.5pt + hairline)
    }
  },
  footer: context {
    set text(size: 9pt, fill: muted)
    line(length: 100%, stroke: 0.5pt + hairline)
    v(-0.3em)
    grid(columns: (1fr, auto),
      [#d.school — Xưởng Học liệu AI],
      [Trang #counter(page).display() / #context counter(page).final().first()],
    )
  },
)
// Times New Roman theo chuẩn văn bản nhà trường (máy không có → rơi về Libertinus)
#set text(font: ("Times New Roman", "Libertinus Serif"), size: 12pt, lang: "vi", fill: ink)
#set par(justify: true, leading: 0.66em)

// Khung Ô LY thật cho học sinh vẽ (hệ trục, biểu đồ…) — ô 5mm
#let drawbox(caption: "", height: 8.4cm) = {
  v(6pt)
  if caption != "" { text(size: 10pt, fill: muted, style: "italic")[✎ #caption]; v(3pt) }
  block(width: 100%, height: height, stroke: 0.8pt + rgb("#B8C4BA"), radius: 4pt, clip: true, {
    for i in range(1, 36) { place(dx: i * 5mm, dy: 0pt, line(angle: 90deg, length: height, stroke: 0.4pt + gridline)) }
    for j in range(1, int(height / 5mm) + 1) { place(dx: 0pt, dy: j * 5mm, line(length: 100%, stroke: 0.4pt + gridline)) }
  })
  v(4pt)
}

// ── Đầu phiếu ──
#block(fill: mist, inset: 13pt, radius: 7pt, width: 100%, stroke: 0.5pt + hairline)[
  #text(size: 9pt, fill: brass, weight: "bold", tracking: 1.4pt)[PHIẾU HỌC TẬP · MỨC #str(d.level) — #upper(d.levelLabel)]
  #v(5pt)
  #text(size: 17.5pt, weight: "bold", fill: brand)[#d.title]
  #v(3pt)
  #text(size: 9.5pt, fill: muted)[#d.chain · Mã #d.code]
]
#v(8pt)
#text(size: 10.5pt, fill: muted)[
  Họ tên: #box(width: 2fr, baseline: 20%, repeat[.]) #h(10pt)
  Lớp: #box(width: 1fr, baseline: 20%, repeat[.]) #h(10pt)
  Ngày: #box(width: 80pt, baseline: 20%, repeat[.])
]

// ── Các phần ──
#for (i, sec) in d.sections.enumerate() {
  v(13pt)
  block(breakable: false)[
    #box(baseline: 22%, rect(fill: brand, radius: 3pt, inset: (x: 7pt, y: 4pt))[#text(fill: white, weight: "bold", size: 10pt)[#str(i + 1)]])
    #h(7pt)
    #text(size: 13.5pt, weight: "bold", fill: brand)[#sec.heading]
    #v(-3pt)
    #line(length: 100%, stroke: 0.9pt + brass.transparentize(55%))
  ]
  v(3pt)
  for blk in sec.blocks {
    if blk.kind == "text" {
      // mỗi dòng = mảng segment {t, b}: b=true in đậm thật (AI trả **markdown** đã tách sẵn phía server)
      for ln in blk.lines {
        if ln.len() == 0 { v(4pt) } else {
          par(ln.map(seg => if seg.at("m", default: false) { fx(seg.t) } else if seg.at("b", default: false) { strong(seg.t) } else if seg.at("i", default: false) { emph(seg.t) } else { [#seg.t] }).join())
        }
      }
    } else if blk.kind == "table" {
      v(6pt)
      align(center, table(
        columns: (1fr,) * blk.headers.len(),
        stroke: 0.6pt + rgb("#C9D4CB"),
        inset: 7pt,
        align: center + horizon,
        fill: (x, y) => if y == 0 { brand } else if calc.even(y) { mist } else { white },
        ..blk.headers.map(h => text(fill: white, weight: "bold", size: 11pt)[#h]),
        ..blk.rows.flatten().map(c => text(size: 11.5pt)[#c]),
      ))
      v(6pt)
    } else if blk.kind == "drawbox" {
      drawbox(caption: blk.caption)
    } else if blk.kind == "answerline" {
      // chỗ học sinh viết trả lời — kẻ DÒNG ngay tại chỗ câu hỏi (không dồn xuống 1 khối "BÀI LÀM" ở cuối)
      v(3pt)
      for _ in range(blk.count) { v(15pt); line(length: 100%, stroke: 0.5pt + hairline) }
      v(5pt)
    }
  }
}
// (đã bỏ khối "BÀI LÀM" chung ở cuối — chỗ viết giờ nằm NGAY DƯỚI từng câu qua answerline)
