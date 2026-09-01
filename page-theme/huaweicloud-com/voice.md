---
schema: page-theme-voice/v1
locale: zh-CN
register: semi-formal
tone_axes:
  humor: serious
  respect: respectful
  enthusiasm: moderate
brand_self: 华为云
reader: 您
audience_noun: [开发者, 客户, 企业]
primary_cta: [申请公测, 立即使用, 购买]
secondary_cta: [了解详情, 免费试用]
# consult_cta 是本图自定意图槽，不是业界视觉层级（primary / secondary / ghost）
consult_cta: [立即咨询]
headline_structures:
  - id: S_custom_short_slogan
    evidence:
      - { text: "技术即引擎，让创新触手可及", url: "https://www.huaweicloud.com/", pageId: home }
      - { text: "成熟行业实践，释放云上数字生产力", url: "https://www.huaweicloud.com/", pageId: home }
      - { text: "智果园，为 Agent 而生", url: "https://agentorchard.huaweicloud.com/", pageId: agentorchard--home }
      - { text: "企业AI创新，选择华为云", url: "https://www.huaweicloud.com/about/index.html", pageId: about-index.html }
      - { text: "全球布局 安全稳定的云", url: "https://www.huaweicloud.com/about/index.html", pageId: about-index.html }
      - { text: "合规中心", url: "https://www.huaweicloud.com/securecenter/compliance/compliance-center.html", pageId: securecenter-compliance-compliance-center.html }
  - id: S_custom_let_enable
    evidence:
      - { text: "让企业智能体触手可及", url: "https://agentorchard.huaweicloud.com/", pageId: agentorchard--home }
      - { text: "使能客户持续创新", url: "https://www.huaweicloud.com/product/agentarts.html", pageId: product-agentarts.html }
      - { text: "多应用场景全覆盖，助力业务成功", url: "https://www.huaweicloud.com/product/modelarts.html", pageId: product-modelarts.html }
  - id: S_custom_everyone_can
    evidence:
      - { text: "人人都能构建自己的企业级智能体", url: "https://www.huaweicloud.com/product/agentarts.html", pageId: product-agentarts.html }
      - { text: "丰富的应用模版，一键开启体验", url: "https://www.huaweicloud.com/product/agentarts.html", pageId: product-agentarts.html }
      - { text: "百模千态，主流大模型一键调用", url: "https://agentorchard.huaweicloud.com/", pageId: agentorchard--home }
  - id: S_custom_onestop
    evidence:
      - { text: "全栈式开发工具，随取随用", url: "https://www.huaweicloud.com/product/modelarts.html", pageId: product-modelarts.html }
      - { text: "数据准备提供一站式、全流程的数据处理和管理服务", url: "https://www.huaweicloud.com/product/modelarts.html", pageId: product-modelarts.html }
      - { text: "融合算力与框架级性能调优，为开发者提供高效训练、灵活部署的一站式AI开发平台", url: "https://www.huaweicloud.com/product/modelarts.html", pageId: product-modelarts.html }
  - id: S_custom_name_plus_category
    evidence:
      - { text: "智果（AgentArts）智能体平台", url: "https://www.huaweicloud.com/product/agentarts.html", pageId: product-agentarts.html }
      - { text: "魔坊（ModelArts）模型训推平台", url: "https://www.huaweicloud.com/product/modelarts.html", pageId: product-modelarts.html }
      - { text: "果办 OfficeAce 办公智能体", url: "https://agentorchard.huaweicloud.com/", pageId: agentorchard--home }
      - { text: "弹性云服务器 ECS", url: "https://www.huaweicloud.com/product/ecs.html", pageId: product-ecs.html }
  - id: S_custom_parallel_caps
    evidence:
      - { text: "面向智能体 | 百模千态 | 按需 Token", url: "https://agentorchard.huaweicloud.com/", pageId: agentorchard--home }
      - { text: "一站式具身智能数据合成、模型开发、仿真验证平台，助力具身智能应用开发", url: "https://www.huaweicloud.com/", pageId: home }
slot_caps:
  heading: { min: 4, typical: 16, max: 48, observed: true, confidence: high }
  subcopy: { min: 12, typical: 23, max: 66, observed: true, confidence: high }
  body: { min: 2, typical: 5, max: 20, observed: true, confidence: medium }
  primary_cta: { min: 2, typical: 4, max: 8, observed: true, confidence: medium }
  secondary_cta: { min: 2, typical: 4, max: 8, observed: true, confidence: medium }
  eyebrow: { min: 8, typical: 16, max: 28, observed: false, confidence: low }
  stat_value: { min: 2, typical: 4, max: 8, observed: false, confidence: low }
  certificate: { min: 6, typical: 13, max: 52, observed: true, confidence: medium }
locale_pack: zh-CN
few_shot_count: 7
chrome_upgrades: []
---

# 华为云中国站 · 语气与文案规范

十页未登录语料（原九页 + 合规中心），`loggedIn: false`，`copyTruncated: false`。统计取各页 `raw/{pageId}/copy-stats.json`；原句只抽样带 URL 的实测条目，不贴 corpus 全文〔V-06 V-73〕。数字与比例为候选 / 非权威，do not infer。

## §V0 一句话本质

以半正式使能腔讲清能力与客户结果，口号短、能力并列长。

## §V1 气质对

| is | not | 证据页 |
| --- | --- | --- |
| 使能与结果导向（让 / 使能 / 助力 + 结果） | 第一人称抒情（「我们热爱云」） | agentorchard--home / product-agentarts.html |
| 短口号切开主张 | 故事型长叙事标题当楼层主标题 | home |
| 人人可及 / 一键开箱 | 专家门槛腔（「仅限资深架构师」） | product-agentarts.html |
| 中文名（En）+ 品类 | 只抛英文商标不写品类 | product-agentarts.html / product-modelarts.html |
| 顿号并列能力，最后落平台 | 形容词堆砌无品类 | product-modelarts.html / home |

正例见 §V5。反例未在本 run 营销楼层出现，属生成禁区而非实测句。

## §V2 槽位句式

`copy-stats.bySlot` 有样本的营销槽照常写。`nav_item` 本 run `n=0`，不进本节、不进营销分母〔V-15 V-81〕。`eyebrow` / `stat_value` 脚本槽 n=0，slot_caps 标 observed:false + confidence。`certificate` 已在合规中心资质墙读图成立（35 张短标题），slot_caps 改为 observed:true。

### heading

- structure: S_custom_short_slogan（产品页可叠 S_custom_name_plus_category 或 S_custom_let_enable，主型只标一个〔V-46〕）
- length: 见 `slot_caps.heading`（五页 n=76；加权 p50≈10，页级 p90 最高 25；raw 最短 2 字是「人设 / 政府」类卡片名，不当口号下限）
- example: 技术即引擎，让创新触手可及
- rewrite_hint: 先写主张或结果，不用句号；不要写成「欢迎来到…」。证据：`home` / https://www.huaweicloud.com/ 「技术即引擎，让创新触手可及」

### subcopy

- structure: S_custom_onestop 或 S_custom_everyone_can 或 S_custom_parallel_caps
- length: 见 `slot_caps.subcopy`（五页 n=94；加权 p50≈23，页级 p90 最高 66）
- example: 人人都能构建自己的企业级智能体
- rewrite_hint: 顿号并列 2–4 个能力，最后落「平台 / 服务」；不要单独堆形容词。证据：`product-agentarts.html` / https://www.huaweicloud.com/product/agentarts.html 「人人都能构建自己的企业级智能体」

### body

- structure: prose
- length: 见 `slot_caps.body`（五页 n=378；p50=4–6，p90=11–20；本档 typical 取 5。首屏产品名有时被脚本标进 body，生成页标题仍走 heading）
- example: 智果园，为 Agent 而生
- rewrite_hint: 短标签或一句结果，不写备案 / 热线。证据：`agentorchard--home` / https://agentorchard.huaweicloud.com/ 「智果园，为 Agent 而生」

### primary_cta

- structure: prose
- length: 见 `slot_caps.primary_cta`
- example: 申请公测
- rewrite_hint: 只用 YAML `primary_cta` 列表中的词，禁止自造「马上开始」「Get started」「立即 Get」。全站最高频 CTA「了解详情」不得写入本槽〔V-23〕。证据：`product-agentarts.html` 首屏实心按钮 / https://www.huaweicloud.com/product/agentarts.html 「申请公测」；`product-modelarts.html` 首屏实心按钮 / https://www.huaweicloud.com/product/modelarts.html 「立即使用」；`product-ecs.html` 首屏实心按钮 / https://www.huaweicloud.com/product/ecs.html 「购买」

### secondary_cta

- structure: prose
- length: 见 `slot_caps.secondary_cta`
- example: 了解详情
- rewrite_hint: 只用 YAML `secondary_cta` 列表中的词。线框 / 次按钮走本槽；排除「注册」「提交」。证据：`home` 首屏线框按钮 / https://www.huaweicloud.com/ 「了解详情」；`product-agentarts.html` 首屏线框 / https://www.huaweicloud.com/product/agentarts.html 「免费试用」；`product-ecs.html` 首屏线框 / https://www.huaweicloud.com/product/ecs.html 「控制台 / 文档」属 nav_utility，不进本表

### eyebrow

- structure: 发布由头 + 产品名 + 短结果（可带「>」）
- length: 见 `slot_caps.eyebrow`（copy-stats 槽 n=0，observed:false；读图两例，不当统计 typical）
- example: 最新发布 OfficeAce 让办公触手可及
- rewrite_hint: 先写「最新发布 / 重磅发布」，再落产品名，不要写成导航项。证据：`product-agentarts.html` / https://www.huaweicloud.com/product/agentarts.html 「最新发布 OfficeAce 让办公触手可及 >」；`product-modelarts.html` / https://www.huaweicloud.com/product/modelarts.html 「重磅发布 DeepSeek-V4-Flash 模型 >」

### stat_value

- structure: 整数或「整数+」或「整数+个」
- length: 见 `slot_caps.stat_value`（copy-stats 槽 n=0，observed:false；读图见全球基础设施四格）
- example: 170+
- rewrite_hint: 只写数字与可选「+ / 个」，单位放 `stat_label`。证据：`home` / https://www.huaweicloud.com/ 「170+ / 34个 / 2800+ / 103个」

### certificate

- structure: 标准号或报告名，可带年份
- length: 见 `slot_caps.certificate`（合规中心 35 张短标题：p50≈13，最长 52；home 嵌套证标仍可作辅证）
- example: 【国际】ISO 27001
- rewrite_hint: 用【地域】+ 标准简称，不要写成营销口号。证据：`securecenter-compliance-compliance-center.html` / https://www.huaweicloud.com/securecenter/compliance/compliance-center.html 「【国际】ISO 27001」「【中国】网络安全等级保护」；`home` 嵌套标「ISO 27001:2022」

## §V3 词汇

```yaml
prefer:
  - { term: 使能, in: heading|subcopy }
  - { term: 一站式, in: heading|subcopy }
  - { term: 触手可及, in: heading|subcopy }
  - { term: 重塑, in: heading|subcopy }
avoid:
  - { term: 点击这里, replace: 了解详情 }
  - { term: lorem, replace: null }
  - { term: 赋能未来, replace: 加速落地 }
  - { term: 立即 Get, replace: 申请公测 }
forbidden_topics:
  - { topic: 竞品点名贬低, severity: avoid }
```

prefer 证据（各一条，非全文）：

- 使能：`product-agentarts.html` / https://www.huaweicloud.com/product/agentarts.html 「使能客户持续创新」
- 一站式：`product-modelarts.html` / https://www.huaweicloud.com/product/modelarts.html 「融合算力与框架级性能调优，为开发者提供高效训练、灵活部署的一站式AI开发平台」
- 触手可及：`agentorchard--home` / https://agentorchard.huaweicloud.com/ 「让企业智能体触手可及」
- 重塑：`home` / https://www.huaweicloud.com/ 「重塑医疗AI创新范式，让AI普惠每一家医院、每一位医生、每一名患者」

`avoid` / `forbidden_topics` 为 AI slop 与品牌禁区，本 run 营销楼层未出现「点击这里 / lorem / 赋能未来 / 立即 Get / 竞品点名」，属有则记录、禁止生成，不是实测高频。

## §V4 Don't

```yaml
- id: voice-dont-01
  check: copy
  text: 禁止 lorem ipsum、重复「标题」「正文」「按钮」占位、拉丁盲文、Acme Corp、敬请期待空壳
- id: voice-dont-02
  check: copy
  text: 禁止把备案号、热线 950808、公众号/二维码引流写进内容楼层（页脚与 FAQ 咨询区除外，且不要模仿进营销楼层）
- id: voice-dont-03
  check: copy
  text: 主 CTA 不得使用三表外动词（马上开始 / Get started / 立即 Get）；登录、注册、控制台、文档是 nav_utility，不进三表
- id: voice-dont-04
  check: copy
  text: 产品首次出场须能落到 S_custom_name_plus_category（中文名（En）+ 品类或「中文名 + 空格 + En + 品类」）；禁止只写 AgentArts / ModelArts 不写中文名与品类
- id: voice-dont-05
  check: copy
  text: 禁止把「了解详情」写成主 CTA；它是全站最高频次按钮，但是次操作〔V-23〕
- id: voice-dont-06
  check: copy
  text: 默认读者称「您」；禁止用第一人称「我们」讲品牌故事（华为云第三人称出场）。「联系我们」只作联系页页头或页脚入口，不进产品首屏口号
```

voice-dont-02 证据：`product-agentarts.html` FAQ 出现「售前热线：950808 转1」（https://www.huaweicloud.com/product/agentarts.html），属咨询区，不得复制到 hero / feature。voice-dont-05 证据：digest CTA「了解详情」×21，读图为线框。不得写「不要用公告条」〔V-56〕。

## §V5 金句

> 技术即引擎，让创新触手可及
> — heading / home / https://www.huaweicloud.com/

> 人人都能构建自己的企业级智能体
> — subcopy / product-agentarts.html / https://www.huaweicloud.com/product/agentarts.html

> 智果（AgentArts）智能体平台
> — body / product-agentarts.html / https://www.huaweicloud.com/product/agentarts.html

> 融合算力与框架级性能调优，为开发者提供高效训练、灵活部署的一站式AI开发平台
> — subcopy / product-modelarts.html / https://www.huaweicloud.com/product/modelarts.html

> 申请公测
> — primary_cta / product-agentarts.html / https://www.huaweicloud.com/product/agentarts.html

> 让企业智能体触手可及
> — heading / agentorchard--home / https://agentorchard.huaweicloud.com/

> 华为云天筹AI求解器斩获2026 IEEE WCCI竞赛冠军
> — heading / news.html / https://www.huaweicloud.com/news.html

金句均为 `inCorpus: true` 且 `fromChrome` 空、`ephemeral: false`。未升格公告条，无 chrome 句进本节〔V-55〕。产品名「智果（AgentArts）智能体平台」脚本标 `body`（读图为首屏标题），按实测槽位标注。

## §V6 情境变调

| 情境 | 相对默认的偏移 | 仍须遵守 |
| --- | --- | --- |
| 产品首屏（AgentArts / ModelArts / ECS） | 实心主按钮用 `primary_cta`（申请公测 / 立即使用 / 购买）；线框走 `secondary_cta`。AgentArts 另见线框「免费试用」，ECS / ModelArts 线框「控制台 / 文档」属 nav_utility，不进三表〔V-28〕 | register、reader=您、CTA 三表 |
| 联系页 | 页头实心「立即咨询」走 `consult_cta`；「填写表单」是线框次操作，不进主表。热线与工时只在 contact 楼层 | 不把注册/提交当线框次钮 |
| 关于页 | 视频底白描边「播放视频」不是行动色，不进 `primary_cta`。口号走 S_custom_short_slogan | 不把白钮写成第三行动色 |
| 门户首页 hero | 活动向实心「立即下载」+ 线框「了解详情」。立即下载是本屏活动按钮，**未**写入 `primary_cta`（主表只收产品首屏实心〔V-23〕） | 同上；次按钮可用「了解详情」 |
| 智果园 / 行业 AI 梦工厂首屏 | 读图无内容区实心主 CTA；口号走 S_custom_short_slogan / S_custom_let_enable。顶栏红「注册」是 chrome | 不把注册写进三表 |
| 楼层内「立即体验 / 在线体验」 | 出现在 AgentArts 能力层、智果园底栏、AI 场景卡（cta[] 合计「立即体验」×11、「在线体验」×5），**不是**产品首屏实心，未入三表（候选，非权威） | 不得因此改 `primary_cta` |
| 案例 / 咨询条 | 案例可用 `consult_cta`「立即咨询」（`home` sec-05、`ai` 未分槽条）。FAQ「预约咨询」是区标题不是按钮，未入表 | chrome 咨询腔（热线、1v1、工作时间）不要模仿进内容楼层〔V-19〕 |
| 新闻 / 博客标题 | 可偏长、可含会议名与年份。列表页走 `S_custom_news_event`（「华为云天筹AI求解器斩获2026 IEEE WCCI竞赛冠军」「先进公共云产业峰会2026」`news.html`；「INSPIRE 2026 华为云创想者大会」`ai` 仍可用主型+辅型）。页头「新闻中心」走短名 | 金句不得改写 |
| 合规中心 | 页头「合规中心」走短名（`S_custom_short_slogan` 辅证）。证卡标题走 `certificate`（【地域】+ 标准名），不是营销口号 | 不把备案号写进资质墙 |

浮层：五页 `ctaUnmapped[]` 皆空，右侧客服球无文案入表，按 chrome 丢〔V-59〕。

## §V7 中文专章 locale_pack.zh-CN

### punctuation

做：楼层标题用逗号 / 顿号切开，不用句号。能力列举用顿号「、」。产品名英文用全角括号「（）」或空格分隔（见 cjk_latin）。智果园首屏副文可用竖线「|」并列。

不做：heading 末尾感叹号 / 省略号作默认。感叹号只在咨询区出现，不进营销楼层默认。

证据：`home` / https://www.huaweicloud.com/ 「技术即引擎，让创新触手可及」；`home` / 同上 「一站式具身智能数据合成、模型开发、仿真验证平台，助力具身智能应用开发」；`agentorchard--home` / https://agentorchard.huaweicloud.com/ 「面向智能体 | 百模千态 | 按需 Token」。咨询区感叹（不要模仿）：`product-agentarts.html` 「为您提供售前1v1服务， 助您上云无忧！」

### numbers

本站混用，生成跟该槽众数，不跟外来处方〔V-29〕。

- 百分号：半角 `%`（`home` subcopy「90%」；「AI助手9.9元起，赠千万Tokens」）。未见全角 ％。
- 金额：整数或一位小数 +「元」，数字与「元」无空格（「9.9元」）。
- 量级：`170+` / `2800+` 紧贴加号（`home` body numberSamples）。
- 个数：汉字量词紧贴（「4个智能体」，`product-agentarts.html` subcopy）。
- 热线与工时：`950808`、`7` `24` 出现在咨询 / 页脚，不进营销楼层。

### cjk_latin

分槽源码 U+0020 比例（五页 `withSpace / (withSpace+withoutSpace)`，无邻接样本的槽不立规则）：

| 槽 | 站级 ratioWithSpace | 规则 |
| --- | ---: | --- |
| heading | 26/50 = 0.52 | mixed（原站混用，同一页内自洽） |
| subcopy | 34/93 ≈ 0.37 | mixed（原站混用，同一页内自洽） |
| body | 21/94 ≈ 0.22 | mixed（原站混用，同一页内自洽） |
| primary_cta / secondary_cta | 邻接样本 0 | 本槽几乎全是四字中文按钮，不立空格硬规则 |

≥0.9 / ≤0.1 才立硬规则（**本项目自定**〔V-65〕）。本站三槽都落在中间，禁止为「更正确」插入 U+0020，禁止先跑 pangu〔V-62 V-71〕。

`text-autospace`：五页 `computed: no-autospace`，`autospaceActive: false`，`source: ua-initial`。源码比例可以当视觉空格习惯；不要另开 `text-autospace: normal`〔V-68 V-70〕。

产品名模板（D07，本站混用、同一页自洽）：

- 产品页众数：`中文名（EnglishName）` + 品类。证据：`product-agentarts.html` 「智果（AgentArts）智能体平台」；`product-modelarts.html` 「魔坊（ModelArts）模型训推平台」。
- 主题首页常见：`中文名 + U+0020 + EnglishName` + 品类。证据：`agentorchard--home` 「果办 OfficeAce 办公智能体」「智果 AgentArts 智能体平台」。

生成页同一屏内只挑一种，不要一句括号、一句空格。

### address

- 读者：营销楼层 `您` 12 次 vs `你` 5 次（copy-stats.person 五页合计），主导 `您`〔V-27〕。`你` 出现在产品线口号（`home` 「开启你的编码自动驾驶模式」；`agentorchard--home` 「华为云 AI Shell，懂你所说，执你所想」），是偏移不是默认。
- 品牌自称：`华为云` 第三人称出场（`ai` 「华为云2026生态政策正式发布」；`agentorchard--home` 「华为云新一代企业级 AI 助手 OfficeAce 正式公测」）。`我们` 只见于页脚「联系我们」，不代表品牌自称。
- 受众名词：开发者 / 客户 / 企业（person.audience_noun 五页合计最高）。「客户」作宾语（「使能客户持续创新」）≠ 对读者称「客户」。
- 证据页：`home` / https://www.huaweicloud.com/ 「携手全球客户，邀您一起见证云端力量」；`product-agentarts.html` / https://www.huaweicloud.com/product/agentarts.html 「即刻体验 打造您的专属AI智能体」。
