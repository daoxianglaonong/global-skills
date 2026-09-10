# fixture-lanyuan-lab

**这不是真实资产，是行为 eval 的冻结输入。** 站点虚构，`www.lanyuan-lab.invalid` 按 RFC 2606 永不解析；不得对它跑采集，也不得把它放进 `page-theme/`。

## 怎么读我

| 文件 | 读它做什么 |
| --- | --- |
| `tokens.json` | 唯一取值真相源。默认读 semantic 层；primitive 只供 alias 解析与刻度阅读 |
| `patterns/index.yaml` | 楼层序列、涂色节奏、骨架型库、页面清单 |
| `patterns/chrome.yaml` | 顶栏与页脚，整站一篇 |
| `patterns/{id}.yaml` | 单个内容楼层的构图契约 |
| `voice.md` | 文案语气、句法型、槽位字数 |
| `DESIGN.md` | 人读投影 + Don't 清单；只有 §1 与 §8 |

冲突一律以结构化文件为准，散文不覆盖 token。

## 规模

3 个内容楼层（`hero` / `feature` / `cta`）+ 2 篇页壳条目 + 1 个页面 + 1 个骨架型。

## 三条使用禁令

- 不得改本目录的任何取值来迁就某次 eval 结果；要改先开票。
- 不得补 `run-meta.json` / `screenshots/` / `raw/`：本资产无采集运行，补了就是伪造证据，且会引入随 core 版本漂移的字段。
- 不得从 `page-theme/` 下的真实资产复制内容进来：本资产手工写定，与任何一次重采解耦。
