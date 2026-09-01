---
schema: page-theme-readme/v1
style_set_id: "{{style_set_id}}"
generated_at: "{{generated_at}}"
projected_from:
  skill_name: page-theme
  skill_sha256: "{{skill_sha256}}"
  routes_sha256: "{{routes_sha256}}"
---

# {{site_short_name}} · 怎么读这份资产

> 本文件是 page-theme skill 任务路由与正向纪律的投影。下游仓库未安装该 skill 时，只读本文件即可开始取用本目录。
> derived 类文件会被二次调用整体覆盖；人工批注只能写进 patterns/{id}.notes.md，写进本文件或 DESIGN.md 都会丢掉。

## 任务路由

按任务读，整盘不灌。每次只打开本任务本页用得上的文件与路径。

```yaml
task_routes:
  - id: analyze
    何时: 用户要求分析 / 提取 / 更新某站主题资产
    必读: [references/extract.md（装了本 skill 才有）, 脚本落盘后的 raw（按短摘要列出的文件 · 按字段取）, screenshots/index.json, 当前要核的截图（按 index 逐张取）]
    按需: [references/shared-contract.md（装了才有）, site-overrides.yaml, input/design-system/（存在才读）, holdout.yaml（存在则必须尊重 · 不得采其中页）]
    禁止整盘: [tokens.json 全文, "全部 patterns/{id}.yaml", 上一版 DESIGN.md（增量重算除外）, raw/ 大表当 tool 返回值]
  - id: generate
    何时: 用户要求按某站风格生成原站没有的新页面
    必读: [README.md（先读索引）, DESIGN.md §1 Overview 与 §8 Don't, patterns/index.yaml 的 rhythm（已采页取其 sequence · 新页取 page_skeletons 选中的那一型）, sequence 内出现的内容楼层 yaml（只这些）, tokens.json 本页将用到的 semantic / component 路径（引用带 .$root）, patterns/chrome.yaml（仅生成整页 · 生成单个楼层或组件不读）]
    按需: [voice.md（本页有文案槽才读）, tokens.dark.json 与 resolver.json（有暗色且本页需要）, "patterns/{id}.notes.md（存在才读）", screenshots/index.json 与需核的图（confidence 非 high 时必须）, references/generate.md（装了才有）, references/shared-contract.md（装了才有）]
    禁止整盘: [tokens.json 全文, raw/, 未出现在目标 sequence 的楼层 yaml, run-meta.json, input/design-system/ 原文, holdout.yaml（不得拿留出页当临摹稿）]
  - id: accept
    何时: 用户要求验收 / 体检 / 500ms 归属测试
    必读: [holdout.yaml, README.md, DESIGN.md §8 Don't, tokens.json 的合法色值全集与字体栈（供门对照 · 不当阅读材料整盘灌）, 生成或重建产物（页 + 其 CSS / DOM）, 本次工作区的 generate-trace*.json 与 rebuild-trace.json（落验收工作区 · 不进本目录）, screenshots/index.json 与对照所需的图, 本文件「覆盖度」节的 coverage 对象（含 holdoutDeclared）]
    按需: [patterns/chrome.yaml（页壳轨触发时）, patterns/index.yaml 与被测页 sequence, voice.md（文案轨）, run-meta.json 的 startedAt（只核 holdout 时效 · 不当风格源）, "raw/supply-match.json（有供给时）"]
    禁止整盘: [tokens.json 全文当散文, raw/ 除本次对照所需, 全部楼层 yaml, input/design-system/ 原文]
```

`tokens.json` 只取当前用得上的 semantic / component 路径，整盘不得进上下文。上表任何读取序只在本路由内有效，不得提升为跨任务强制序。未装 page-theme skill 时，`references/*` 三条跳过，只靠本目录读。

## 文件地图

{{file_map}}

## 覆盖度

status 只描述本次 style-set 内已采 URL 的采集完整度，不代表该站或该品牌的设计语言已被穷尽。

```yaml
{{coverage_yaml}}
```

## 正向纪律

1. 颜色与字体族只走资产里的 semantic / component 路径。
2. 资产未给出的值必须 omit，或用资产已有的最近语义拼并并按资产字段标 `lossy`；不得编造。
3. 不受理的供给格式必须显式回话，然后继续跑。

## 无脚本时至少人工核这些硬门

```text
未安装 page-theme 脚本时，生成后至少人工核：
1. 颜色：生成页不得出现资产 tokens.json 合法色值全集以外的色；豁免仅 inherit / unset / initial / currentColor / transparent / none / 0 与第三方 widget。
2. 字体族：生成页不得出现资产已声明字体栈以外的族名；豁免仅 inherit / unset / initial 与第三方 widget。
3. DESIGN.md Don't：tokens.json 里每个带 dontId 的未上屏项，都必须在 DESIGN.md §8 找到同 id 的条目，一条都不能缺。
4. 供给硬门：不得把 paintedRatio=0 且 confidence≥medium 的 token 当作已上屏值使用。
5. 颜色 primitiveLeak：颜色 / 阴影色 / 边框色不得跳过 semantic 直引 primitive。
尺寸 / 圆角 / 阴影 / 过渡只记录，不设红线。自证只认对照结果，不认「我读了 Don't」。
```

## 缺口与分轴

- 值缺口不得编造：本资产没给出的值必须 omit，或用已有的最近语义拼并并标 `lossy`。
- 凡本资产有规定的（色、字、间距、楼层、语气）一律以本资产为准，原创性让位；只有原站不存在的板块类型才允许发挥，且只能用本资产已有的 token 与节奏。
