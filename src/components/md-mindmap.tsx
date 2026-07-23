"use client";
import React, { useEffect, useRef } from "react";
import { readableMath } from "@/lib/shared";

// Markdown → mindmap TƯƠNG TÁC (markmap: zoom, kéo, thu gọn nhánh) — dùng cho cả
// mindmap sinh từ gói tri thức (asset) lẫn sơ đồ cấu trúc dựng từ cây (tree-mindmap).
export default function MdMindmap({ markdown, className = "h-96 w-full" }: { markdown: string; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<{ destroy: () => void } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ Transformer }, { Markmap }] = await Promise.all([import("markmap-lib"), import("markmap-view")]);
      if (!alive || !svgRef.current) return;
      const svg = svgRef.current;
      // d3-zoom (bên trong markmap) đọc svg.width.baseVal.value; nếu SVG chỉ có kích thước qua CSS
      // (không có thuộc tính width/height dạng số) thì đó là độ dài TƯƠNG ĐỐI và ném
      // "Could not resolve relative length" khi phần tử chưa được bố cục. Gán số cụ thể để tránh lỗi.
      const r = svg.getBoundingClientRect();
      svg.setAttribute("width", String(Math.round(r.width) || 640));
      svg.setAttribute("height", String(Math.round(r.height) || 384));
      const { root } = new Transformer().transform(readableMath(markdown)); // ℚ, ≠, phân số… thay vì LaTeX thô
      mmRef.current?.destroy();
      mmRef.current = Markmap.create(svg, { autoFit: true, duration: 250, color: () => "var(--color-brand)" }, root);
    })();
    return () => { alive = false; mmRef.current?.destroy(); mmRef.current = null; };
  }, [markdown]);

  return <svg ref={svgRef} className={className} />;
}
