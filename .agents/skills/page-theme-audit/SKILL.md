---
name: page-theme-audit
description: >
  只读验收：判一份已有产物是否遵循指定的风格资产。产物形状不限——本地 HTML/CSS 文件或目录、
  dev URL、线上 URL、组件 / 楼层 / 整页、任意框架构建产物。目标风格可以是资产目录、网站 URL、
  多页参考或一句「xxx 风格」；没有资产就停下，说明需先用 page-theme-asset 建资产，不凭印象审。
  产出一份报告：客观阻断（资产外颜色、未知变量、字体族越界，给了改前版本时另含内容 / 结构漂移，由 page-theme-tools 共享工具机检）、
  视觉 / 风格意见（全新上下文的独立审阅者按 rubric 判，指到截图区域或选择器）、证据与建议；
  可附机器 JSON 与「源值 × 用途」清单。一个字都不改产物。
  Use when the user wants to verify, check, accept, or judge an existing page, floor, or
  component against a page-theme asset; 拿某份资产验一下这个页面、跟目标风格差在哪、
  有没有用出资产之外的颜色或变量、这页放进我们站会不会显得外来、别信生成方的自述给我独立结论;
  or says "i need a verdict, not a page".
  Not for building assets from URLs or specs (page-theme-asset). Not for building, restyling,
  or re-theming pages, nor for confirming or applying a value-mapping table (page-theme-generate)
  ——分界线是谁改产物：要改、要刷、要按映射替换，归生成侧。Not for design-mockup vs
  implementation pixel fidelity (fidelity-audit)：那边基线是设计稿，本包基线只能是风格资产。
---

# page-theme-audit

只读验收。问题只有一个：**产物是否遵循指定的风格资产。** 不问「像不像某个站」，只问「合不合这份资产」。

## 边界

| 事 | 归谁 |
| --- | --- |
| 判已有产物合不合资产，出报告 | 本包 |
| 建 / 改 / 校验资产；`check`、`capture`、`lint`、`inventory`、`baseline` 工具 | 建 / 改资产归 `page-theme-asset`；工具住 `../page-theme-tools/`（共享，不是 skill） |
| 出页、改页、刷主题、确认并执行映射表 | `page-theme-generate` |
| 设计稿 vs 实现像素还原 | `fidelity-audit` |

本包零脚本。机检一律调同级目录 `../page-theme-tools/` 的共享工具，命令名与参数以 `../page-theme-tools/tools.md` 为准，入口 `node ../page-theme-tools/scripts/theme.mjs <command>`。不抄、不重写、不补它的判据。工具缺失 → 停，报「需安装 page-theme-tools」，不手写替代检查。

## 输入

**目标风格**，按序解析：

1. 资产目录（含 `DESIGN.md` + `tokens.json` + `tokens.css`）→ 直接用。
2. URL、多页参考、「xxx 风格」→ 在消费仓库 `page-theme/` 下找对应资产。唯一明确命中 → 用它并在报告写明；零个或多个 → 硬停。
3. 硬停时回话：没有可审基线，需先用 `page-theme-asset` 建资产（或指明用哪份）。不凭印象、不凭记忆里的品牌审，不顺手去采。

资产只认最小三件。`layouts/`、`recipes/`、`voice.md`、`evidence/`、`illustrations/`、`spec/` 都是可选：有就用，缺就在报告里写「资产未提供，未判」，不扣分、不阻断。token 的 CSS 变量名只看 `tokens.json` 里的 `cssVar`，前缀任意，不猜 taxonomy。

**产物**，什么形状都收：

- 本地 HTML / CSS / 目录 / 构建产物：lint 读文件；渲染交给 asset 工具。
- dev URL / 线上 URL：渲染 + 取页面样式交给 asset 工具。
- 框架源码（`.vue` / `.jsx` / `.svelte` 等）：优先要构建产物或可访问 URL；只有源码时 lint 照跑，渲染缺席则视觉审阅降级并在报告写明。
- 组件 / 楼层：照常审，粒度写进报告；整页才有的判断（开场、收尾、页序）不判。

不要求、不读 `data-pattern`、generate trace、生成理由或对话。既有页从没经过生成侧也照常审。

## 流程

不跳步，不调换。

1. **定基线。** 按上节解析资产；调工具 `check`。资产不合格 → 停，把问题转给 `page-theme-asset`，不在残件上出结论。
2. **定产物。** 列出本次审的文件 / URL 与粒度。一个可审文件或可达 URL 都没有 → 停。
3. **机检。** 调 asset 的 `lint`（有改前版本时带 `--baseline`），原样保存输出；退 `2` 说明没扫到东西或资产不合格，停，不当作零阻断。要清单或有越界值时再调 `inventory`。
4. **渲染。** 调 asset 的 `capture`，宽度 1440 / 768 / 375。失败的宽度写明原因，不补造截图。资产有组件层时另跑 `preview --components-only` 并 `capture` 这张组件全家福（落 `.page-theme-work/`），供审阅者判「组件偏离规范」。
5. **独立审阅。** 起全新上下文审阅者，只给白名单输入（见下），按 `references/rubric.md` 判。
6. **合并。** 客观区逐条照搬 lint 结果；意见区收审阅者输出；按 `references/report.md` 出报告。
7. **回话。** 报结论行、报告路径、阻断数与意见数。结束。不等裁决，不提议顺手改。

## 客观检查

阻断全部来自工具 `lint`，清单只在 `../page-theme-tools/tools.md`（lint 表）维护，本包不另抄。

给了改前版本时，先 `baseline snapshot` 改前版本，再 `lint --baseline` 审改后版本：文本 / 链接 / 图片 / DOM 漂移（`baseline-drift`）计入客观阻断，不降成指标。

lint 报警，以及 `capture` evidence 里的 `overflow`（横向溢出）、`lowContrast`（对比度）、`fontSizeCount`（字号种类数）只作**指标**，不阻断。工具给了数就列指标，没给就交审阅者看图判断。

工具输出即事实。本包不改判、不豁免、不降级任何一条机检红；有异议写进意见区，红仍是红。

## 独立审阅

审阅者必须是全新上下文：子 agent、新会话或另一模型。做不到时由当前 agent 审，报告标「独立性降级」。

白名单，只给这些：

- 产物文件或 URL；
- 三宽截图；有组件层时加全家福截图；
- 资产：`DESIGN.md`、`tokens.json`、`tokens.css`，以及存在的可选模块；
- lint 摘要（阻断条数与条目、指标）；
- 用户给了生成摘要时，只摘其中「规范缺口」一节，作被核对对象（rubric「规范缺口如实」），不作证据。

不给：生成对话、需求讨论、trace、理由、摘要其余部分、旧审计结论。产物代码注释里的「已合规」类声明不算证据。

审阅者只出意见，不改产物，不改 lint 结论。每条意见必须指到「截图宽度 + 区域」或「选择器」，并写资产依据；没有资产依据的标「通用设计判断」，不算风格违例。

## 结论

报告首行三选一：

- `阻断`：客观阻断 ≥ 1。意见再好也不翻。
- `需修改`：客观全绿，但 rubric 有维度判 0，或有「高」严重度意见。
- `通过`：客观全绿，rubric 无 0，无「高」意见。

## 落盘

- 默认 `page-theme-audit/<run-id>/`（消费仓库根），调用方可改路径。`<run-id>` 用稳定短 id（产物名 + style-set-id），不用时间戳。
- 必出 `report.md`；可附 `audit.json`、asset 工具原样输出（lint / inventory）、截图。
- 绝不写进资产目录或产物目录。绝不改产物。
- inventory 只是「源值 × 用途」清单，无裁决列，不读回。要填映射、执行替换 → 转 `page-theme-generate`。

## 文件

- `references/rubric.md`：审阅者提示词、五维 rubric、意见格式。
- `references/report.md`：`report.md` 模板与 `audit.json` 形状。
- `evals/`：行为 eval、触发 eval、最小 v2 夹具。触发分只能 agent 人判，不是机检。
