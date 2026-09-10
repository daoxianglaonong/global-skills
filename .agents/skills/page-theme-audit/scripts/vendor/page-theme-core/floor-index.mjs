// VENDORED-FROM: page-theme-core/src/floor-index.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// 楼层选型索引：把 `patterns/` 下散在多篇 YAML 里的选型字段投影成一张表。
//
// ## 为什么要这张表
//
// 大纲阶段要选楼层，今天得打开 `index.yaml` 再逐篇打开被选中的 `{id}.yaml`，
// 而「这层参不参与涂色交替」还得照着散文里的三道跳过规则现推一遍。
// 推导发生在每个下游、每一次，推错了没人会报错。本表把推导挪到采集时做一次。
//
// ## 本模块是纯函数，I/O 在采集侧
//
// 生成器读盘、解析 YAML 之后调它；校验器拿同一批解析结果再调一次，与落盘的表逐字比对。
// 两边共用这一个函数，「表和 patterns/ 不同步」才成其为一道能挂的门——
// 若校验器另写一套投影，比对的就是两份各自可能错的东西。

import { classifyPaintStep, normalizeRhythm } from './paint.mjs';

export const FLOOR_INDEX_SCHEMA_VERSION = 1;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** 定序不用 localeCompare：本表要在不同机器上逐字节一致，排序不能跟着 locale 走。 */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** 只在源值存在时落键，缺席就是缺席——写 `undefined` 会被 `Object.entries` 交出一个空键。 */
function put(target, key, value) {
  if (value !== undefined && value !== null) target[key] = value;
  return target;
}

function mapVariant(v) {
  const out = {};
  put(out, 'layout', v.layout);
  put(out, 'columns', v.columns);
  put(out, 'mediaPosition', v.media_position);
  put(out, 'overlay', v.overlay);
  put(out, 'offGrid', v.off_grid);
  put(out, 'bentoMap', Array.isArray(v.bento_map) ? v.bento_map.slice() : undefined);
  put(out, 'align', v.align);
  put(out, 'card', v.card);
  return out;
}

function mapSlots(slots) {
  return (Array.isArray(slots) ? slots : []).map((s) => {
    const out = {};
    put(out, 'name', s?.name);
    put(out, 'required', s?.required);
    put(out, 'repeatable', s?.repeatable);
    put(out, 'typicalChars', s?.typical_chars);
    return out;
  });
}

/**
 * @param {object} index 已解析的 patterns/index.yaml
 * @param {Array<{ id: string, source: 'pattern'|'chrome', file: string, body: object }>} floors
 *        `body` 是 `{id}.yaml` 全文，或 `chrome.yaml` 里某个条目的值。
 * @returns {object} 落盘形状；`floors` 按 id 定序，`skeletons` 保持 index.yaml 的声明顺序。
 */
export function buildFloorIndex(index, floors) {
  const idx = isObj(index) ? index : {};
  const rhythm = normalizeRhythm(idx.rhythm);

  const rows = (Array.isArray(floors) ? floors : []).map(({ id, source, file, body }) => {
    const b = isObj(body) ? body : {};
    const variant = isObj(b.variant) ? b.variant : {};
    const container = isObj(b.container) ? b.container : {};
    const cc = isObj(b.content_count) ? b.content_count : {};
    const ownSurface = isObj(b.rhythm) ? b.rhythm.surface : undefined;

    const cls = classifyPaintStep({ role: b.role, taxonomy: b.taxonomy, surface: ownSurface }, rhythm);

    const row = { id, source, file };
    put(row, 'labelZh', b.label_zh);
    put(row, 'taxonomy', b.taxonomy);
    put(row, 'role', b.role);
    put(row, 'summary', b.summary);
    row.variant = mapVariant(variant);
    row.container = put(put({}, 'mode', container.mode), 'maxWidthPx', container.max_width_px);
    put(row, 'density', b.density);
    put(row, 'contentMax', b.content_max);
    row.slots = mapSlots(b.slots);
    row.contentCount = put(put(put(put({}, 'unit', cc.unit), 'min', cc.min), 'max', cc.max), 'typical', cc.typical);
    row.paint = {
      ...put({}, 'ownSurface', ownSurface),
      skippedByRole: cls.skippedByRole,
      skippedByTaxonomy: cls.skippedByTaxonomy,
      ownSurfaceIsHardSkip: cls.surfaceIsHardSkip,
      hitsSkip: cls.hitsSkip,
      participatesInCount: cls.participatesInCount,
    };
    put(row, 'confidence', b.confidence);
    return row;
  }).sort(byId);

  const skeletons = (Array.isArray(idx.page_skeletons) ? idx.page_skeletons : []).map((sk) => {
    const s = isObj(sk) ? sk : {};
    const row = {};
    put(row, 'id', s.id);
    put(row, 'labelZh', s.label_zh);
    row.steps = (Array.isArray(s.steps) ? s.steps : []).map((st) => {
      const t = isObj(st) ? st : {};
      const rep = isObj(t.repeat) ? t.repeat : {};
      const out = {};
      put(out, 'taxonomy', t.taxonomy);
      put(out, 'required', t.required);
      out.repeat = put(put({}, 'min', rep.min), 'max', rep.max);
      return out;
    });
    put(row, 'confidence', s.confidence);
    return row;
  });

  return {
    schemaVersion: FLOOR_INDEX_SCHEMA_VERSION,
    styleSetId: idx.style_set_id,
    rhythm,
    floors: rows,
    skeletons,
  };
}
