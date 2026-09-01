# page-theme · 采集规程

只在采集时加载。生成段不读本文件。

本文件是可操作规则的完整载体：写出资产所必需的规则一律内联；采样矩阵、渲染稳定门、CDP 用法、选择器名单、断点聚类算法一律不在此，它们是脚本内部实现，agent 不需要也不得复述。

## 1. 段内硬序

| 步 | 动作 | 硬约束 |
| --- | --- | --- |
| 1 | 前置检查 | 任一项失败即停在采集段，不得开始导航 |
| 2 | 跑 `scripts/extract-theme.mjs` | 确定性采集必须走本包脚本，不得现写采集代码 |
| 3 | 脚本落盘 + 输出短摘要 | 脚本还在跑时不得把部分大 JSON 预灌进上下文 |
| 4 | agent 读盘归纳 | 按短摘要定位文件，按字段取，逐张读图 |
| 5 | 写出资产 | 见「资产写出规程」节 |

不得调换上表顺序。不得跳过第 1 步。不得用第 4 步的读盘代替第 2 步的脚本采集。

## 2. 前置检查与硬失败线

必须按序执行，四项全过才允许导航：

| # | 检查项 | 通过判据 | 失败时给出的安装命令 |
| --- | --- | --- | --- |
| 1 | Node | `node` 可执行，主版本 ≥ 20（**本项目自定**下限） | 安装 Node 20 或以上 LTS，并确保 `node` 在 PATH |
| 2 | 本包依赖 | `scripts/node_modules/playwright` 存在且匹配 `1.62.x`；`scripts/node_modules/@projectwallace/css-analyzer` 存在且匹配 `9.9.x` | 在 `scripts/` 执行 `npm ci` |
| 3 | 浏览器二进制 | Playwright Chromium 的 `executablePath()` 指向的文件存在且可启动 | 在 `scripts/` 执行 `npx playwright install chromium` |
| 4 | 禁装包 | `extract-css-core` 不出现在 `node_modules` 与 lockfile | 删除该依赖，回到本包移植模块 |

- 缺依赖不得降级成 `blockers` 后空跑；此情形与「连首屏 DOM 都拿不到」同属硬失败。
- 失败回话必须用 `SKILL.md`「采集」节给出的固定形态：先说已停在采集段未开始抓取，再逐条列缺项与实测值，再给可直接粘贴的命令，最后要求用原参数重新调用。
- 不得把回话改写成「你自己装一下」而不给命令。不得在检查失败后继续编造资产。
- 硬失败线只有两条：前置检查未通过；**主 URL** 在浏览器已启动后仍拿不到首屏 DOM（导航失败、空白文档、主 frame 不存在）。
- 非主 URL 失败不得触发硬失败：记 `blockers` 并继续。
- 其余一切受阻（登录墙、反爬、单页超时、跨域拒绝、暗色探测失败、供给不受理）一律继续交付，质量只在资产内部表达。

## 3. 脚本入口与参数

```text
node scripts/extract-theme.mjs --url <abs-url> [--url <abs-url> ...]
  [--supplied <path-or-url> ...]
  [--asset-dir <dir>]
  [--style-set-id <id>]
```

参数名与语义在编排器正文与 CLI 之间必须一致，全部标「**本项目约定**」：

| 参数 | CLI | 基数 | 语义 | 缺省 |
| --- | --- | --- | --- | --- |
| `url` | `--url` | 1..n | 绝对 URL，可跨注册域。第一个是**主 URL** | 无缺省；缺则回话要 URL，但不得停下其它已能做的事 |
| `supplied` | `--supplied` | 0..n | 供给的设计系统，本地路径或 URL | 空 |
| `asset_dir` | `--asset-dir` | 0..1 | 覆盖资产根目录 | `page-theme/<style-set-id>/` |
| `style_set_id` | `--style-set-id` | 0..1 | 显式命名本份资产，只含 `[a-z0-9-]` | 主 URL 的 eTLD+1 归一名 |

- `asset_dir` 覆盖的是路径，不是 style-set 边界；`style-set-id` 仍照算并写进资产内部标识。
- 参数表保持最小，只此四项。脚本内部开关（重试模式、截图降级阀）不得升为 CLI 参数、不得写进编排器正文。
- 需要新参数时必须先向本 skill 的维护方提出，不得就地扩表。

脚本必须落盘后以**短摘要**退出，摘要内容固定为：写了哪些文件、主 URL、`style-set-id`、是否软停、主题一致性体检是否报警。

- agent 必须以该摘要作为读盘的唯一寻址依据，不得扫目录猜文件。
- 脚本不得把采集大表打到 stdout；agent 不得把大表当 tool 返回值。

## 4. 输入：柔性收 URL，刚性出资产

- 用户给的 URL 一律**原样**交给脚本；归一化由 `scripts/normalize-url.mjs` 确定性完成，agent 不得自行改写、补协议、删参数。
- 裸域名、markdown 链接、带引号、一行塞多条都必须收；脚本负责拆条与补 `https`。
- query 与 hash 必须原样保留。**不得**删任何参数——它们可能改变页面内容。
- 归一化不得静默：每条 URL 必须在 `raw/session.json` 的 `inputNormalization[]` 里留 `{ inputRaw, normalizedUrl, transforms[] }` 对照。
- agent 归纳前必须核这份对照；实际抓取的地址与用户所给不一致时，必须在交付里指出。
- 归一后仍解析失败或 scheme 不属 `http` / `https` 的条目：记 `blockers`，`code: url-unparseable`，其余 URL 继续。

## 5. style-set 边界、`style-set-id` 与 variant

- 一次调用 = 一份资产 = 一个 `style-set-id`。
- 本次调用给出的全部 URL 构成一个 style-set；**跨注册域一律受理**，显式共同给出即是意图授权。
- 不得以「不同注册域」为由跳过任何 URL。旧口径「跨注册域不收」已作废，`blockers` 里只保留 `url-unparseable`。
- `style-set-id`、`sourceId`、variant 由脚本确定性派生，agent 必须原样采用，不得自拟名字、不得改写 variant。
- variant 一律 host 派生：同注册域下是剥掉 `www` 后剩余的左侧子域标签，跨注册域下是该来源的 eTLD+1 归一名（其后有子域则续接）。v1 不做实测差异聚类。
- 非空 variant 必须交给资产写入侧；页壳按 variant 分条，`tokens.json` 与 `voice.md` 不按 variant 分叉。
- `sourceId` 按本次列表首次出现顺序编号 `source-01`、`source-02`……，一次调用内不得复用。

## 6. 落盘后读什么、怎么读

本次实际写出的文件以脚本短摘要为准；无条件必产的 raw 文件表由采集脚本保证。已知常驻类如下：

| 类 | 位置 | agent 该拿什么 |
| --- | --- | --- |
| 会话与归一化对照 | `raw/session.json` | `inputNormalization[]` 的逐条对照、本次 run 的收 / 不收结论 |
| 逐页观测 | `raw/{page-id}/` | 只取本次要归纳的字段，不整文件读 |
| 文案统计 | `raw/copy-stats.json` | 语气与槽位归纳所需的统计项；语料全文不进上下文 |
| 供给匹配 | `raw/supply-match.json` | 供给命中/未命中、改名与补空线索（有供给才存在） |
| 截图索引 | `screenshots/index.json` | 图的寻址表 |

读法纪律：

- 必须按字段取，不得把任何 raw 文件整份读进上下文。
- 声明频率表、CSSOM 轨道表、语料全文这类大表**不得**进上下文；需要结论时取脚本已算好的统计项。
- 截图必须经 `screenshots/index.json` 寻址后**逐张**取，不得无索引扫目录。
- `raw/` 只在采集时读。生成段不得回头把 `raw/` 当生成输入。
- 上一版 `DESIGN.md` 不得预加载；只有重算投影是例外，且读的是将被整体覆盖的派生物，不是可编辑真相源。
- `holdout.yaml` 存在时必须尊重，不得采集其中列出的页面类型；不存在时不提示、不追问、静默继续。

## 7. 措辞纪律：候选 / 非权威 / do not infer

对外与对内一律用业界自然语言，不得指望脚本 JSON 自己说话：

| 场景 | 必须说 | 动作 |
| --- | --- | --- |
| 脚本给出的未确认值 | 候选（candidate / starter） | 读图确认或推翻后才写进资产 |
| 非 `high` 的字段 | 非权威（not authoritative） | 不得当最终值直填 |
| 未观测到的值 | do not infer | 按值缺口处理：omit，或用已有最近语义拼并并标记损失 |

- 只有 `high` 才允许不读图直填；其余档必须读图确认或推翻。
- 语义类字段按权限尺子**永不**给 `high`，故语义结论必须读图后才定稿。
- 不得把候选值写成已确认事实。不得用「看起来是」「一般来说」给未观测值补值。
- 未观测的必产出字段必须保留字段并标 `observed: false` + `confidence`，不得省字段、不得填 `null`、不得写「未知」字样。

## 8. 软停与二次调用

- 默认软停：只跑用户给出的 URL，不自动加 `/about`、`/pricing` 或任何未给出的路径。
- 单页资产是**合格产物**，不得当成半成品，不得因覆盖面小而拒绝交付。
- 脚本可以顺手写出候选代表页清单，但不得自动开跑；扩充必须走二次调用。
- 二次调用加页时逐页 raw 全量重算派生层，不得增量合并。
- 软停时的单页合格由 `coverage.pages` 长度为 1 且本次无 `runtimeError` 派生；不得把 `single-page` 写成 `coverage.status` 或任何可写入枚举值。

## 9. 供给收编

- 约定目录跟站走，存在即自动收编：`page-theme/<style-set-id>/input/design-system/`。禁止使用工作区根下全局 `input/`。
- `--supplied` 给 URL 时由脚本抓取后落盘到上述目录。
- 参数与目录都空 = 无供给，继续跑、不追问。不得把「你有没有设计系统？」当无人值守默认。
- v1 只受理 DTCG `tokens.json` 与 CSS 自定义属性表。
- 不受理的格式必须显式回话（形态见 `SKILL.md`「脚本与供给」节），然后**跳过该文件继续**，不得静默忽略。
- 供给是配角：**只改名与补空，不得改 `$value`**。命名听设计系统，像素听页面。
- 供给能补的只是「有值没上屏」。页面与供给都没有的值必须 omit，补出来即视为编造。
- 识别出公开设计体系只授权改键名，**不授权造盘**。

## 10. 主题一致性体检

用户把这批 URL 放在一起是**断言**不是事实。必须做体检并如实曝光，但**永不因此拒绝产出**。

- 照常产出一份聚合资产（共享部分 + 各 variant）；体检结果不改变产出与否。
- 判据必须描述性，复用 `exact` / `near` / `different` 三档。**不得**新造分歧阈值、不得写「分歧超过 X% 即判不同语言」。
- 判定一律走 `scripts/lib/derive.mjs` 的 `cohesionAxes`，**不得**在归纳时另写一套或手改结论。
- **`different` 不得由字符串不等推出。** 归一后相等即 `exact`；`exact` / `near` 不构成分歧、不得入列。
- **两侧观测的 `confidence` 都是 `low` 时不得入列**，只记为待人核观测。
- **分歧必须由设计意图的证据支撑。** 字体族差异必须有第一方 `@font-face` 支撑才可能入列；差异只落在系统回退字体（无第一方 `@font-face`、由 OS / 浏览器解析出的默认族）上时一律不入列。
- 可用的落 `different` 信号：跨 variant 的行动色或识别色不同；第一方自带字型资源不同；刻度模式不同；页壳顶栏结构不同。
- 提示必须降级成待办项，含建议分组（哪些 `sourceId` 归一组）与依据（上列哪几项落 `different`）；不得写成开跑前的阻塞确认或中途追问。
- 交付之后才可以在对话里问要不要拆成多份资产；用户要拆则按新分组重新调用，不在本次 run 内自动拆。
- 体检报「疑似多套设计语言」时，本批资产**不适用**品牌归属实验；报告必须如实标注，不得为此改换实验构念。

## 11. 不阻塞与待办降级

- 全程不阻塞：不得为等确认、补 URL、选代表页、装可选 skill、或供给是否存在而停下整趟 run。
- 需要人的事一律降级成产出物里的待办，不得新开资产清单以外的待办文件（不得新增 `todo.md`）。

| 待办种类 | 宿主字段 |
| --- | --- |
| 选择器草稿 | `site-overrides.yaml` 的 `proposed` |
| 低置信度项 | 该字段的 `confidence` |
| 候选代表页 | `coverage` 内的候选页 |

- 受阻项必须写进 `coverage.blockers`，覆盖范围写进 `coverage` 对象；不得改用拒绝产出来代替。
- 人回头批量裁决后走二次调用，不在本次 run 内等他。

## 12. 写出的刚性口径

柔性收输入，刚性出资产。写盘前逐条自检：

1. 每个产出文件必须能过 `scripts/validate-asset.mjs` 的 schema 校验；校验失败属阻断类，必须修好再交。
2. 结构化字段一律闭集枚举 + 定长形状；**不得**用自由散文冒充字段值。
3. 散文只准出现在 `DESIGN.md` / `voice.md` / `{id}.notes.md` 的散文节。
4. 缺观测保留字段 + `observed: false` + `confidence`；缺 `confidence` 即资产不合格。
5. 同一事实一处存放；同一事实要落第二处时必须收敛回一处，不得就地复制。
6. `README.md` 必须由本段生成或全权覆盖，且必须是当时 `SKILL.md` 任务路由与正向纪律的投影；禁止人手抄写。
7. `README.md` 必须带「无脚本时至少人工核这几条」节；漏了这节，资产搬到未装本 skill 的仓库后硬门凭空消失。
8. 显示 `coverage.status` 的地方必须同时显示 `pages.length` 与限定语，不得让消费方只看到 `full`。
9. `README.md` 之后必须追加一条 `run-meta.json` 台账（`node scripts/lib/run-meta.mjs --asset-dir <dir>`）。该文件类别是 `log`、**append-only**：只许新增 `runs[]` 末元素，既有元素不改不删，重算时不得当 derived 删掉重建。
10. `run-meta.json` 与 `raw/session.json` 的分界写死：视口 / UA / 门控 / `darkMode` / `loggedIn` / 原始 `failures[]` 留在 `session.json`；`stylesheetSplits[]` 与 `renames[]` 的权威只在 `run-meta.json`，**不得**回写 `session.json`。

## 13. 资产写出规程

字段形状与闭集一律见 `shared-contract.md`，本节不重复定义。

**落盘顺序必须是** `tokens.json` → `patterns/` → `voice.md` → `DESIGN.md` / `README.md`。后写的引用先写的（`rhythm.surface` 指向 semantic 色键、`dontId` 指向 `DESIGN.md` 行 id），反序写会制造对不上的引用。

**每写完一个文件必须跑一次 `node scripts/validate-asset.mjs page-theme/<style-set-id>`，不得攒到最后。** 退出码语义见 `shared-contract.md` §6；退出码 `1` **不得**靠删字段绕过——缺观测走保留字段 + `observed:false` + `confidence`。退出码 `2` 的每条报警必须落进产出物的待办清单，不得静默。

### 13.1 写资产侧的权限尺

| 只能由 agent 写 | 只能由脚本写 | 禁止跨界 |
| --- | --- | --- |
| `taxonomy` / `role` / `variant` / `summary` / `label_zh` | `responsive.*.grid` 的实测几何 | 脚本不得判楼层型别与骨架型 |
| `voice.md` 全文（register / traits / Don't / 禁词 / 口号型） | `raw/` 全部统计 | **脚本不得写 `voice.md`**，不得调 LLM 给 heading 打型 |
| `density` 三档档名 | `densityCandidate`（最高 `medium`） | 候选**不得直填** `density` |
| semantic 角色裁定、component 并列 key | primitive 刻度与 `measured` | LLM 只许在脚本候选里确认 / 合并 / 拒绝，**不许**从已过滤噪声里捞回第三色当 `primary` |

### 13.2 四条不得

1. **不得**把 `observed: false` 的 token 提升到 `medium` 或 `high`。
2. **不得**用供给或第一方声明改 `$value`——命名听设计系统，像素听页面；冲突值落 `suppliedValue` + `conflict: true`。
3. **不得**为凑齐词表而编造条件必产出角色（`focus` / `hover` / 状态色 / `surface.identity`）；无观测一律 omit 并在 `DESIGN.md` 写明。
4. **不得**在资产里出现散文冒充字段值；散文只准进 `DESIGN.md` / `voice.md` / `{id}.notes.md` 的散文节。

### 13.3 缺观测三选一

按序试，不得跳到第四种：

1. 必产出字段 → 保留字段 + `observed: false` + `confidence`（+ 未上屏项加 `dontId`）；
2. 条件必产出 / 选产出 → **omit**，并在 `DESIGN.md` 说明为什么没有；
3. 词表档位不够 → 上取到最近语义并标 `lossy: true` + `observedHex`，差异写 `DESIGN.md` 散文。

### 13.4 跨页合并（第二次调用加页后）

同一篇 pattern 被多页共用是默认行为，合并条件是 `taxonomy` 相同且 `variant` 逐字段全等；几何微差落 `observations`（`selected: true` 至多一条且必须等于该字段现值），**不得**设像素容差、**不得**因几何差异新开文件。加页后必须**全量重算**派生层，不得增量合并。
