# 已确认映射表（eval 用：模拟用户第二次调用时贴回的整表）

资产：`evals/fixtures/acme-full`    射程：`index.html`、`style.css`

| # | 源值 | 用途 | 处数 | token | 匹配 | 决定 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | #333333 | 正文与标题色 | 3 | --acme-text | 近似 | 映射 |
| 2 | #ffffff | 页面底、卡片底 | 3 | --acme-surface | 精确 | 映射 |
| 3 | #ffffff | 按钮与角标上的字 | 2 | --acme-on-accent | 精确 | 映射 |
| 4 | #666666 | 辅助说明 | 2 | --acme-text-muted | 近似 | 映射 |
| 5 | #0a66c2 | 主按钮底、链接 | 2 | --acme-accent | 近似 | 映射 |
| 6 | #ff5a00 | 促销角标底 | 1 | — | 无 | 保留 |
| 7 | #f5f5f5 | 交替楼层底 | 1 | --acme-surface-alt | 近似 | 映射 |
| 8 | #e5e5e5 | 卡片描边、分隔线 | 2 | --acme-line | 近似 | 映射 |
| 9 | 0 2px 8px rgba(0, 0, 0, 0.08) | 卡片阴影 | 1 | --acme-shadow-card | 近似 | 映射 |
| 10 | Arial, sans-serif | 全站字体 | 1 | --type-sans | 替换 | 映射 |
| 11 | 40px | 首屏标题字号 | 1 | --type-h1 | 精确 | 映射 |
| 12 | 28px | 卡片标题字号 | 1 | --type-h2 | 精确 | 保留（用户改） |
| 13 | 4px | 按钮圆角 | 1 | --acme-radius-control | 近似 | 映射 |
| 14 | 12px | 卡片圆角 | 1 | --acme-radius-card | 精确 | 映射 |
| 15 | 64px | 楼层上下内边距 | 2 | --acme-space-xl | 精确 | 映射 |
| 16 | 32px | 楼层左右内边距、栅格间距 | 4 | --acme-space-lg | 精确 | 映射 |
| 17 | 16px | 卡片与按钮内边距 | 2 | --acme-space-md | 精确 | 映射 |
| 18 | 8px | 按钮与角标内边距 | 2 | --acme-space-sm | 精确 | 映射 |
| 19 | 2px | 角标上下内边距 | 1 | — | 无 | 保留 |
| 20 | 1px | 描边宽 | 2 | — | 无 | 保留 |

用户回复：「第 12 行改保留，其余确认。」
