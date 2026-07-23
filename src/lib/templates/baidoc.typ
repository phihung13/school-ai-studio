// Bài đọc — Trường Việt Anh (đổ dữ liệu từ data.json do export route sinh)
// Layout ĐỌC: không ô họ tên, không dòng kẻ bài làm; bảng markdown → bảng kẻ thật.
#import "@preview/mitex:0.2.7": mi   // mi = công thức LaTeX INLINE (đã cache) — render thật trong PDF
#let fx(s) = box[#h(0.12em)#mi(s)#h(0.12em)]   // công thức inline + hơi thở hai bên
#let d = json("data.json")
#let brand = rgb("#1E4D38")
#let brass = rgb("#B08A3C")
#let ink = rgb("#26332B")
#let muted = rgb("#6B7A6E")
#let mist = rgb("#F4F7F2")
#let hairline = rgb("#DDE5DC")

#set document(title: d.title)
#set page(
  paper: "a4",
  margin: (x: 1.9cm, top: 2.4cm, bottom: 2cm),
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
#set text(font: ("Times New Roman", "Libertinus Serif"), size: 12pt, lang: "vi", fill: ink)
#set par(justify: true, leading: 0.7em, spacing: 1.1em)

// ── Đầu bài ──
#block(fill: mist, inset: 13pt, radius: 7pt, width: 100%, stroke: 0.5pt + hairline)[
  #text(size: 9pt, fill: brass, weight: "bold", tracking: 1.4pt)[BÀI ĐỌC · MỨC #str(d.level) — #upper(d.levelLabel)]
  #v(5pt)
  #text(size: 18pt, weight: "bold", fill: brand)[#d.title]
  #v(3pt)
  #text(size: 9.5pt, fill: muted)[#d.chain · Mã #d.code]
]

// ── Các phần: VÍ DỤ nền xanh nhạt, CẨN THẬN nền brass nhạt, còn lại thường ──
#for (i, sec) in d.sections.enumerate() {
  v(13pt)
  let tone = if sec.heading.contains("Cẩn thận") or sec.heading.contains("CẨN THẬN") { "warn" } else if sec.heading.contains("Ví dụ") or sec.heading.contains("VÍ DỤ") { "ok" } else { "plain" }
  block(breakable: false)[
    #box(baseline: 22%, rect(fill: if tone == "warn" { brass } else { brand }, radius: 3pt, inset: (x: 7pt, y: 4pt))[#text(fill: white, weight: "bold", size: 10pt)[#str(i + 1)]])
    #h(7pt)
    #text(size: 13.5pt, weight: "bold", fill: if tone == "warn" { brass } else { brand })[#sec.heading]
    #v(-3pt)
    #line(length: 100%, stroke: 0.9pt + (if tone == "warn" { brand } else { brass }).transparentize(55%))
  ]
  v(3pt)
  let body = {
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
        // bài đọc không có khung vẽ — in caption như ghi chú nghiêng
        text(size: 10pt, fill: muted, style: "italic")[✎ #blk.caption]
      } else if blk.kind == "chart" {
        // HÌNH BIỂU ĐỒ THẬT (SVG render tất định từ số liệu trong bài) — card viền mảnh + nhãn brass
        v(8pt)
        block(breakable: false, width: 100%, radius: 6pt, inset: 10pt, fill: white, stroke: 0.6pt + hairline)[
          #text(size: 8.5pt, fill: brass, weight: "bold", tracking: 1.2pt)[SỐ LIỆU MINH HOẠ]
          #v(4pt)
          #image(blk.file, width: 100%)
        ]
        v(4pt)
      }
    }
  }
  if tone == "plain" { body } else {
    block(width: 100%, radius: 6pt, inset: 11pt,
      fill: if tone == "warn" { rgb("#FAF3E3") } else { rgb("#EFF5EF") },
      stroke: 0.5pt + (if tone == "warn" { rgb("#E3D3AD") } else { rgb("#CFE0D2") }),
      body)
  }
}

// ── Đáp án tự kiểm (chữ nhỏ cuối bài — học sinh làm xong mới đối chiếu) ──
#if "answers" in d and d.answers.len() > 0 {
  v(16pt)
  block(width: 100%, radius: 6pt, inset: 11pt, fill: mist, stroke: 0.5pt + hairline)[
    #text(size: 9pt, fill: brass, weight: "bold", tracking: 1.4pt)[ĐÁP ÁN TỰ KIỂM — làm xong mới xem nhé]
    #v(4pt)
    #set text(size: 10pt, fill: ink)
    #for (i, a) in d.answers.enumerate() [
      #text(weight: "bold", fill: brand)[#str(i + 1).] #a #if i < d.answers.len() - 1 [#v(2pt)]
    ]
  ]
}
