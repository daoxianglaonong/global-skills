# Zenix Lab 风格

冷静、留白多、信息密度低。深墨色文字压在近白底上，青绿只作强调，不铺大面积底色。

## Token

变量见 `tokens.css`，名字与用途以 `tokens.json` 为准。

- 底色 `--zx-color-surface`，文字 `--zx-color-text`，次级文字 `--zx-color-text-muted`。
- 强调 `--zx-color-accent`：主按钮、链接、选中态。
- 字体只用 `--zx-font-sans`。
- 圆角 `--zx-radius-md`，间距 `--zx-space-*`。
- 断点 768px / 1200px。

## Do

- 一屏只放一个主按钮。
- 标题与正文字号差至少两级。

## Don't

- 不用强调色做整块背景。
- 不用投影堆叠层级，用留白和细线分隔。
