# page-header.case-hero

观测来自本机 Figma 导出稿 `demo/detail.html`（采集 URL `http://127.0.0.1:18765/detail.html`），不是线上 `cases.html`。线上客户案例页仍在 `holdout.yaml`，本型不得拿去顶替留出对照。

采集 landmarks 把 1920×3535 画板收成单一 `sec-00`，未切出头图层。三档几何一律缺测。人读 PC 是左标题栏约 1056 宽、右双钮 248 宽，内容区 1600；不得把该层 `single-column` 量到的 304（右栏宽）写进本篇 `content_width_px`。

视口是 fallback（稿面无 `@media`），窄档图是裁切定宽画板，不是真响应式。
