# hero.stacked-plain

本趟几何归纳待验证线索。字段数字只听 landmark；下列是被覆盖 / 被删 / 无法判定的线索，不是第二处真相。

- stack_below：因缺观测无法判定塌陷档（pc floor-root）。
- floor-root 覆盖人读：pc 人读 2 列 [122, 94] gutter 16 cw 665。landmark 为 floor-root，字段走缺观测，不写 1 列。
- 疑点已结（2026-09-01）：**确认是采集侧缺陷，不是量小。** tablet / mobile 曾写 2 列 `[48, 144]` cw 224，量到的是公告芯片，人读三档都是单列 hero。起因是判据 10 的层高门槛用绝对像素（`> 400`），窄档层高 366 < 400 漏过矮条裁剪、芯片进池胜出，而 PC 层高 550 被正常裁成 `floor-root`——同一个 hero 在一页三档里判成两种。门槛已改为「max 盒高 ≤ 层高 ⅓」（`extract.md` §6.1），三档现在一致落 `floor-root`，字段走缺观测。
