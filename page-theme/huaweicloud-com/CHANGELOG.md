# Changelog

## 1.1.0

- 新增 `component.button.danger.fg-hover`（`--porx-button-danger-fg-hover`）：危险按钮悬浮文字 `#FAA9A5`。色板未印，由标注指定。
- 新增 `component.button.danger.border-hover`（`--porx-button-danger-border-hover`）：危险按钮悬浮描边 `#F76360`。色板未印，样张量到后由标注确认。
- 新增 `component.button.bg-disabled`（`--porx-button-bg-disabled`）：胶囊按钮共用的禁用底，引用色板禁用底 `{color.bg.disable}`。主按钮、次按钮、危险按钮相同。
- 改值 `component.button.secondary.bg-hover`：由 `{color.bg.primary-hover}` 改为 `{color.bg.disable}`。theme-token.css 次要按钮悬浮底是 5% 黑。
- 改值 `component.button.secondary.fg-hover`：由 `{color.text.inverse}` 改为 `{color.text.primary}`。悬浮字与默认同色。
- 改值 `component.button.danger.bg`：由 `transparent` 改为 `{color.bg.container-1}`。theme-token.css 危险按钮底是白。
- 改值 `component.tag.gray.fg`、`component.tag.orange.bg`、`component.tag.orange.fg`、`color.bg.tag.gold`、`component.input.fg-disabled`：按 theme-token.css 对齐标签字色、金渐变色标和输入框禁用字。
- 新增图标字体 `porx-icon`（对应门户 `por-icon`）和复选勾 `porx-icon-confirm`。

## 1.0.0

首发。资产前缀是 `--porx-`（x = next），与站点 `--por-` 隔离，避免同名不同值。规范印名在 `specName`，站点变量名在 `siteNames`。未发布过，改名不保留旧变量。

- 只收规范值（`valuePolicy: spec-only`）：色板语义色、阴影、排印角色字重，以及有规范来源的组件色和阴影。
- 删去全部 `site-provisional` 与英文标签字重占位。字号、行高、间距、圆角、断点、字体栈、控件尺寸待标注，见 `spec/annotation-template.md`。
- 组件保留按钮、文字链、标签、输入框、复选与单选、视频控件、卡片、提示条的规范色和样张形态。下拉、开关、Tab、分页、图标按钮待补充。
