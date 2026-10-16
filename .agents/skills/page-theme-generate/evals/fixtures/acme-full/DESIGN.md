# acme-full

企业云服务风格。白底与浅灰底交替，品牌蓝只给行动。信息密度中等，靠卡片与栅格组织。

- 颜色：见 `tokens.css`。正文 `--acme-text`，辅助 `--acme-text-muted`；楼层底在
  `--acme-surface` 与 `--acme-surface-alt` 间交替；描边 `--acme-line`。
- 排印：字体栈 `--type-sans`；字号三档 `--type-h1` / `--type-h2` / `--type-body`。
- 间距：楼层上下 `--acme-space-xl`，栅格 `--acme-space-lg`，卡片内 `--acme-space-md`。
- 控件：按钮圆角 `--acme-radius-control`，卡片圆角 `--acme-radius-card`，悬浮用 `--acme-shadow-card`。
- 断点：`@media (max-width: 1199px)`、`@media (max-width: 767px)`。

布局见 `layouts/index.md`，页型见 `recipes/index.md`，文案见 `voice.md`。
本资产没有 `evidence/` 与 `illustrations/`：自查对照本文件描述。

Don't：品牌蓝做大面积楼层底；一页多个实心主按钮；卡片同时用描边和阴影。
