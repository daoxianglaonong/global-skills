#!/usr/bin/env node
// 500ms 品牌归属实验：材料集组装 + 身份层遮罩 + 随机化 + 主持页生成（Q-22–Q-39）。
//
//   node accept/build-materials.mjs --asset page-theme/<style-set-id> --spec materials.json \
//        [--seed <s>] [--run <accept-run-id>] [--work .page-theme-work] [--dry-run]
//
// 本工具**只做材料与主持**：组装、随机化、遮罩、曝光计时、答案录入。
// 计分裁判必须是 1 名未参与本项目的外部盲裁判（Q-26–Q-28），提取者只主持、票不计分（Q-27）。
// 本仓**不存在**任何「模型代替裁判打分」的代码路径，视觉 LLM 只准预演（Q-45 / Q-46）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonOr, utcRunId, reportHead } from './lib/asset-read.mjs';
import { shuffle, itemId } from './lib/rng.mjs';
import { loadRGBA, writePNG, fillRect, ringMedianColor } from './lib/imgdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IDENTITY_KINDS = ['logo', 'brand-name', 'product-name', 'icp', 'phone']; // Q-38 身份层闭集
const FORMAL_ROLES = ['holdout', 'generated', 'competitor'];
const DEFAULT_COUNTS = { holdout: 1, generated: 2, competitor: 4 }; // Q-33 / Q-36 默认 1+2+4，张数可调

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const DRY = argv.includes('--dry-run');
const errors = [];
const notes = [];
const die = (m) => {
  console.error(`build-materials: ${m}`);
  process.exit(1);
};

const ASSET = opt('asset');
const SPEC_PATH = opt('spec');
if (!ASSET || !SPEC_PATH) die('用法见文件头；--asset 与 --spec 必填');
const spec = readJsonOr(SPEC_PATH);
if (!spec) die(`读不到材料清单: ${SPEC_PATH}`);
const STYLE_SET_ID = path.basename(path.resolve(ASSET));
const RUN_ID = opt('run', utcRunId());
const RUN_DIR = path.join(opt('work', '.page-theme-work'), STYLE_SET_ID, RUN_ID);
const OUT_DIR = path.join(RUN_DIR, 'attribution');
const SEED = opt('seed', spec.seed || `${STYLE_SET_ID}-${RUN_ID}`);
const specDir = path.dirname(path.resolve(SPEC_PATH));
const resolveFile = (f) => (path.isAbsolute(f) ? f : path.join(specDir, f));

// ---------- 材料合规校验：不合规拒绝出材料，不得静默降级 ----------
const head = reportHead(ASSET);
if (head.attributionApplicable === false) {
  die('coverage.cohesion.verdict = mixed-suspected：品牌归属实验对本批资产不适用（Q-61b）。不得改换构念。');
}

const exposureMs = Number(spec.exposureMs ?? 500); // Q-23 正式 500ms，可在 300ms–1s 间校准
if (!(exposureMs >= 300 && exposureMs <= 1000)) errors.push(`exposureMs=${exposureMs} 越出 Q-23 的 300–1000ms 校准区间`);

const pageType = String(spec.pageType || '').trim();
if (!pageType) errors.push('缺 pageType；测试集必须整组同一页面类型（Q-32）');
if (/^(404|not-?found)$/i.test(pageType)) errors.push('禁止把 404 当作唯一风格级页面类型（Q-44）');

const test = Array.isArray(spec.test) ? spec.test : [];
const rehearsal = Array.isArray(spec.rehearsal) ? spec.rehearsal : [];
const learning = Array.isArray(spec.learning) ? spec.learning : [];
const calibration = Array.isArray(spec.calibration) ? spec.calibration : [];

for (const it of test) {
  if (!FORMAL_ROLES.includes(it.role)) {
    errors.push(`正式集出现非法 role=${it.role}：AI-slop / 远跨行业页只准进预演或校准（Q-34）`);
  }
  if (it.pageType && it.pageType !== pageType) errors.push(`${it.file} 页面类型 ${it.pageType} ≠ ${pageType}（Q-32 同类型控制）`);
  if (it.role === 'competitor' && !String(it.reason || '').trim()) {
    errors.push(`竞品 ${it.file} 缺选择理由：必须写明品类 / 版式 / 配色相近度（Q-35）`);
  }
}
const counts = Object.fromEntries(FORMAL_ROLES.map((r) => [r, test.filter((t) => t.role === r).length]));
if (counts.holdout > 1) errors.push('原站真留出页槽只有 1 个（Q-33.1）');
if (counts.holdout === 0) {
  notes.push('Q-33 第 1 槽空缺：无有效 holdout 真页。风格级不得声称「有 ground truth 的留出验证」（Q-56 / Q-61a）');
}
if (head.holdoutDeclared !== true) {
  notes.push(head.independentValidationNotice || '本次未完成独立风格验证（Q-61a）');
}
if (!counts.generated) errors.push('缺生成页（Q-33.2）');
if (!counts.competitor) errors.push('缺同行业近邻竞品页（Q-33.3 / Q-35）');
for (const r of FORMAL_ROLES) {
  if (counts[r] && counts[r] !== DEFAULT_COUNTS[r]) {
    notes.push(`${r} 张数 ${counts[r]} ≠ 默认 ${DEFAULT_COUNTS[r]}：张数属本项目自定、可随类型可得性调整（Q-36），但三类构成与同类型控制不得破坏`);
  }
}

// Q-29：学习 3 张原站真页视口图，各 10 秒；首页 + 2 张内页；禁止自由浏览原站
if (learning.length !== 3) errors.push(`学习材料必须 3 张（Q-29），现 ${learning.length} 张`);
// Q-31：学习/校准 与 测试集不重叠；真留出页不得出现在学习或校准
const testFiles = new Set(test.map((t) => path.resolve(resolveFile(t.file))));
const holdoutFiles = new Set(test.filter((t) => t.role === 'holdout').map((t) => path.resolve(resolveFile(t.file))));
for (const l of learning) if (testFiles.has(path.resolve(resolveFile(l.file)))) errors.push(`学习材料 ${l.file} 与测试集重叠（Q-31）`);
if (calibration.length < 2) errors.push('校准题必须备 ≥2 道：答错要重看学习材料后再测一题（Q-30）');
for (const q of calibration) {
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length !== 4) errors.push(`校准题 ${q.id} 必须四选一（Q-30）`);
  if (!opts.some((o) => o.id === q.answerId)) errors.push(`校准题 ${q.id} 的 answerId 不在选项内`);
  for (const o of opts) if (holdoutFiles.has(path.resolve(resolveFile(o.file)))) errors.push(`校准题 ${q.id} 用了真留出页（Q-31 禁止）`);
}

// Q-38 / Q-39：遮罩范围必须覆盖身份层五项，且每项要么给矩形、要么由主持人显式声明本页不存在
const maskSpec = spec.masks || {};
for (const it of test) {
  const m = maskSpec[it.file];
  if (!m) {
    errors.push(`${it.file} 缺遮罩声明：遮罩轮必须遮 logo / 品牌名 / 产品名 / 备案号 / 电话（Q-38）`);
    continue;
  }
  for (const kind of IDENTITY_KINDS) {
    const rects = (m.rects || []).filter((r) => r.kind === kind);
    const absent = Array.isArray(m.absent) && m.absent.includes(kind);
    if (!rects.length && !absent) errors.push(`${it.file} 的身份项 ${kind} 既无遮罩矩形也未声明 absent（Q-38 不得静默漏遮）`);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, notes }, null, 2));
  process.exit(1);
}

// ---------- 随机化：遮罩轮与原样轮各自独立洗牌，种子记账 ----------
const formal = test.map((t) => ({ ...t, id: itemId(t.file, SEED) }));
const maskedOrder = shuffle(formal.map((f) => f.id), `${SEED}#masked`);
const plainOrder = shuffle(formal.map((f) => f.id), `${SEED}#plain`);

if (DRY) {
  console.log(JSON.stringify({ ok: true, dryRun: true, seed: SEED, counts, maskedOrder, plainOrder, notes }, null, 2));
  process.exit(0);
}

// ---------- 出图：等体积中性替换（Q-39），禁止破坏性刺眼 mask ----------
fs.mkdirSync(path.join(OUT_DIR, 'masked'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'plain'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'learning'), { recursive: true });

const maskLog = [];
for (const it of formal) {
  const src = resolveFile(it.file);
  if (!fs.existsSync(src)) die(`材料图不存在: ${src}`);
  const plain = await loadRGBA(src);
  await writePNG(plain, path.join(OUT_DIR, 'plain', `${it.id}.png`));
  const masked = await loadRGBA(src);
  const applied = [];
  for (const r of maskSpec[it.file].rects || []) {
    const fill = ringMedianColor(masked, r); // 中性色取自该区外圈中位色，等尺寸不改版面体积
    fillRect(masked, r, fill);
    applied.push({ kind: r.kind, rect: { x: r.x, y: r.y, w: r.w, h: r.h }, fill });
  }
  await writePNG(masked, path.join(OUT_DIR, 'masked', `${it.id}.png`));
  maskLog.push({ id: it.id, role: it.role, source: it.file, applied, absent: maskSpec[it.file].absent || [] });
}
const learningItems = [];
for (const [i, l] of learning.entries()) {
  const src = resolveFile(l.file);
  if (!fs.existsSync(src)) die(`学习材料不存在: ${src}`);
  const img = await loadRGBA(src);
  const id = `L${i + 1}`;
  await writePNG(img, path.join(OUT_DIR, 'learning', `${id}.png`));
  learningItems.push({ id, note: l.note || '', file: `learning/${id}.png` });
}
const calItems = [];
for (const [qi, q] of calibration.entries()) {
  const opts = [];
  for (const [oi, o] of q.options.entries()) {
    const src = resolveFile(o.file);
    if (!fs.existsSync(src)) die(`校准图不存在: ${src}`);
    const img = await loadRGBA(src);
    const id = `C${qi + 1}O${oi + 1}`;
    await writePNG(img, path.join(OUT_DIR, 'learning', `${id}.png`));
    opts.push({ id, file: `learning/${id}.png`, correct: o.id === q.answerId });
  }
  calItems.push({ id: q.id || `C${qi + 1}`, prompt: q.prompt || '哪一张属于刚才学习的目标站？', options: shuffle(opts, `${SEED}#cal${qi}`) });
}

// ---------- manifest：主持人侧（含答案键），裁判侧的 session.html 不含 role ----------
const manifest = {
  schema_version: 1,
  clause: 'Q-22–Q-39',
  styleSetId: STYLE_SET_ID,
  runId: RUN_ID,
  head,
  pageType,
  exposureMs,
  exposureMsNote: '规格正文与试点记录必须写实际所用毫秒（Q-23）；材料为该断点视口图，非 fullPage',
  seed: SEED,
  rounds: ['masked', 'plain'],
  roundsNote: '先遮罩轮并计分，后原样轮只作归因（Q-37）；禁止先原样后遮罩',
  counts,
  answerKey: Object.fromEntries(formal.map((f) => [f.id, { role: f.role, source: f.file, reason: f.reason || null }])),
  maskedOrder,
  plainOrder,
  maskLog,
  learning: learningItems,
  calibration: calItems,
  rehearsal: rehearsal.map((r) => ({ source: r.file, kind: r.kind || 'ai-slop', note: 'Q-34：只作预演 / 校准，不进分母' })),
  notes,
  judgeRequirement: '1 名完全未参与本项目的外部盲裁判：未看过本站资产 / 未参与提取 / 未参与拍板（Q-26）。拉不到即试点不通过，无降级通道（Q-28）',
  scoringPathNote: '本工具不含任何模型打分路径；视觉 LLM 只准预演且必须换左右顺序重跑（Q-45），不得进 CI（Q-46）',
};
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// 裁判侧数据：只给不透明 id 与图路径，不给 role / answerKey
const judgeData = {
  exposureMs,
  learning: learningItems,
  calibration: calItems.map((c) => ({ id: c.id, prompt: c.prompt, options: c.options.map((o) => ({ id: o.id, file: o.file })) })),
  masked: maskedOrder.map((id) => ({ id, file: `masked/${id}.png` })),
  plain: plainOrder.map((id) => ({ id, file: `plain/${id}.png` })),
};
const tpl = fs.readFileSync(path.join(HERE, 'templates', 'session.html'), 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'session.html'), tpl.replace('__PT_SESSION_DATA__', JSON.stringify(judgeData)));

const fill = (t) =>
  t
    .replaceAll('{{STYLE_SET_ID}}', STYLE_SET_ID)
    .replaceAll('{{RUN_ID}}', RUN_ID)
    .replaceAll('{{PAGE_TYPE}}', pageType)
    .replaceAll('{{EXPOSURE_MS}}', String(exposureMs))
    .replaceAll('{{SEED}}', SEED)
    .replaceAll('{{ITEM_ROWS}}', maskedOrder.map((id) => `| ${id} | | | |`).join('\n'))
    .replaceAll('{{NOTES}}', notes.length ? notes.map((n) => `- ${n}`).join('\n') : '- 无');
for (const f of ['score-sheet.md', 'host-checklist.md']) {
  fs.writeFileSync(path.join(OUT_DIR, f), fill(fs.readFileSync(path.join(HERE, 'templates', f), 'utf8')));
}

console.log(
  JSON.stringify(
    { ok: true, out: OUT_DIR, seed: SEED, exposureMs, counts, maskedItems: maskedOrder.length, learning: learningItems.length, calibration: calItems.length, notes },
    null,
    2,
  ),
);
