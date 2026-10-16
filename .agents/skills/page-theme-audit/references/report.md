# 报告形状

## report.md 模板

```markdown
# <artifact-id> × <style-set-id>

结论：<阻断 | 需修改 | 通过> · 客观阻断 <N> · 意见 高 <a> / 中 <b> / 低 <c>

- 资产：<asset-dir>（可选模块：<有的列出>；缺：<缺的列出>）
- 产物：<文件 / URL 列表> · 粒度 <component | floor | page>
- 审阅：<独立 | 独立性降级：原因>

## 1. 客观阻断

来源：page-theme-tools `lint`，原样摘录，不改判。

| # | 类别 | 位置 | 值 | 工具说明 |
| --- | --- | --- | --- | --- |
| 1 | <lint 的阻断 code> | <文件:行 或 选择器> | <源值> | <工具原文> |

类别照抄 lint 的 code；阻断清单以 `../page-theme-tools/tools.md` 的 lint 表为准，本模板不另列。无阻断时写「无」。

## 2. 指标（不阻断）

| 指标 | 值 | 说明 |
| --- | --- | --- |
| lint 报警（按 code 计数） | <数> | |
| 非资产断点 | <列表> | |
| 横向溢出（capture `overflow`） | <宽度列表/无/未测> | |
| 对比度不足（capture `lowContrast`） | <数/未测> | |
| 字号种类（capture `fontSizeCount`） | <数/未测> | |

工具未给的写「未测」，不估数。

## 3. 视觉 / 风格意见

### 评分

| 品牌一致 | 视觉层级 | 内容适配 | 响应式 | 完成度 |
| --- | --- | --- | --- | --- |
| <0-2/n/a> | | | | |

### 意见

| id | 维度 | 严重度 | 位置 | 观察 | 依据 |
| --- | --- | --- | --- | --- | --- |

### 组件偏离规范（不阻断）

对照 `components.md` 与全家福截图的人判结果：偏离条数与「规范缺口提示」条数（资产无 token 的几何只提示、不算偏离），或「资产未提供组件层，未判」。明细在上表，维度为「组件」。

### 规范缺口如实（不阻断）

资产缺整类值时的人判结果：未列 / 借用资产前缀 / 冒充资产值各几条，或「不适用」。明细在上表，维度为「规范缺口」。

## 4. 证据

- 截图：<1440 / 768 / 375 路径，或缺失原因>
- 机检原样输出：<路径>
- inventory（若附）：<路径>

## 5. 建议

按严重度排，先阻断后意见。每条只说改成什么、引用哪个 token 或范例；不写补丁，不代改。
要执行替换或刷主题 → 交 `page-theme-generate`。
```

## audit.json（可选）

```json
{
  "artifact": { "id": "", "inputs": [], "granularity": "page" },
  "asset": { "dir": "", "styleSetId": "", "optionalModules": [] },
  "verdict": "阻断",
  "objective": { "blocking": [], "metrics": {}, "source": "<lint 原样输出路径>" },
  "review": { "independent": true, "scores": {}, "opinions": [] },
  "evidence": { "screenshots": {}, "inventory": null }
}
```

- `objective.blocking` 逐条照搬 lint，不增删、不改写。
- 路径相对报告目录，分隔符 `/`；不写时间戳、耗时、随机 id，便于 diff。
- inventory 只列「源值 × 用途 × 处数 × 候选 token」，无裁决字段。
