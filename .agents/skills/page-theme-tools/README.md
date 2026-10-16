# page-theme-tools

page-theme-asset、page-theme-generate、page-theme-audit 三个 skill 共用的工具。**不是 skill**：没有 `SKILL.md`，不进技能索引，不是任务入口；三包按同级相对路径 `../page-theme-tools/` 调用。发布或拷贝 generate / audit 时必须带上本目录。

- 安装：Node ≥ 20；在 `scripts/` 下 `npm install`。`capture` / `sample` 另需 `npx playwright install chromium`。`postinstall` 会删掉 `node_modules` 里所有 `SKILL.md`（playwright-core 自带几份）：`.agents/skills/` 下任何一份 `SKILL.md` 都会被技能索引收进去。
- 入口：`node scripts/theme.mjs <command> [args]`，命令 `check`、`css`、`preview`、`capture`、`sample`、`lint`、`inventory`、`baseline`。
- 合同：命令、输出、退出码、lint 阻断清单见 [tools.md](tools.md)；资产格式（tokens.json v2、tokens.css）见 [asset-format.md](asset-format.md)。
- 测试：本目录下 `node --test`。
