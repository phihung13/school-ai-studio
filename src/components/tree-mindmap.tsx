"use client";
import React from "react";
import type { OutlineNode } from "@/lib/shared";
import MdMindmap from "./md-mindmap";

// markdown outline → markmap: mỗi tầng cây thật (chương→bài→điểm KT→nguyên tử) thành 1 mức heading.
// KHÔNG qua AI — cấu trúc lấy thẳng từ cây kiến thức đã duyệt trong DB. (LaTeX → chữ đọc được do MdMindmap xử lý.)
function toMarkdown(n: OutlineNode, depth: number, highlightId?: string): string {
  const mark = n.id === highlightId ? `**${n.title}**` : n.title;
  const line = `${"#".repeat(Math.min(depth, 6))} ${mark}`;
  const kids = n.children.map((c) => toMarkdown(c, depth + 1, highlightId)).join("\n");
  return kids ? `${line}\n${kids}` : line;
}

export default function TreeMindmap({ outline, highlightId }: { outline: OutlineNode; highlightId?: string }) {
  return <MdMindmap markdown={toMarkdown(outline, 1, highlightId)} className="h-72 w-full" />;
}
