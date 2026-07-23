"use client";
import React, { useEffect, useState } from "react";
import { Bot, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { getData, api, Card, Button, PageLoading, LoadError, useToast, cls, FormatIcon } from "@/components/ui";
import { AssetFormat, FormatSkill, FORMAT_LABEL, FORMAT_AGENT } from "@/lib/shared";

interface AgentsData {
  formats: AssetFormat[];
  skills: Record<AssetFormat, FormatSkill>;
  hasKey: boolean;
}

// Các định dạng có "phong cách hình ảnh" — loại khác ẩn field này.
const IMAGE_FORMATS = new Set<string>(["slide", "infographic", "video"]);

function emptySkill(): FormatSkill {
  return { agent: "", style: "", imageStyle: "", guide: "", audience: "", length: "", constraints: "", sample: "" };
}

function AgentCard({
  format,
  base,
  onSaved,
  onError,
}: {
  format: AssetFormat;
  base: FormatSkill;
  onSaved: (skill: FormatSkill) => void;
  onError: (msg: string) => void;
}) {
  const [skill, setSkill] = useState<FormatSkill>(base);
  const [busy, setBusy] = useState(false);

  const g = (k: keyof FormatSkill) => (skill[k] ?? "") as string;
  const dirty = (["agent", "style", "imageStyle", "guide", "audience", "length", "constraints", "sample"] as (keyof FormatSkill)[])
    .some((k) => (skill[k] ?? "") !== (base[k] ?? ""));

  const showImage = IMAGE_FORMATS.has(format);
  const agentName = skill.agent.trim() || FORMAT_AGENT[format];

  const save = async () => {
    setBusy(true);
    try {
      const payload: FormatSkill = {
        agent: skill.agent.trim(),
        style: g("style"),
        imageStyle: showImage ? g("imageStyle") : "",
        guide: g("guide"),
        audience: g("audience"),
        length: g("length"),
        constraints: g("constraints"),
        sample: g("sample"),
      };
      await api("saveFormatSkill", { format, skill: payload });
      onSaved(payload);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Lỗi khi lưu");
    }
    setBusy(false);
  };

  const ta = "w-full resize-y rounded-md border border-line bg-surface-2/60 px-3 py-2.5 text-sm leading-relaxed text-ink outline-none transition focus:border-brand";

  return (
    <Card className="p-5 fade-up">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-bg">
          <FormatIcon format={format} size={26} className="text-brand" />
        </span>
        <h2 className="text-base font-semibold text-ink">{FORMAT_LABEL[format]}</h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink-2">
          <Bot size={12} strokeWidth={1.75} aria-hidden />
          {agentName}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Tên agent</label>
          <input
            type="text"
            value={skill.agent}
            placeholder={FORMAT_AGENT[format]}
            onChange={(e) => setSkill({ ...skill, agent: e.target.value })}
            className="w-full rounded-md border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Phong cách viết</label>
          <textarea
            rows={4}
            value={g("style")}
            onChange={(e) => setSkill({ ...skill, style: e.target.value })}
            className={ta}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Đối tượng người học</label>
            <input value={g("audience")} onChange={(e) => setSkill({ ...skill, audience: e.target.value })} placeholder="vd: HS lớp 7, học lực trung bình"
              className="w-full rounded-md border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Độ dài / quy mô</label>
            <input value={g("length")} onChange={(e) => setSkill({ ...skill, length: e.target.value })} placeholder="vd: 6–8 slide; 5 câu quiz"
              className="w-full rounded-md border border-line bg-surface-2/60 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand" />
          </div>
        </div>

        {showImage && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Phong cách hình ảnh</label>
            <textarea
              rows={4}
              value={skill.imageStyle}
              onChange={(e) => setSkill({ ...skill, imageStyle: e.target.value })}
              className={ta}
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Hướng dẫn tạo</label>
          <textarea
            rows={5}
            value={g("guide")}
            onChange={(e) => setSkill({ ...skill, guide: e.target.value })}
            className={ta}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Ràng buộc bắt buộc <span className="font-normal text-muted">— AI phải tuân thủ</span></label>
          <textarea rows={3} value={g("constraints")} onChange={(e) => setSkill({ ...skill, constraints: e.target.value })}
            placeholder="vd: mỗi slide tối đa 4 gạch đầu dòng; luôn có 1 ví dụ đời thường; không dùng thuật ngữ ngoài SGK" className={ta} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Mẫu tham chiếu <span className="font-normal text-muted">— dán 1 mẫu chuẩn để bám văn phong</span></label>
          <textarea rows={4} value={g("sample")} onChange={(e) => setSkill({ ...skill, sample: e.target.value })} className={ta} />
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || busy}>
            <Save size={16} strokeWidth={1.75} aria-hidden /> {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function AgentsPanel() {
  const [data, setData] = useState<AgentsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    getData<AgentsData>("formatSkills")
      .then((d) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được dữ liệu"));
  }, []);

  const onSaved = (format: AssetFormat, skill: FormatSkill) => {
    setData((cur) => (cur ? { ...cur, skills: { ...cur.skills, [format]: skill } } : cur));
    show(`Đã lưu skill cho ${FORMAT_LABEL[format]}`);
  };

  if (err) return <LoadError msg={err} />;
  if (!data) return <PageLoading />;

  return (
    <>
      {toast}
      <div className="fade-up">
        <h1 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <Bot size={20} strokeWidth={1.75} aria-hidden /> Xưởng agent AI
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Mỗi định dạng học liệu do một agent AI chuyên trách tạo ra. Chỉnh &lsquo;file skill&rsquo; bên dưới để đổi phong cách viết, phong cách ảnh và cách tạo cho từng loại.
        </p>

        <Card className="mt-4 border-brand-line bg-brand-bg p-4 text-sm text-brand-ink">
          {data.hasKey
            ? "Đang dùng OpenRouter (DeepSeek)"
            : "Đang dùng bộ soạn mô phỏng — cắm OPENROUTER_API_KEY để dùng AI thật"}
        </Card>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {data.formats.map((f) => (
            <AgentCard
              key={f}
              format={f}
              base={data.skills[f] || emptySkill()}
              onSaved={(skill) => onSaved(f, skill)}
              onError={(msg) => show(msg, "err")}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// Route cũ /agents → chuyển vào tab trong trang Cài đặt
export default function AgentsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings?tab=agents"); }, [router]);
  return null;
}
