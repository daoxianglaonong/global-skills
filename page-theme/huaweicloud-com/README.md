---
schema: page-theme-readme/v1
style_set_id: "huaweicloud-com"
generated_at: "2026-09-03T07:10:28.775Z"
produced_by:
  skill_name: page-theme-extract
  extract_scripts_sha256: "86f2acf86c021b28f3a624444e23ae55cfd1d0e82d8f0e392f9e506ccf0fa7b0"
  extract_scripts_files: 63
---

# huaweicloud.com · 怎么读这份资产

> 本文件是**资产自述**：这里有什么、覆盖到哪、没装采集脚本时人工核哪几条。它不描述采集过程，也不是任何 skill 文档的投影。
> `extract_scripts_sha256` 是产出本目录的那套采集脚本的哈希（清单口径见采集包 `scripts/lib/scripts-hash.mjs`）：与当前脚本不等，说明重采可能改产物。
> derived 类文件会被二次采集整体覆盖；人工批注只能写进 `patterns/{id}.notes.md`，写进本文件或 `DESIGN.md` 都会丢掉。

## 文件地图

- `DESIGN.md` — 人读的风格说明与 Don't 清单
- `tokens.json` — DTCG 主 token 表；按路径取，不整盘读
- `voice.md` — 文案语气与禁词
- `closed-set.json` — token 路径 · CSS 变量名 · 当前值查表；变量名一律查它，不自行派生
- `floor-index.json` — 楼层选型与涂色算法输入查表；大纲阶段只读它，不逐篇打开 patterns/
- `patterns/index.yaml` — 楼层序列、节奏与骨架型库
- `patterns/chrome.yaml` — 页壳（顶栏 / 悬浮件 / 页脚 / 备案条），整站一份
- `site-overrides.yaml` — 站点特例选择器（人拥有最终文本）
- `holdout.yaml` — 留出声明，机器只读
- `screenshots/index.json` — 截图索引；取图必须经它寻址，不得扫目录。取 `thumb`，不取 `path`（后者是采集期内部字段，指向不随资产迁移的 PNG 原图）
- `raw/` — 采集原始数据，按 pageId 分目录；按字段取，不整盘读。不得读 `grid-candidates.{slot}.json`（采集期内部字段，不随资产迁移）
- `run-meta.json` — 运行日志（append-only），只作台账不当风格源

## 取用粒度

按需逐文件打开，整盘不灌。下表是本目录的读法，与调用方是谁无关。

| 文件 | 取什么 | 禁止 |
| --- | --- | --- |
| `closed-set.json` | 按 `path` 取 `cssVar` / `value`；alias 条目写 `aliasVar` 不写 `resolved` | 自行从 token 路径推变量名 |
| `floor-index.json` | 大纲选型的全部字段与涂色输入；`paint` 只是跳过裁定 | 当成「这层应涂什么」；终值须跑 `paint-sequence.mjs` |
| `tokens.json` | 当前用得上的 semantic / component 路径，引用带 `.$root` | 全文进上下文 |
| `patterns/index.yaml` | `rhythm`、目标页的 `sequence`（新页取 `page_skeletons` 选中那一型） | 把整个型库读进来 |
| `patterns/{id}.yaml` | 只读目标 sequence 里出现的那几篇 | 未出现在 sequence 的楼层 |
| `patterns/chrome.yaml` | 整页才读；单个楼层或组件不读 | 一页混用多个 variant 的条目 |
| `voice.md` | 本页有文案槽才读 | 把 §V5 金句当语料库 |
| `DESIGN.md` | §1 概览与 §8 Don't | 当可编辑真相源改它 |
| `screenshots/` | 经 `index.json` 寻址后逐张取 `thumb` | 无索引扫目录；取 `path`（采集期内部字段，指向不随资产迁移的 PNG 原图） |
| `raw/` | 采集中间物，采集侧自用 | 当生成或对账的输入；取 `grid-candidates.*`（采集期内部字段，不随资产迁移） |
| `run-meta.json` | 台账，append-only | 当风格源 |
| `holdout.yaml` | 留出声明，机器只读 | 拿留出页当临摹稿 |

## 覆盖度

`status` 只描述本次 style-set 内已采 URL 的采集完整度，不代表该站或该品牌的设计语言已被穷尽。读 `status` 必须同时读 `pages` 长度与 `blockers`。

```yaml
coverage:
  status: full
  holdoutDeclared: true
  pages:
    - pageId: home
      sourceId: source-01
      url: "https://www.huaweicloud.com/"
      finalUrl: "https://www.huaweicloud.com/"
      extractedAt: "2026-09-03T06:54:53.179Z"
      variant: ""
    - pageId: product-agentarts.html
      sourceId: source-02
      url: "https://www.huaweicloud.com/product/agentarts.html"
      finalUrl: "https://www.huaweicloud.com/product/agentarts.html"
      extractedAt: "2026-09-03T06:55:55.422Z"
      variant: ""
    - pageId: product-modelarts.html
      sourceId: source-03
      url: "https://www.huaweicloud.com/product/modelarts.html"
      finalUrl: "https://www.huaweicloud.com/product/modelarts.html"
      extractedAt: "2026-09-03T06:56:49.615Z"
      variant: ""
    - pageId: agentorchard--home
      sourceId: source-04
      url: "https://agentorchard.huaweicloud.com/"
      finalUrl: "https://agentorchard.huaweicloud.com/"
      extractedAt: "2026-09-03T06:57:09.960Z"
      variant: agentorchard
    - pageId: ai
      sourceId: source-05
      url: "https://www.huaweicloud.com/ai/"
      finalUrl: "https://www.huaweicloud.com/ai/"
      extractedAt: "2026-09-03T06:58:04.281Z"
      variant: ""
    - pageId: product-ecs.html
      sourceId: source-06
      url: "https://www.huaweicloud.com/product/ecs.html"
      finalUrl: "https://www.huaweicloud.com/product/ecs.html"
      extractedAt: "2026-09-03T06:59:01.234Z"
      variant: ""
    - pageId: service-contact.html
      sourceId: source-07
      url: "https://www.huaweicloud.com/service/contact.html"
      finalUrl: "https://www.huaweicloud.com/service/contact.html"
      extractedAt: "2026-09-03T06:59:18.944Z"
      variant: ""
    - pageId: about-index.html
      sourceId: source-08
      url: "https://www.huaweicloud.com/about/index.html"
      finalUrl: "https://www.huaweicloud.com/about/index.html"
      extractedAt: "2026-09-03T06:59:47.304Z"
      variant: ""
    - pageId: news.html
      sourceId: source-09
      url: "https://www.huaweicloud.com/news.html"
      finalUrl: "https://www.huaweicloud.com/news.html"
      extractedAt: "2026-09-03T07:00:04.762Z"
      variant: ""
    - pageId: securecenter-compliance-compliance-center.html
      sourceId: source-10
      url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center.html"
      finalUrl: "https://www.huaweicloud.com/securecenter/compliance/compliance-center.html"
      extractedAt: "2026-09-03T07:00:21.262Z"
      variant: ""
  cohesion:
    verdict: mixed-suspected
    divergences:
      - axis: color.primary
        match: different
        sourceIds:
          - source-01
          - source-02
          - source-03
          - source-04
          - source-05
          - source-06
          - source-07
          - source-08
          - source-09
          - source-10
        groups:
          - value: "#191919ff"
            sourceIds:
              - source-01
              - source-02
              - source-03
              - source-04
              - source-05
              - source-06
              - source-07
          - value: "#ffffffff"
            sourceIds:
              - source-08
              - source-09
              - source-10
    suggestedSplit:
      - "source-08,source-09,source-10"
      - "source-01,source-02,source-03,source-04,source-05,source-06,source-07"
    pending:
      - axis: color.identity
        sourceIds:
          - source-01
          - source-02
          - source-03
          - source-04
          - source-05
          - source-06
          - source-07
          - source-08
          - source-09
          - source-10
        groups:
          - value: "#e50213ff"
            sourceIds:
              - source-01
              - source-03
              - source-04
              - source-05
              - source-06
              - source-07
              - source-09
          - value: "#e40213ff"
            sourceIds:
              - source-02
          - value: "#e40214ff"
            sourceIds:
              - source-08
              - source-10
        reason: all-observations-low-confidence
      - axis: typography.fontFamily
        sourceIds:
          - source-01
          - source-02
          - source-03
          - source-04
          - source-05
          - source-06
          - source-07
          - source-08
          - source-09
          - source-10
        groups:
          - value: "-apple-system, HuaweiSans, \"Helvetica Neue\", Helvetica, Arial, \"PingFang SC\", \"Hiragino Sans GB\", STHeiti, \"Microsoft YaHei\", \"Microsoft JhengHei\", SimSun, sans-serif"
            sourceIds:
              - source-01
              - source-03
              - source-04
              - source-05
              - source-06
              - source-07
              - source-08
              - source-09
              - source-10
          - value: "Helvetica, Arial, \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", 微软雅黑, \"Microsoft JhengHei\""
            sourceIds:
              - source-02
        reason: system-fallback-only
  blockers: []
  candidates:
    - url: "https://www.huaweicloud.com/service/protection.html#section-0"
      source: nav
    - url: "https://www.huaweicloud.com/service/protection.html#section-2"
      source: nav
    - url: "https://bbs.huaweicloud.com/suggestion"
      source: nav
    - url: "https://www.huaweicloud.com/service/contact.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/mysql.html"
      source: nav
    - url: "https://beian.miit.gov.cn/"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/soc.html"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/csa-star.html"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/mlps.html"
      source: nav
    - url: "https://cloudpartner.shixizhi.huawei.com/"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/iso-22301.html"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/iso-27001.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/agentarts/officeace.html"
      source: nav
    - url: "https://activity.huaweicloud.com/828_promotion/index.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/agentarts.html"
      source: nav
    - url: "https://codearts.huaweicloud.com/"
      source: nav
    - url: "https://www.huaweicloud.com/ai/"
      source: nav
    - url: "https://www.huaweicloud.com/product/modelarts/studio.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/modelarts.html"
      source: nav
    - url: "https://www.huaweicloud.com/consultation/index.html"
      source: nav
    - url: "https://edu.huaweicloud.com/"
      source: nav
    - url: "https://www.huaweicloud.com/service/professionalservices.html"
      source: nav
    - url: "https://status.service.huaweicloud.com/#/home"
      source: nav
    - url: "https://consumer.huawei.com/cn/?utm_source=huaweicloud&utm_medium=footer"
      source: nav
    - url: "https://developer.huawei.com/consumer/cn/"
      source: nav
    - url: "https://e.huawei.com/cn/"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center/pci-dss.html"
      source: nav
    - url: "https://console.huaweicloud.com/ticket/?locale=zh-cn#/ticketindex/createIndex"
      source: nav
    - url: "https://res-static.hc-cdn.cn/cloudbu-site/china/zh-cn/wangxue/header/yingyezhizhao02.jpg"
      source: nav
    - url: "https://www.huaweicloud.com/about/index.html"
      source: nav
    - url: "https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=52990002000093"
      source: nav
    - url: "https://reg.huaweicloud.com/registerui/public/custom/register.html?locale=zh-cn&service=https%3A%2F%2Fwww.huaweicloud.com%2F&channelFrom=&hwid=portal"
      source: nav
    - url: "https://www.huaweicloud.com/mobile_app/hwapp.html?channel=navigation_right"
      source: nav
    - url: "https://www.huaweicloud.com/cases.html"
      source: nav
    - url: "https://www.huaweicloud.com/securecenter/overallsafety.html"
      source: nav
    - url: "https://www.huaweicloud.com/news.html"
      source: nav
    - url: "https://www.huaweicloud.com/about/live.html"
      source: nav
    - url: "https://support.huaweicloud.com/help-tools.html"
      source: nav
    - url: "https://www.huaweicloud.com/notice.html"
      source: nav
    - url: "https://www.huaweicloud.com/service/supportplans.html"
      source: nav
    - url: "https://www.huaweicloud.com/service/protection.html#section-0"
      source: nav
    - url: "https://www.huaweicloud.com/service/professionalservices.html"
      source: nav
    - url: "https://www.huaweicloud.com/service/protection.html#section-2"
      source: nav
    - url: "https://bbs.huaweicloud.com/suggestion"
      source: nav
    - url: "https://www.huaweicloud.com/service/contact.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/modelarts.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/mysql.html"
      source: nav
    - url: "https://codearts.huaweicloud.com/"
      source: nav
    - url: "https://beian.miit.gov.cn/"
      source: nav
    - url: "https://account.huaweicloud.com/usercenter/#/betaManagement?serviceCode=beta_agentarts"
      source: nav
    - url: "https://console.huaweicloud.com/agentarts/?region=cn-southwest-2#/home/overview"
      source: nav
    - url: "https://www.huaweicloud.com/product/ecs.html"
      source: nav
    - url: "https://cloudpartner.shixizhi.huawei.com/"
      source: nav
    - url: "https://www.huaweicloud.com/product/modelarts/studio.html"
      source: nav
    - url: "https://status.service.huaweicloud.com/#/home"
      source: nav
    - url: "https://consumer.huawei.com/cn/?utm_source=huaweicloud&utm_medium=footer"
      source: nav
    - url: "https://developer.huawei.com/consumer/cn/"
      source: nav
    - url: "https://support.huaweicloud.com/productdesc-agentarts/agentarts_03_0002.html"
      source: nav
    - url: "https://www.huaweicloud.com/product/agentarts/officeace.html"
      source: nav
    - url: "https://e.huawei.com/cn/"
      source: nav
```

## 取用纪律

1. 颜色与字体族只走本资产的 semantic / component 路径。
2. 本资产未给出的值必须 omit，或用已有的最近语义拼并并按资产字段标 `lossy`；不得编造。

## 无脚本时至少人工核这些硬门

```text
未安装 page-theme 系列脚本时，用本资产产出页面后至少人工核：
1. 颜色：产出页不得出现本资产 tokens.json 合法色值全集以外的色；豁免仅 inherit / unset / initial / currentColor / transparent / none / 0 与第三方 widget。
2. 字体族：产出页不得出现本资产已声明字体栈以外的族名；豁免仅 inherit / unset / initial 与第三方 widget。
3. DESIGN.md Don't：tokens.json 里每个带 dontId 的未上屏项，都必须在 DESIGN.md §8 找到同 id 的条目，一条都不能缺。
4. 未上屏值：不得把 paintedRatio=0 且 confidence≥medium 的 token 当已上屏值使用。
5. 颜色越层：颜色 / 阴影色 / 边框色不得跳过 semantic 直引 primitive。
尺寸 / 圆角 / 阴影 / 过渡只记录，不设红线。自证只认对照结果，不认「我读了 Don't」。
```

## 缺口与分轴

- 值缺口不得编造：本资产没给出的值必须 omit，或用已有的最近语义拼并并标 `lossy`。
- 凡本资产有规定的（色、字、间距、楼层、语气）一律以本资产为准，原创性让位；只有原站不存在的板块类型才允许发挥，且只能用本资产已有的 token 与节奏。
