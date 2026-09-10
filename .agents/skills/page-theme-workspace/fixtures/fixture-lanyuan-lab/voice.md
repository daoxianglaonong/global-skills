---
schema: page-theme-voice/v1
locale: zh-CN
register: semi-formal
tone_axes:
  humor: serious
  respect: respectful
  enthusiasm: matter-of-fact
brand_self: 岚源
reader: 您
audience_noun: [研究者, 工程师]
primary_cta: [开始记录]
secondary_cta: [查看文档]
consult_cta: [预约演示]
headline_structures:
  - id: S_custom_result_first
    evidence:
      - { text: "让每次实验都留下可复现的痕迹", url: "https://www.lanyuan-lab.invalid/", pageId: home }
      - { text: "让评测结果三分钟内可复算", url: "https://www.lanyuan-lab.invalid/", pageId: home }
  - id: S_custom_noun_series
    evidence:
      - { text: "实验记录与复算，一处收口", url: "https://www.lanyuan-lab.invalid/", pageId: home }
      - { text: "数据、脚本、结论，同一个版本号", url: "https://www.lanyuan-lab.invalid/", pageId: home }
  - id: S_custom_name_plus_category
    evidence:
      - { text: "岚源台账 实验记录服务", url: "https://www.lanyuan-lab.invalid/", pageId: home }
      - { text: "岚源复算 结果验证服务", url: "https://www.lanyuan-lab.invalid/", pageId: home }
slot_caps:
  heading: { min: 8, typical: 14, max: 24, observed: true, confidence: medium }
  subcopy: { min: 12, typical: 24, max: 40, observed: true, confidence: medium }
  item_title: { min: 4, typical: 6, max: 12, observed: true, confidence: medium }
  item_body: { min: 16, typical: 28, max: 44, observed: true, confidence: medium }
  primary_cta: { min: 2, typical: 4, max: 6, observed: true, confidence: medium }
  secondary_cta: { min: 2, typical: 4, max: 6, observed: true, confidence: medium }
locale_pack: zh-CN
few_shot_count: 4
chrome_upgrades: []
---

# fixture-lanyuan-lab · 语气与文案规范

手工写定的 fixture 语料，单页取样（`home`）。所有原句与 URL 均为虚构，`.invalid` 顶级域按 RFC 2606 永不解析，不随任何线上站点漂移。

## §V0 一句话本质

用工程口吻讲清「记录到可复算」这一条链，不谈愿景。

## §V1 气质对

| is | not | 证据页 |
| --- | --- | --- |
| 动作 + 可验证结果（记录 / 复算 / 收口） | 愿景抒情（「我们相信科研的力量」） | home |
| 名词三连切开能力 | 形容词堆砌（「强大、智能、领先」） | home |
| 中文名 + 空格 + 品类 | 只抛英文代号不写品类 | home |
| 数字给单位与口径 | 裸数字充当卖点 | home |

反例未在本 fixture 出现，属生成禁区，不是实测句。

## §V2 槽位句式

### heading

- structure: S_custom_result_first（可叠 S_custom_noun_series，主型只标一个）
- length: 见 `slot_caps.heading`
- example: 让每次实验都留下可复现的痕迹
- rewrite_hint: 先写读者得到的结果，句末不加句号。证据：`home` / https://www.lanyuan-lab.invalid/ 「让每次实验都留下可复现的痕迹」

### subcopy

- structure: S_custom_noun_series
- length: 见 `slot_caps.subcopy`
- example: 记录、复算、归档三步同版本收口，不用再翻聊天记录
- rewrite_hint: 顿号并列 2–3 个动作，末句落一个具体好处。证据：`home` / https://www.lanyuan-lab.invalid/ 「实验记录与复算，一处收口」

### item_title

- structure: 两到四字动宾短语
- length: 见 `slot_caps.item_title`
- example: 版本收口
- rewrite_hint: 只写动作，不写产品名。证据：`home` / https://www.lanyuan-lab.invalid/ 「版本收口」

### item_body

- structure: 一句陈述，说清这张卡管什么
- length: 见 `slot_caps.item_body`
- example: 每次运行自动绑定数据与脚本的版本号，回看时不必人工对齐。
- rewrite_hint: 一句一件事，不列参数表。证据：`home` / https://www.lanyuan-lab.invalid/ 「版本收口」卡说明

### primary_cta

- structure: 动宾两到四字
- length: 见 `slot_caps.primary_cta`
- example: 开始记录
- rewrite_hint: 只用 front matter `primary_cta` 表内的词。证据：`home` 首屏实心钮 / https://www.lanyuan-lab.invalid/ 「开始记录」

### secondary_cta

- structure: 动宾两到四字
- length: 见 `slot_caps.secondary_cta`
- example: 查看文档
- rewrite_hint: 只用 front matter `secondary_cta` 表内的词；线框钮走本槽。证据：`home` 首屏线框钮 / https://www.lanyuan-lab.invalid/ 「查看文档」

## §V3 词汇

- prefer：记录 · 复算 · 收口 · 版本号 · 口径
- avoid：赋能 · 引领 · 生态 · 一站式 · 全方位
- forbidden_topics：融资与估值 · 同类产品点名对比

证据：`home` / https://www.lanyuan-lab.invalid/ 「数据、脚本、结论，同一个版本号」——全站以「版本号」而非「一站式」作卖点词。

## §V4 Don't

- id: voice-dont-01
  check: copy
  text: 主 CTA 只能取「开始记录」；禁止自造「立即体验」「马上开始」「Get started」
- id: voice-dont-02
  check: copy
  text: 禁止第一人称「我们」讲品牌故事；岚源第三人称出场，「联系我们」只作页脚入口
- id: voice-dont-03
  check: copy
  text: 禁止在营销楼层写备案号与热线，二者只留页脚 beian 槽
- id: voice-dont-04
  check: copy
  text: 禁止使用 §V3 avoid 表词汇（赋能 / 引领 / 生态 / 一站式 / 全方位），本站零命中

voice-dont-03 证据：`home` 页脚 / https://www.lanyuan-lab.invalid/ 备案文本只出现在页脚，内容楼层零命中。

## §V5 金句

> 让每次实验都留下可复现的痕迹
> — heading / home / https://www.lanyuan-lab.invalid/

> 记录、复算、归档三步同版本收口，不用再翻聊天记录
> — subcopy / home / https://www.lanyuan-lab.invalid/

> 版本收口
> — item_title / home / https://www.lanyuan-lab.invalid/

> 开始记录
> — primary_cta / home / https://www.lanyuan-lab.invalid/

四条均为内容楼层实测，无 chrome 句升格，`chrome_upgrades` 为空。

## §V6 情境变调

| 情境 | 相对默认的偏移 | 仍须遵守 |
| --- | --- | --- |
| 首屏 | 实心钮走 `primary_cta`，线框钮走 `secondary_cta`，二者成对 | register=semi-formal、reader=您、CTA 三表 |
| 三列能力卡 | 卡内无按钮，卡标题走 `item_title` 短语 | 同上；不得把卡标题写成口号 |
| 转化条 | 单钮，重复首屏 `primary_cta` 文案 | 同上；不得换用 `consult_cta` |
| 页脚 | 只有导航词、法务与备案文本 | 页脚腔不得模仿进内容楼层 |

## §V7 中文专章 locale_pack.zh-CN

### punctuation

做：标题用逗号或顿号切开；能力并列用顿号「、」。

不做：标题末尾加句号、感叹号、省略号。

证据：`home` / https://www.lanyuan-lab.invalid/ 「数据、脚本、结论，同一个版本号」。

### numbers

- 时长：中文数字 + 中文单位，不改回阿拉伯数字。证据：`home` / https://www.lanyuan-lab.invalid/ 「让评测结果三分钟内可复算」。
- 其余数字形态（百分号、金额、量级、个数）本 fixture 零样本，不立规则；生成页遇到时按该槽众数处理，不得从外站搬处方。

### cjk_latin

只统计**中英实际相邻**的样本，无邻接样本的槽不立规则。

| 槽 | 邻接样本 n | ratioWithSpace | 规则 |
| --- | ---: | ---: | --- |
| heading | 2 | 2/2 = 1.00 | 中英之间插 U+0020（`岚源台账 实验记录服务`） |
| subcopy | 0 | — | 不立硬规则 |
| item_title | 0 | — | 不立硬规则 |

`≥0.9` / `≤0.1` 才可立硬规则，其余一律记 `mixed`。heading 的 n=2 已在硬线内但样本薄，照实记录、不外推到其它槽。生成页同一屏内不得两种混用。

### address

- 读者：营销楼层统一「您」，零「你」。
- 品牌自称：`岚源` 第三人称出场，不写「我们」。
- 受众名词：研究者 / 工程师。

证据：`home` / https://www.lanyuan-lab.invalid/ 「让每次实验都留下可复现的痕迹」——通篇不出现人称代词，称谓只在 CTA 周边出现「您」。
