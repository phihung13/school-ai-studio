# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Studio (Việt Anh KG) — image chạy trên VPS Linux.
#   • Next 16 + node:sqlite (DatabaseSync) → cần Node ≥ 23 để dùng KHÔNG cần cờ.
#   • Bản dịch KHÔNG dùng `output: standalone` — app đọc file lúc chạy bằng
#     process.cwd() (src/lib/templates/*.typ|*.css, node_modules/@marp-team/marp-cli)
#     nên phải giữ trọn node_modules + src, chạy bằng `next start`.
#   • Cài sẵn binary tính năng nặng: chromium (slide PPTX/PDF qua marp),
#     ffmpeg (hậu kỳ podcast), typst (worksheet/bài đọc PDF), python+edge-tts (TTS Việt).
#   • DB (data/studio.db) KHÔNG bake vào image → mount volume lúc chạy.
# ─────────────────────────────────────────────────────────────────────────────
ARG NODE_IMAGE=node:24-bookworm-slim

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true

# Cài deps trước (tận dụng cache layer khi chỉ đổi source)
COPY package.json package-lock.json ./
RUN npm ci

# Build Next rồi cắt devDependencies để runtime gọn
COPY . .
RUN npm run build && npm prune --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ARG TYPST_VERSION=v0.13.1
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    STUDIO_DB=/app/data/studio.db \
    CHROME_PATH=/usr/bin/chromium \
    CHROME_NO_SANDBOX=1 \
    TYPST_BIN=/usr/local/bin/typst \
    FFMPEG_BIN=/usr/bin/ffmpeg

# Binary tính năng nặng + font tiếng Việt/emoji cho chromium & typst
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
        python3 python3-pip python-is-python3 \
        fonts-liberation fonts-dejavu fonts-noto-core fonts-noto-color-emoji \
        ca-certificates wget xz-utils tini; \
    # edge-tts (bookworm chặn pip hệ thống → --break-system-packages là chuẩn trong container)
    pip3 install --no-cache-dir --break-system-packages edge-tts; \
    # typst (bản musl tĩnh, chạy mọi distro)
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) t_arch=x86_64 ;; \
      arm64) t_arch=aarch64 ;; \
      *) echo "kiến trúc chưa hỗ trợ typst: $arch" >&2; exit 1 ;; \
    esac; \
    wget -qO /tmp/typst.tar.xz "https://github.com/typst/typst/releases/download/${TYPST_VERSION}/typst-${t_arch}-unknown-linux-musl.tar.xz"; \
    tar -xf /tmp/typst.tar.xz -C /tmp; \
    mv "/tmp/typst-${t_arch}-unknown-linux-musl/typst" /usr/local/bin/typst; \
    chmod +x /usr/local/bin/typst; \
    rm -rf /tmp/typst* /var/lib/apt/lists/*

# App đã build (node_modules đã prune, .next, src, public, workers/podcast, next.config…)
COPY --from=builder /app /app
# Không bake DB: data/ là điểm mount volume lúc chạy
RUN rm -rf /app/data && mkdir -p /app/data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok||r.status===307?0:1)).catch(()=>process.exit(1))"

# tini = PID 1 gọn (thu hồi zombie từ chromium/ffmpeg/python con)
ENTRYPOINT ["/usr/bin/tini", "--"]
# Boot: nếu có SUPABASE env → dựng data/studio.db từ studio_kv (pull-db) rồi mới chạy; không có env → pull-db bỏ qua, dùng db local.
CMD ["sh", "-c", "node scripts/pull-db.mjs && npm run start"]
