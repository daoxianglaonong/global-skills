# 500ms 归属实验 · 主持清单

style-set `{{STYLE_SET_ID}}` · run `{{RUN_ID}}` · 类型 `{{PAGE_TYPE}}` · 曝光 `{{EXPOSURE_MS}}`ms · 种子 `{{SEED}}`

主持人只主持与记录旁注，**票不计入判据**（Q-27）。

## 开跑前

- [ ] 裁判已到位且四项资格全满足（Q-26）。拉不到人 → 试点不通过，不设降级通道（Q-28）
- [ ] `manifest.json` 的 `head.holdoutDeclared` 为 `true`。为 `false` → 报告必须写「本次未完成独立风格验证」，且全文不得出现「风格级验收通过」等表述（Q-61a）
- [ ] `manifest.json` 的 `head.cohesionVerdict` 不是 `mixed-suspected`。是 → 本实验不适用，停止执行，按 Q-61b 标注依据，**不得**改换构念
- [ ] 正式集三类构成齐备且整组同一页面类型（Q-32 / Q-33）
- [ ] 4 张竞品是同行业近邻，选择理由已逐张写进 `answerKey[].reason`（Q-35）
- [ ] AI-slop / 远跨行业页只在 `rehearsal`，未进正式集（Q-34）
- [ ] 学习 3 张与测试集不重叠；真留出页未出现在学习或校准（Q-31）
- [ ] 遮罩已覆盖身份层五项（logo / 品牌名 / 产品名 / 备案号 / 电话），逐张核 `maskLog`（Q-38）
- [ ] 遮罩是等体积中性替换，无刺眼色块（Q-39）——逐张肉眼过一遍 `attribution/masked/`
- [ ] 断网或至少确认裁判不会中途去浏览原站（Q-29）

## 跑

- [ ] 用浏览器打开 `attribution/session.html`（本地文件即可，无需服务器、无网络请求）
- [ ] 学习 3 张各 10 秒 → 校准题 → 第 1 轮遮罩（计分）→ 第 2 轮原样（不计分）
- [ ] 顺序必须是先遮罩后原样（Q-37）。页面已固化该顺序，**不得**手工调换
- [ ] 校准答对错由主持人按 `manifest.calibration[].options[].correct` 核对（裁判端不持有答案键）
- [ ] 校准第 1 轮错 → 重看一轮学习材料再测一题；两轮仍错 → 换裁判，本轮不作数（Q-30）
- [ ] 每张的「凭什么」如实照抄裁判原话，不得替他润色

## 跑完

- [ ] 保存裁判端导出的 `answers.json`
- [ ] 补 `answers.judge`：`{ external, unseenAsset, notInExtraction, notInDecision }` 四项布尔
- [ ] 补 `answers.whyReview`：逐条人判「凭什么是否只指向已遮蔽身份标识」（Q-40 第 4 款）。**必须由人填**
- [ ] 跑 `node accept/score-attribution.mjs --asset <资产目录> --run {{RUN_ID}} --answers answers.json`
- [ ] 核算结果并入 `accept-report.json`；报告头部必须显示 `coverage`（含 `holdoutDeclared` 与 `cohesion.verdict`）（Q-61）

## 红线

- 严禁让任何模型代替裁判打分。视觉 LLM 只准预演，且预演必须换左右顺序重跑（Q-45）；不得进 v1 CI（Q-46）。
- 严禁把 Q-40 的四款描述性判据改写成比率红线（Q-41 / Q-42）。
- 竞品被全部标成「目标站」判**材料失败**，重做材料，**不算资产失败**（Q-40 第 3 款）。
- 原样轮能认出、遮罩轮不能认出，只作归因信号，**不改写** Q-40 的结论（Q-85）。

## 本次备注

{{NOTES}}
