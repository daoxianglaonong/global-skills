# global-skills · page-theme-v2

从 `skills-list` 同步 **生成 / 优化** 与 **校验**。不含采集包，不含评测夹具。

| 路径 | 是什么 |
| --- | --- |
| `.agents/skills/page-theme-generate/` | 创造模式出新页；优化模式刷既有页主题 |
| `.agents/skills/page-theme-audit/` | 对照资产验产物：十道门 + 色 / 非色值映射 |
| `page-theme/huaweicloud-com/` | 这两包运行时唯一消费的风格资产 |

本仓打开后 Cursor 从 `.agents/skills/` 加载 skill。两包 Node ≥ 20、零运行时依赖，不需要 `npm install`。

调用时显式传 `--asset page-theme/huaweicloud-com`。没有采集包，准入若得到 `absent` 无法串采集，必须自备合格资产。

`huaweicloud-com` 截图已按取用面缩过：只留 PC 楼层缩略图，外加 pattern `screenshot:` 点名的 3 张页级图。

## 提示词参考

```text
使用 page-theme-generate，按 page-theme/huaweicloud-com 这份资产对页面做华为云主题改造：
1、仅做主题适配，禁止改动项目/楼层骨架或功能，禁止直接修改内容
2、仅改造内容区域，不动页头、页尾
```
