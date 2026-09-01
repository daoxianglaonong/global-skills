---
name: page-theme
description: >
  分析线上网站的主题风格并产出可迁移的风格资产，或按已有资产生成与原站不违和的新页面。
  Use when the user wants to analyze or extract a website's page theme, design
  language, visual style, or design tokens from a URL; when they ask to
  分析某站主题风格、提取某站设计系统、抽取 design token、复刻某站风格、
  照着某站做页面、按某站主题生成新页; or mention site theme extraction /
  clone a site's look. Do not use for generic UI or landing-page design that
  does not name or imply a source website.
compatibility: >
  人读提示，不是安装或依赖解析契约：Node ≥ 20 · Playwright Chromium。
---

# 页面主题分析（page-theme）

采集：给定一组线上 URL，跑本包脚本确定性采集，落一份框架无关的风格资产目录 `page-theme/<style-set-id>/`。生成段：读该资产目录，生成原站不存在的新页面而不违和。两段同属本 skill。
`page-theme/<style-set-id>/README.md` 是本文件任务路由与正向纪律的投影；资产搬到未装本 skill 的仓库时，只读它即可开始取用。
本包文件地图：`references/extract.md`（只在采集时读）·`references/generate.md`（只生成段读）·`references/shared-contract.md`（两段共用）·`scripts/`（确定性采集脚本）。

## 任务路由

按任务读，整盘不灌。每次只打开本任务本页用得上的文件与路径。

```yaml
task_routes:
  - id: analyze
    何时: 用户要求分析 / 提取 / 更新某站主题资产
    必读: [references/extract.md（装了本 skill 才有）, 脚本落盘后的 raw（按短摘要列出的文件 · 按字段取）, screenshots/index.json, 当前要核的截图（按 index 逐张取）]
    按需: [references/shared-contract.md, site-overrides.yaml, input/design-system/（存在才读）, holdout.yaml（存在则必须尊重 · 不得采其中页）]
    禁止整盘: [tokens.json 全文, "全部 patterns/{id}.yaml", 上一版 DESIGN.md（增量重算除外）, raw/ 大表当 tool 返回值]
  - id: generate
    何时: 用户要求按某站风格生成原站没有的新页面
    必读: [README.md（先读索引）, DESIGN.md §1 Overview 与 §8 Don't, patterns/index.yaml 的 rhythm（已采页取其 sequence · 新页取 page_skeletons 选中的那一型）, sequence 内出现的内容楼层 yaml（只这些）, tokens.json 本页将用到的 semantic / component 路径, patterns/chrome.yaml（仅生成整页 · 生成单个楼层或组件不读）]
    按需: [voice.md（本页有文案槽才读）, tokens.dark.json 与 resolver.json（有暗色且本页需要）, "patterns/{id}.notes.md（存在才读）", screenshots/index.json 与需核的图（confidence 非 high 时必须）, references/generate.md, references/shared-contract.md]
    禁止整盘: [tokens.json 全文, raw/, 未出现在目标 sequence 的楼层 yaml, run-meta.json, input/design-system/ 原文, holdout.yaml（不得拿留出页当临摹稿）]
  - id: accept
    何时: 用户要求验收 / 体检 / 500ms 归属测试
    必读: [holdout.yaml, README.md, DESIGN.md §8 Don't, tokens.json 的合法色值全集与字体栈（供门对照 · 不当阅读材料整盘灌）, 生成或重建产物（页 + 其 CSS / DOM）, 本次工作区的 generate-trace*.json 与 rebuild-trace.json（落验收工作区 · 不进资产目录）, screenshots/index.json 与对照所需的图, coverage 对象（至少 status 与 pages 长度与 blockers 与 holdoutDeclared）]
    按需: [patterns/chrome.yaml（页壳轨触发时）, patterns/index.yaml 与被测页 sequence, voice.md（文案轨）, run-meta.json 的 startedAt（只核 holdout 时效 · 不当风格源）, "raw/supply-match.json（有供给时）"]
    禁止整盘: [tokens.json 全文当散文, raw/ 除本次对照所需, 全部楼层 yaml, input/design-system/ 原文]
```

`tokens.json` 只取当前用得上的 semantic / component 路径，整盘不得进上下文。
上表任何读取序只在本路由内有效，不得提升为跨任务强制序。
采集不得预加载上一版 `DESIGN.md`；重算投影是例外，不得把它当可编辑真相源。

## 采集

顺序必须是：前置检查 → 跑 `extract-theme.mjs` → 脚本落盘 → agent 读盘归纳。脚本还在跑时不得把部分大 JSON 预灌进上下文。

前置检查必须按序执行，任一失败即停在采集段、不得开始导航：

| # | 检查项 | 通过判据 | 失败时给的安装命令 |
| --- | --- | --- | --- |
| 1 | Node | `node` 可执行，主版本 ≥ 20（**本项目自定**下限） | 安装 Node 20 或以上 LTS，并确保 `node` 在 PATH |
| 2 | 本包依赖 | `scripts/node_modules/playwright` 匹配 `1.62.x`；`@projectwallace/css-analyzer` 匹配 `9.9.x` | 在 `scripts/` 执行 `npm ci` |
| 3 | 浏览器二进制 | Playwright Chromium 的 `executablePath()` 指向的文件存在且可启动 | 在 `scripts/` 执行 `npx playwright install chromium` |
| 4 | 禁装包 | `extract-css-core` 不在 `node_modules` 与 lockfile | 删除该依赖，回到本包移植模块 |

失败时的回话必须是下列形态，不得只说「你自己装一下」，不得在失败后继续编造资产：

```text
采集前置检查未通过，已停在采集段，未开始抓取。

缺项：
- <检查项名>：<实测值或「未安装」>

请在本 skill 的 scripts/ 目录执行：
<对应安装命令，每行一条>

完成后用原参数重新调用本 skill。
```

硬失败线只有两条：前置检查未通过；主 URL 在浏览器已启动后仍拿不到首屏 DOM。非主 URL 失败不得触发硬失败。
除上述两条外一律继续交付资产并如实标缺口——登录墙、反爬、单页超时、暗色探测失败、供给不受理都不是拒绝产出的理由。
脚本必须落盘后以短摘要退出；agent 只读短摘要 + 按需 raw / 截图，不得把采集大表当 tool 返回值。
归纳时措辞必须用「候选 / 非权威 / do not infer」，不得指望脚本 JSON 自己说话。
只有 `high` 才允许不读图直填；其余档必须读图确认或推翻，语义类字段永不给 `high`，故必须读图。
默认软停：只跑用户给出的 URL，不自动加其它路径。单页资产是合格产物，扩充必须走二次调用。
`holdout.yaml` 已存在时必须尊重、不得采其中页；不存在时不提示、不追问、静默继续跑。
受阻项必须写进 `coverage.blockers`，覆盖范围写进 `coverage` 对象；不得改用拒绝产出来代替。
采集末尾必须在 `README.md` 之后追加一条 `run-meta.json` 台账（append-only，只作台账不当风格源）。
主题一致性体检必须做且必须不阻塞：照常产出一份聚合资产，判据复用 `exact` / `near` / `different` 三档，不得新造分歧阈值。
体检报「疑似多套设计语言」时必须如实曝光，并在待办项里给建议分组与依据；交付之后才可以在对话里问要不要拆成多份资产。
全程不阻塞：不得为等确认、补 URL、选代表页、装可选 skill 或供给是否存在而停下整趟 run。

需要人的事一律降级成产出物里的待办，不得新开资产清单以外的待办文件：

| 待办种类 | 宿主字段 |
| --- | --- |
| 选择器草稿 | `site-overrides.yaml` 的 `proposed` |
| 低置信度项 | 该字段的 `confidence` |
| 候选代表页 | `coverage` 内的候选页 |

## 生成段

先判定已有资产：`asset_dir` 存在且含 `README.md` 才算有；空目录或只有 `input/` 一律视为无资产。

无资产的生成请求必须自动串联——先分析再生成，开跑前用一句话告知，不等确认：

```text
未找到 page-theme/<style-set-id>/ 资产，先分析 <主 URL> 再生成，开始采集。
```

用户只要求分析时只跑采集；只要求生成且资产已在时只跑生成段。
按 `generate` 路由读，逐文件按需打开，取用粒度见 `references/generate.md`。
已采页的楼层序列取其 `sequence`；原站不存在的新页没有 `sequence`，必须先在 `page_skeletons` 里选一型，只把选中那一型读进上下文。
型库里没有对应型时不得硬失败，按形态缺口处理。
新页序列一律按候选处理，必须读图确认后再定稿。
生成任务必须声明目标 variant；读 `chrome.yaml` 时只取匹配那条，无匹配回退 `default`，一页之内不得混用多个 variant 的页壳条目。
体检判「疑似多套设计语言」时目标 variant 必须显式给出，不得用缺省；此处回话要求指定不违反不阻塞纪律。
生成整页必读 `patterns/chrome.yaml`，生成单个楼层或组件不读。
软停的单页资产必须照常消费，不得因「不是全站」拒绝生成。
截图必须经 `screenshots/index.json` 寻址后逐张取，不得无索引扫目录。
缺口二分：值缺口必须 omit 或按最近语义拼并并标记，形态缺口才允许发挥，见下节与 `references/generate.md`。
生成段结束后必须跑门，不得靠措辞代替门：

| 态 | 编排器行为 |
| --- | --- |
| 阻断类失败 | 必须自行修复并重跑门；修不了才向用户回话，不得把失败产物当完成 |
| 报警类 | 只进本次报告，不阻断交付 |

门的规则条目与数字不在本文件；本文件只规定要跑与跑完怎么处置。
自证只准用 lint / schema / 映射存在性的机检结果，不得用「我读了 Don't」这类自述代替门。
`README.md` 必须带「无脚本时至少人工核这几条」节；生成侧在未装本包脚本的仓库里以该节为门。

## 正向纪律

下列三句是现行冻结文本，采集与生成段一律逐句遵守。

1. 颜色与字体族只走资产里的 semantic / component 路径。
2. 资产未给出的值必须 omit，或用资产已有的最近语义拼并并按资产字段标 `lossy`；不得编造。
3. 不受理的供给格式必须显式回话，然后继续跑。

执行分层：

| 层 | 写什么 | 谁执行 |
| --- | --- | --- |
| 本文件正文 | 上列正向纪律 | agent 先守，生成后由门复核 |
| 资产 `DESIGN.md` Don't 与 `voice.md` 禁词 | 站点特异、一条一义 | 门查条目在不在 |
| `scripts/` 与生成后门 | 可机检项 | 生成段结束必跑 |

站点特异的 Don't 与禁词属资产，不得搬进本文件。

## 形态缺口最低纪律

只用于形态缺口。值缺口仍走正向纪律第 2 句，不得用本节发挥。

```text
形态缺口（原站没有的板块类型）才允许发挥：新造板块必须有明确方向，避免模板化堆叠与无特征的均匀留白。
新造形态只能使用本站资产已有的 token 与节奏，不得另起色盘或字体族来制造「个性」。
若环境已安装 frontend-design，可再读其全文当作形态质量下限；未安装不视为失败，以上即为最低纪律。
```

新造形态的容器与楼层间距必须落进本站已观测的节奏，不得自定站级默认。
不得引进「设计文件优先」的自动回退来补缺映射；缺映射按值缺口处理。
对其它 skill 一律软引用：装了可再读，不装也不失败，资产口径始终优先。
`responsive-design` 的可用摘录只在 `references/generate.md`，正文不复述。

## 脚本与供给

本节参数与目录全部标「**本项目约定**」；三家 frontmatter 均为闭集，不得把它们写成 Agent Skills 标准字段。采集必须跑本包脚本，禁止每次现写采集代码。

```text
node scripts/extract-theme.mjs --url <abs-url> [--url <abs-url> ...]
  [--supplied <path-or-url> ...]
  [--asset-dir <dir>]
  [--style-set-id <id>]
```

| 参数名 | CLI | 基数 | 语义 | 缺省 |
| --- | --- | --- | --- | --- |
| `url` | `--url` | 采集 1..n；生成段 0..n | 绝对 URL，可跨注册域。第一个是**主 URL**，决定默认 `style-set-id` 与 variant 分组基准 | 采集无缺省，缺则回话要 URL 但不停下其它已能做的事；生成段可从已有资产推断 |
| `supplied` | `--supplied` | 0..n | 用户供给的设计系统，本地路径或 URL；URL 由脚本抓取后落盘到该站 `input/design-system/` | 空 |
| `asset_dir` | `--asset-dir` | 0..1 | 覆盖资产根目录；覆盖的是路径，不是 style-set 边界 | `page-theme/<style-set-id>/` |
| `style_set_id` | `--style-set-id` | 0..1 | 显式命名本份资产，只含 `[a-z0-9-]`，其余字符换连字符 | 主 URL 的 eTLD+1 归一名 |

供给约定目录跟站走，存在即自动收编；禁止使用工作区根下全局 `input/`：`page-theme/<style-set-id>/input/design-system/`。
参数与目录都空 = 无供给，继续跑、不追问；不得把「你有没有设计系统？」当无人值守默认。
参数表保持最小，只此四项；脚本内部开关不得升为 CLI 参数或写进本节。
不受理的供给格式必须显式回话，然后跳过该文件继续，不得静默忽略：

```text
供给「<文件名或 URL>」格式不受理，已跳过。v1 只收 DTCG tokens.json 与 CSS 自定义属性表。
请转换后放入 page-theme/<style-set-id>/input/design-system/ 或再次传入 --supplied。本次分析继续。
```
