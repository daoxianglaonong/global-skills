#!/usr/bin/env node
// 500ms 品牌归属判断 · 描述性判据核算（Q-40 四款 + Q-85 归因提示）。
//
//   node accept/score-attribution.mjs --asset page-theme/<id> --run <accept-run-id> \
//        --answers answers.json [--work .page-theme-work]
//
// 本脚本**不判定裁判该给什么标签**，只把人已经给出的标签与人已经给出的「凭什么」人判结果，
// 按 Q-40 四款机械核对。凡是需要人判而人没填的，一律输出 undecided 并退出 2——
// 绝不代填、绝不用模型补（Q-26 / Q-27 / Q-45 / Q-46）。
// 退出码：0 四款全满足 / 1 不通过（含材料失败、裁判不合格）/ 2 有未决项。

import fs from 'node:fs';
import path from 'node:path';
import { readJsonOr, mergeReport, reportHead } from './lib/asset-read.mjs';

const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const die = (m) => {
  console.error(`score-attribution: ${m}`);
  process.exit(1);
};

const ASSET = opt('asset');
const RUN_ID = opt('run');
const ANSWERS = opt('answers');
if (!ASSET || !RUN_ID || !ANSWERS) die('用法见文件头；--asset / --run / --answers 必填');
const STYLE_SET_ID = path.basename(path.resolve(ASSET));
const RUN_DIR = path.join(opt('work', '.page-theme-work'), STYLE_SET_ID, RUN_ID);
const manifest = readJsonOr(path.join(RUN_DIR, 'attribution', 'manifest.json'));
if (!manifest) die(`读不到 ${path.join(RUN_DIR, 'attribution', 'manifest.json')}；先跑 build-materials.mjs`);
const answers = readJsonOr(ANSWERS);
if (!answers) die(`读不到 ${ANSWERS}`);

const head = reportHead(ASSET);
const undecided = [];
const failures = [];
const hints = [];

// ---------- 前置：构念适用性与裁判资格 ----------
if (head.attributionApplicable === false) {
  console.error(JSON.stringify({ verdict: 'not-applicable', reason: 'coverage.cohesion.verdict = mixed-suspected（Q-61b）；不得执行本实验并据以出分，也不得改换构念' }, null, 2));
  process.exit(1);
}
const j = answers.judge || {};
if (/llm|model|ai|gpt|claude/i.test(String(j.kind ?? ''))) {
  die('裁判类型标为模型：视觉 LLM 只准预演、不准计分（Q-45），本脚本无模型计分路径');
}
const qualifications = ['external', 'unseenAsset', 'notInExtraction', 'notInDecision'];
const missingQual = qualifications.filter((k) => typeof j[k] !== 'boolean');
const failedQual = qualifications.filter((k) => j[k] === false);
if (missingQual.length) undecided.push({ item: 'judge-qualification', missing: missingQual, reason: 'Q-26 四项资格未声明，无法确认裁判合格' });
if (failedQual.length) failures.push({ item: 'judge-qualification', failed: failedQual, reason: 'Q-26 未满足；Q-28 不设降级通道，试点不通过' });
if (answers.judgeReplaced === true) {
  failures.push({ item: 'calibration', reason: '两轮校准仍错已换裁判，本轮不作数（Q-30）；不得因此放宽 Q-40' });
}

// ---------- Q-40 第 1 款：校准 ----------
const calByQ = new Map((manifest.calibration || []).map((c) => [c.id, c]));
let calibrationPassed = null;
for (const rec of answers.calibration || []) {
  const q = calByQ.get(rec.questionId);
  if (!q) {
    undecided.push({ item: 'calibration', questionId: rec.questionId, reason: '作答的校准题不在 manifest 中' });
    continue;
  }
  const correctId = (q.options.find((o) => o.correct) || {}).id;
  const ok = rec.pickedOptionId === correctId;
  if (ok) calibrationPassed = rec.round ?? 1;
}
if (calibrationPassed === null) {
  if ((answers.calibration || []).length >= 2) failures.push({ item: 'calibration', reason: '两轮校准均错：必须换裁判，本轮不作数（Q-30）' });
  else undecided.push({ item: 'calibration', reason: '无通过记录且未跑满两轮（Q-30）' });
}

// ---------- 轮次顺序（Q-37） ----------
const firstAt = (arr) => (arr && arr.length && arr[0].at ? Date.parse(arr[0].at) : null);
const tMasked = firstAt(answers.masked);
const tPlain = firstAt(answers.plain);
if (tMasked && tPlain && tMasked > tPlain) {
  failures.push({ item: 'round-order', reason: '原样轮早于遮罩轮：先原样会把记忆残留压在计分轮（Q-37），本轮作废' });
}

// ---------- 计分轮标签归组（只用遮罩轮，Q-37） ----------
const key = manifest.answerKey || {};
const labelOf = new Map((answers.masked || []).map((r) => [r.itemId, r]));
const plainLabelOf = new Map((answers.plain || []).map((r) => [r.itemId, r]));
const group = (role) => Object.keys(key).filter((id) => key[id].role === role);
const generated = group('generated');
const competitor = group('competitor');
const holdout = group('holdout');
const missingAnswers = Object.keys(key).filter((id) => !labelOf.has(id));
if (missingAnswers.length) undecided.push({ item: 'masked-round', missing: missingAnswers, reason: '计分轮有未作答项' });

const labels = (ids) => ids.map((id) => ({ id, label: labelOf.get(id)?.label ?? null, why: labelOf.get(id)?.why ?? null, source: key[id].source }));
const genLabels = labels(generated);
const compLabels = labels(competitor);
const holdLabels = labels(holdout);

// Q-40 第 2 款：生成页不得**全部**被标成「其他站」（全称谓词，不算正确率，Q-41）
const clause2 = genLabels.length
  ? genLabels.every((x) => x.label === 'other')
    ? 'fail'
    : genLabels.some((x) => x.label === null)
      ? 'undecided'
      : 'pass'
  : 'undecided';
if (clause2 === 'fail') failures.push({ item: 'Q-40.2', reason: '2 张生成页被全部标成「其他站」' });
if (clause2 === 'undecided') undecided.push({ item: 'Q-40.2', reason: '生成页标签不全' });

// Q-40 第 3 款：竞品全部被标「目标站」→ 材料失败，重做材料，不算资产失败
let materialFailure = false;
const clause3 = compLabels.length
  ? compLabels.every((x) => x.label === 'target')
    ? 'material-failure'
    : compLabels.some((x) => x.label === null)
      ? 'undecided'
      : 'pass'
  : 'undecided';
if (clause3 === 'material-failure') {
  materialFailure = true;
  failures.push({ item: 'Q-40.3', reason: '4 张竞品页被全部标成「目标站」→ 判材料失败，必须重做材料，**不算资产失败**' });
}
if (clause3 === 'undecided') undecided.push({ item: 'Q-40.3', reason: '竞品标签不全' });

// Q-40 第 4 款：「凭什么」不得只指向已遮蔽的身份标识——人判，缺则 undecided
const review = answers.whyReview || {};
let clause4 = 'pass';
for (const g of genLabels) {
  if (g.label !== 'target') continue;
  const r = review[g.id];
  if (!r || typeof r.onlyIdentityCues !== 'boolean') {
    clause4 = 'undecided';
    undecided.push({ item: 'Q-40.4', itemId: g.id, reason: '缺人判 whyReview.onlyIdentityCues；本脚本不代判、不用模型判' });
  } else if (r.onlyIdentityCues === true) {
    clause4 = 'fail';
    failures.push({ item: 'Q-40.4', itemId: g.id, reason: '判「目标站」的理由只指向已遮蔽的身份标识 → 材料或遮罩失败，重做材料（Q-85）' });
  }
}
if (!genLabels.some((g) => g.label === 'target')) clause4 = clause4 === 'pass' ? 'n/a' : clause4;

// ---------- Q-85 归因提示（只给方向，不下结论） ----------
for (const g of genLabels) {
  const p = plainLabelOf.get(g.id);
  if (p && p.label === 'target' && g.label !== 'target') {
    hints.push({ itemId: g.id, branch: 'Q-85 原样轮能认出、遮罩轮不能认出', hint: '身份层以外的气质不足（a 的签名手法 / 排印 / 密度，或 c 截图不足）；不改写 Q-40（遮罩轮已计分）' });
  }
  if (g.label === 'other' || g.label === 'unsure') {
    hints.push({ itemId: g.id, branch: 'Q-85 生成页被标「其他站」或「不确定」', hint: '先看 G-LINT 阻断项是否已关（常是 b），再走 Q-82；suppliedOnlyRate 突出则看 d（Q-83）' });
  }
}
if (!holdout.length) hints.push({ branch: 'Q-56', hint: 'Q-33 第 1 槽空缺：不得声称「有 ground truth 的留出验证」' });

const clause1 = calibrationPassed !== null ? 'pass' : failures.some((f) => f.item === 'calibration') ? 'fail' : 'undecided';
const allPass = [clause1, clause2, clause3, clause4].every((c) => c === 'pass' || c === 'n/a') && !failures.length;
const verdict = failures.length ? (materialFailure ? 'material-failure' : 'fail') : undecided.length ? 'undecided' : allPass ? 'pass' : 'undecided';

const payload = {
  clause: 'Q-22–Q-46',
  head,
  runId: RUN_ID,
  pageType: manifest.pageType,
  exposureMsConfigured: manifest.exposureMs,
  exposureMsActual: [...new Set((answers.masked || []).map((r) => r.exposureMsActual).filter(Boolean))],
  judgeId: answers.judgeId ?? null,
  clauses: { 'Q-40.1 校准': clause1, 'Q-40.2 生成页非全「其他站」': clause2, 'Q-40.3 竞品非全「目标站」': clause3, 'Q-40.4 凭什么不只靠身份标识': clause4 },
  maskedRound: { generated: genLabels, competitor: compLabels, holdout: holdLabels },
  failures,
  undecided,
  attributionHints: hints,
  verdict,
  statisticalPower: 'N=1 无统计功效，本级为描述性判据（Q-40）',
  noNumericGate: '未计算任何生成页正确率；3/4、1/4 一类数字闸门被明令禁止（Q-41），数字闸门留到 N≥10（Q-42）',
  independentValidationNotice: head.independentValidationNotice,
};
fs.mkdirSync(RUN_DIR, { recursive: true });
const file = mergeReport(RUN_DIR, 'attribution', payload);

console.log(JSON.stringify({ verdict, clauses: payload.clauses, failures: failures.length, undecided: undecided.length, hints: hints.length, report: file }, null, 2));
process.exit(verdict === 'pass' ? 0 : verdict === 'undecided' ? 2 : 1);
