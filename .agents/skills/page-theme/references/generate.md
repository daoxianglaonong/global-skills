# page-theme · 生成段规程

只在生成段与验收段加载。采集时不读本文件。

本文件是可操作规则的完整载体：生成与验收所需的规则一律内联。`README.md` 与 `DESIGN.md` 的章节正文不在此（读资产本身）；`frontend-design` 与 `responsive-design` 一律软引用，缺了不视为失败。

## 1. 生成前的输入校验


| 项          | 规则                                                                            |
| ---------- | ----------------------------------------------------------------------------- |
| 资产是否存在     | `asset_dir` 存在且含 `README.md` 才算有资产；空目录或只有 `input/` 一律视为无资产          |
| 无资产        | 必须自动串联：先分析再生成，开跑前用一句话告知，不等确认                                            |
| 目标 variant | 输入必须带 `target_variant`（字符串；`""` 表示 `default`）                          |
| 疑似多套设计语言   | 体检判 `mixed-suspected` 时 `target_variant` 必须显式给出，不得用缺省；此处回话要求指定不违反不阻塞纪律 |
| 目标页序列来源    | 已采页取其 `sequence`；原站不存在的新页必须先在 `page_skeletons` 里选一型                    |


- 读 `patterns/chrome.yaml` 时**只取**匹配 `target_variant` 的那条；无匹配必须回退 `default`。
- 一页之内**不得**混用多个 variant 的页壳条目——混用会产出原站任何来源都不存在的页壳。
- `tokens.json` 与 `voice.md` 不按 variant 分叉，它们是 style-set 级派生物；不得据 variant 另建 overlay 文件。
- 新页序列必须 ∈ 所选骨架型，允许在该型给出的重复区间内增删同类楼层，按型里的楼层类别从目录选具体 pattern。
- 骨架型库里没有对应型时**不得硬失败**：按形态缺口处理，且只能用资产已有的 token 与节奏。
- 骨架选型产出的序列**永不**是 `high`，一律按候选处理，必须读图确认后再定稿。
- 楼层表面色一律交资产的涂色规则派生，骨架型不定表面色。

## 2. 取用粒度

按 `SKILL.md`「任务路由」的 `generate` 行读，逐条遵守：

1. 先读 `README.md` 选定本路由，再按需打开女儿文件。
2. `DESIGN.md` 默认只读 §1 Overview 与 §8 Don't；做色 / 字 / 形时再打开对应节，需要无障碍或视口对照才打开 §9 / §10。不得一上来把十节整份灌进上下文。
3. `patterns/index.yaml` 只取节奏、目录指针，以及**目标页的序列来源一项**。不得预加载全站所有页的序列，也不得把全部骨架型灌进上下文。
4. 序列可以含页壳行；页壳行不另开楼层文件，生成整页时读一次 `chrome.yaml`。楼层文件只打开序列里的内容楼层。
5. `voice.md` 只在本页有文案槽时读，只取本页用到的槽与禁词；示例文案全文不得预加载。
6. 截图必须经 `screenshots/index.json` 寻址后逐张取，不得无索引扫目录。
7. `tokens.json` 只取本页将用到的 semantic / component 路径；整盘不得进上下文。
8. 引用组根值必须写成带 `.$root` 的路径；只写到组名不构成可用 token 引用。
9. `raw/`、`run-meta.json`、`input/design-system/` 原文、`holdout.yaml` 一律不进生成上下文；留出页不得当临摹稿。
10. `confidence` 非 `high` 的字段必须读图确认或推翻后才写进生成页。
11. 生成整页必读 `chrome.yaml`；生成单个楼层或组件不读。任何读取序只在本路由内有效，不得提升为跨任务强制序。

## 3. 缺口二分

先判是值缺口还是形态缺口，二者动作互斥。


| 缺口类型 | 判据                      | 动作                                       |
| ---- | ----------------------- | ---------------------------------------- |
| 值缺口  | 资产里该角色 / 状态 / 语义没有观测值   | omit；或用资产已有的最近语义拼并，并按资产字段标记精度损失。**不得**编造 |
| 形态缺口 | 原站不存在这类板块（如原站无定价页却要定价表） | 允许发挥，但只能用资产已有的 token 与节奏，见下节             |


- 不得为通过对比度检查或为「看起来完整」而造盘、补档、补状态色。
- 必产出字段缺观测时**不得省字段**：保留字段 + `observed: false` + `confidence`。缺 `confidence` 的资产不合格，生成段不得当合格资产消费。
- 表面色档位只有两档；站点实测多出的浅表面只活在 `DESIGN.md` §2 散文里，生成时按两档近似并标记损失，不得为它新建 token。
- 不得引进「设计文件是真相源」式的自动生成回退来补缺映射——方向与本 skill 相反。缺映射按值缺口处理。
- 页面与供给**都**没有的值必须 omit。供给能补的只是「有值没上屏」。
- 未观测的角色在人读表里必须标「未观测」并指向 Don't 或已知缺口，不得写成可用值。

## 4. 形态缺口的质量下限

- 凡资产里有规定的，一律以资产为准，原创性让位；覆盖色、字、间距、楼层、语气。不得为「更好看 / 更现代」改写这些维度。
- 只有形态缺口才可以调用 `frontend-design` 当质量下限；值缺口禁止调它补色、补字、补间距。
- 软引用：环境已安装可再读其全文；未安装不视为失败，`SKILL.md`「形态缺口最低纪律」节内嵌的三句即为下限。
- 不得在 frontmatter 或正文写依赖声明式的「必须先安装 XX skill」。
- 新造板块的容器宽度与楼层间距必须落进本站已观测的节奏，不得自定站级默认。

## 5. 响应式：本站实测几何优先

> 摘自本机 `responsive-design` SKILL.md。**摘录日期：2026-08-22。** 原则已按本 skill 口径改写——原文的「设计稿」在此一律替换为**本站资产里该断点的逐楼层实测几何**。

1. 当前断点已有实测几何时，列数、排列方向、模块顺序、字体、间距与固定视觉尺寸必须遵循该断点资产。
2. 某断点没有实测几何时不得臆造，必须 omit 或保留字段并标 `observed: false` + `confidence`。
3. 不得以「响应式最佳实践」覆盖已有断点的布局结构或视觉尺寸。
4. 楼层主体按该楼层该断点的实测几何实现，不套站级默认栅格。

- 该 skill 自带的默认列数与断点像素表**不在**本摘录内，不得引入；本站断点像素一律取资产 `DESIGN.md` §10 的观测值。
- 该 skill 的风险停止确认机制**不在**本摘录内：本 skill 全程不阻塞。
- 若环境已安装 `responsive-design`，可再读其原文，仍以本站资产为准。

## 6. 生成后必跑门

生成段结束后必须跑门。门的分层与编排器动作如下：


| 态     | 编排器行为                            |
| ----- | -------------------------------- |
| 阻断类失败 | 必须自行修复并重跑门；修不了才向用户回话。不得把失败产物标为完成 |
| 报警类   | 只进本次报告，不阻断交付                     |


阻断类类目（规则条目抄自规格，**不得**在此新发明阈值）：


| 类目        | 检查什么                                        | 豁免                                                                                                |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 颜色        | 生成页颜色（含阴影色、边框色）落在资产合法色值全集之外，或走了非资产路径        | `inherit` / `unset` / `initial` / `currentColor` / `transparent` / `none` / `0`；带第三方 widget 标记的子树 |
| 字体族       | 生成页字体族不在资产已声明字体栈内                           | `inherit` / `unset` / `initial`；带第三方 widget 标记的子树                                                 |
| Don't 存在性 | 资产未上屏项对应的 Don't 条目在 `DESIGN.md` §8 缺失       | 无对应未上屏项则不要求该条                                                                                     |
| 供给上屏      | 把未上屏却带中档及以上置信度的 token 当作已上屏值使用              | 无                                                                                                 |
| 颜色层级      | 颜色 / 阴影色 / 边框色跳过 semantic 直引 primitive      | 尺寸类不走本条                                                                                           |
| 资产合格性     | 任一 `observed: false` 的 token 缺 `confidence` | 无                                                                                                 |
| 文案禁词      | 生成文案命中 `voice.md` 已列出的禁词                    | **字段存在才查**：空 `voice.md`、无禁词节、整节物理删除一律不得触发                                                         |


报警类类目（**不设红线**，只报数字）：


| 类目     | 检查什么                                                               |
| ------ | ------------------------------------------------------------------ |
| 供给引用比率 | 引用未上屏的供给 / 第一方声明值的比例。不硬禁                                           |
| 尺寸类指标  | 尺寸 / 圆角 / 非色阴影 / 过渡的引用率、字面量命中率、primitive 直引率。允许直引，只报「本可用 semantic」 |


- 第三方嵌入控件（支付、地图、客服、验证码等）其内部色与字体不计入颜色与字体族两条；根节点必须带采集侧规定的第三方标记属性，**读不到该属性则不得豁免**。
- 生成页必须复用采集侧同一属性名与取值，不得自造属性名。
- 颜色与字体族走零容忍 + 上表豁免，**不走**引用率红线。
- 阻断类规则必须能从资产自身派生：合法色值全集来自 `tokens.json`，Don't 清单来自 `DESIGN.md`。脚本随 skill 走，资产搬走后硬门不得消失。
- 未安装本包脚本时，以资产 `README.md`「无脚本时至少人工核这几条」节为门，逐条人工对照。

## 7. 自证与留痕

- 自证只认 lint / schema / 映射存在性的机检结果。不得用「我读了 Don't」「已遵循正向纪律」这类自述代替门。
- 读取顺序即便写进 brief，也只作可选线索，不得当因果证据。
- 风格级新页必须落盘生成 trace，且必须记录：本次实际使用的 `target_variant` 与其来源 `sourceId`、所选骨架型 id（无则 `null` + 一句理由）、每个文案槽一条记录。
- trace 与验收报告落生成 / 验收工作区，**不得**写入 `page-theme/<style-set-id>/`，**不得**并进 `run-meta.json`。
- 像素重建页不写文案槽记录、不写骨架型；其序列来自原页 DOM。
- token 引用记录必须带 `.$root`。
- 缺强制 trace 字段的产物按验收侧规则打回补作业，不得当完成。

## 8. 消费单页与受阻资产

- `coverage.pages` 长度为 1 且本次无 `runtimeError` 即为合格单页资产，必须照常消费，不得因「不是全站」拒绝生成。
- 不得把 `single-page` 当 `coverage.status` 的取值读。
- 资产带 `blockers` 时照常生成，受阻范围只影响可用观测的多少，不构成拒绝理由。
- 扩充覆盖面走二次调用，不在生成段内自行加采页面。

## 9. 验收规程

验收产物一律落 `.page-theme-work/<style-set-id>/<accept-run-id>/`，**不得**写进资产目录，**不得**并进 `run-meta.json`。`<accept-run-id>` 用 UTC `YYYYMMDDTHHMMSSZ`。

两级验收必须分开：像素级只回答「资产有没有漏必须档维度」，风格级 500ms 品牌归属判断才是最终闸门。

### 必读


| 文件                                                                            | 何时               |
| ----------------------------------------------------------------------------- | ---------------- |
| `holdout.yaml` · `README.md` · `DESIGN.md` §8 · `tokens.json` 合法色值全集与字体栈      | 恒定         |
| 本次工作区的 `generate-trace*.json` / `rebuild-trace.json`                          | 恒定         |
| `screenshots/index.json` 与对照所需的图                                              | 恒定         |
| `README.md`「覆盖度」节的 `coverage` 对象（含 `holdoutDeclared`）；**不存在** `coverage.json` | 恒定 |
| `patterns/chrome.yaml`                                                        | 页壳专项抽检触发时       |
| `voice.md` · `run-meta.json` 的 `startedAt` · `raw/supply-match.json`          | 按需         |


禁止整盘读入：`tokens.json` 全文、`raw/` 除本次对照所需、全部 section yaml、`input/design-system/` 原文。

### 跑什么

```bash
# 像素级：首页 pc 与 mobile 两档全量重建；断点像素来自资产，禁止写死
node scripts/pixel-check.mjs --asset page-theme/<id> --viewport pc \
  --baseline <原站 URL 或缓存 PNG> --candidate <重建页 URL 或 PNG> \
  [--baseline-tree t.json --candidate-tree t.json] \
  [--raw-painted raw/<pageId>/painted-area.json] [--interaction-states raw/<pageId>/interaction-states.json] \
  --run <accept-run-id> [--evidence]

# 跨子域 / 内页 chrome 专项抽检：不重建正文。--host 用来选中该页的页壳变体
# 只对四项已冻结字段：variant 逐字段全等 / slots[].name 与各自 required /
# responsive.{档}.columns 与 grid.content_width_px / density 与 container.mode
node scripts/pixel-check.mjs --asset page-theme/<id> --viewport pc --mode chrome --host <被测子域> ...

# 生成后 lint；试点两条任务各跑一次，分节写报告
node scripts/lint-generated.mjs --asset page-theme/<id> --page out.html --css out.css \
  --trace <本任务 trace> --section lint --run <accept-run-id>

# 500ms 归属实验：只做材料与主持，不做判定
node scripts/accept/build-materials.mjs --asset page-theme/<id> --spec materials.json --run <accept-run-id>
node scripts/accept/score-attribution.mjs --asset page-theme/<id> --run <accept-run-id> --answers answers.json
```

退出码语义见 `shared-contract.md` §6。阻断类必须自行修复并重跑门，修不了才回话；报警类只进报告，不阻断交付。

### 硬规矩

1. 重建页文案必须从原页 DOM 抽可见文本**原样回填**，禁止走文案九步、禁止 lorem。风格级新页反之，必须走九步。
2. 重建页 trace 写 `rebuild-trace.json`，**禁止**写 `copy[]` 与 `skeleton`；风格级新页写 `generate-trace*.json`，`copy[]` 与 `skeleton` 均为强制字段。缺 trace 一律打回补作业，**不得**改资产。
3. 试点必须分落 `generate-trace.holdout.json`（计分）与 `generate-trace.comparison.json`（不计分），不得用单份顶替。
4. 整页与楼层级 mismatch% **只报警、不否决**；`8%` 与 `50%` 逐处标「本项目自定」。

4a. 生成页只准使用由 token 路径确定性派生的 CSS 变量名（丢尾部 `$root`、段名原样、`-` 连接、`--` 前缀）。`primitiveLeak.color` 与 `unresolvedVar` **必须同时为 0**，两项分列不合并——只查前者时改个变量名即可绕过整道门。
4b. 页壳**高度不是对账项**（竖向尺度由 `density` 承载）。若四项冻结字段全等而只有高度不同，记第一条证据、等第二站，**不得**自行加字段。
5. 归因主轴必须是 CSS / DOM 对账；`readOrder` 是纯自述，**不得**作因果证据。失败按 a 提取侧 / b 消费侧 / c schema / d 供给四分，禁止「再跑一遍」。
6. 报告头部必须显示当时的 `coverage`（含 `holdoutDeclared` 与 `cohesion.verdict`），取自资产 `README.md`「覆盖度」节；`run-meta.json` 里的是历史快照，**不得**当当前值用。`holdoutDeclared = false` 时必须写「本次未完成独立风格验证」，且全文**不得**出现「风格级验收通过」等表述。
7. `cohesion.verdict = mixed-suspected` 时品牌归属实验**不适用**，不得执行并据以出分，也**不得**改换构念。
8. 计分裁判必须是 1 名完全未参与本项目的外部盲裁判；agent 与提取者**只主持**，票不计分。拉不到人试点不通过，无降级通道。
9. **严禁**让任何模型代替裁判打分。视觉 LLM 只准预演且须换左右顺序重跑，不得进 v1 CI。
10. 归属实验的四款判据是描述性判据，**禁止**改写成 3/4、1/4 或任何正确率红线。N=1 无统计功效，报告必须写明。
11. 竞品被全部标「目标站」判**材料失败**，重做材料，**不算资产失败**。
12. 先遮罩轮计分、后原样轮只作归因，顺序不得调换。遮罩必须覆盖 logo / 品牌名 / 产品名 / 备案号 / 电话，且用等体积中性替换。
13. `holdout.yaml` 机器只读，**不得**回写一个字节。验收阶段可且只可打开 `ground_truth.url` 截视口图。
14. checklist 只辅助归因与回归，不得替代归属实验的四款判据；不得按 `coverage` 分档调整任何数字或通过线。