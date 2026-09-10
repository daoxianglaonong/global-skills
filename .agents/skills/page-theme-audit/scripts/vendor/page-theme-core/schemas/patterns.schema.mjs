// VENDORED-FROM: page-theme-core/src/schemas/patterns.schema.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// patterns/{id}.yaml · patterns/chrome.yaml 的声明式形状。
// DSL 见 shape-dsl.md。词表与枚举在 enums.mjs。
// patterns/index.yaml 的形状不在本文件，在同目录 index.schema.mjs。

import * as E from '../enums.mjs';

const STR = (clause, extra = {}) => ({ kind: 'scalar', type: 'string', minLength: 1, clause, ...extra });
const INT = (clause, extra = {}) => ({ kind: 'scalar', type: 'int', clause, ...extra });
const NUM = (clause, extra = {}) => ({ kind: 'scalar', type: 'number', clause, ...extra });
const BOOL = (clause) => ({ kind: 'scalar', type: 'boolean', clause });

/* ------------------------------------------------------------------ */
/* 楼层 pattern（{id}.yaml 与 chrome.yaml 内每个条目共用）。P-28 / P-60   */
/* ------------------------------------------------------------------ */

const VARIANT_SHAPE = {
  kind: 'object', clause: 'P-30', unknown: 'forbid',
  required: ['layout', 'media_position', 'overlay'],
  fields: {
    layout: STR('P-30', { enum: E.VARIANT_LAYOUTS }),
    columns: INT('P-30', { min: 1 }),
    media_position: STR('P-30', { enum: E.VARIANT_MEDIA_POSITIONS }),
    overlay: BOOL('P-30'),
    off_grid: BOOL('P-30'),
    bento_map: { kind: 'array', clause: 'P-30', min: 1, item: STR('P-30', { pattern: /^\d+x\d+$/ }) },
    align: STR('P-30', { enum: E.VARIANT_ALIGNS }),
    card: STR('P-30', { enum: E.VARIANT_CARDS }),
  },
};

export const GRID_SHAPE = {
  kind: 'object', clause: 'P-40', unknown: 'forbid', required: [],
  fields: {
    content_width_px: NUM('P-40', { min: 0 }),
    columns: INT('P-40', { min: 1 }),
    gutter_px: NUM('P-40', { min: 0 }),
    item_widths_px: { kind: 'array', clause: 'P-40', min: 1, item: NUM('P-40', { min: 0 }) },
    system_columns: INT('P-40', { min: 1 }),
    observed: BOOL('P-40'),
    confidence: STR('P-40', { enum: E.CONFIDENCE }),
  },
};

export const BREAKPOINT_SHAPE = {
  kind: 'object', clause: 'P-40', unknown: 'forbid', required: [],
  fields: {
    columns: INT('P-39', { min: 1 }),
    order: STR('P-44'),
    overlay_strategy: STR('P-44', { enum: E.OVERLAY_STRATEGY }),
    grid: GRID_SHAPE,
  },
};

const RESPONSIVE_SHAPE = {
  kind: 'object', clause: 'P-37', unknown: 'forbid', required: ['pc', 'tablet', 'mobile'],
  fields: {
    pc: BREAKPOINT_SHAPE,
    tablet: BREAKPOINT_SHAPE,
    mobile: BREAKPOINT_SHAPE,
    stack_below: STR('P-44', { enum: E.STACK_BELOW }),
    notes: { kind: 'scalar', type: 'string', clause: 'P-44' },
  },
};

const SLOTS_SHAPE = {
  kind: 'array', clause: 'P-32', min: 1,
  item: {
    kind: 'object', clause: 'P-32', unknown: 'forbid', required: ['name', 'required'],
    fields: {
      name: STR('P-31'),
      required: BOOL('P-32'),
      repeatable: BOOL('P-32'),
      typical_chars: STR('P-32'),
      notes: { kind: 'scalar', type: 'string', clause: 'P-32' },
    },
  },
};

const CONTENT_COUNT_SHAPE = {
  kind: 'object', clause: 'P-34', unknown: 'forbid', required: ['unit', 'min', 'max', 'typical'],
  fields: {
    unit: STR('P-34'),
    min: INT('P-34', { min: 1 }),
    max: INT('P-34', { min: 1 }),
    typical: INT('P-34', { min: 1 }),
    observed: { kind: 'array', clause: 'P-34', min: 1, item: INT('P-34', { min: 0 }) },
  },
};

const OBSERVATIONS_SHAPE = {
  kind: 'array', clause: 'P-36a', min: 1,
  item: {
    kind: 'object', clause: 'P-36a', unknown: 'forbid',
    required: ['path', 'pageId', 'pageUrl', 'value', 'selected'],
    fields: {
      path: STR('P-36a'),
      pageId: STR('P-36a'),
      pageUrl: STR('P-36a'),
      value: { kind: 'any', clause: 'P-36a' },
      selected: BOOL('P-36a'),
    },
  },
};

export const PATTERN_SHAPE = {
  kind: 'object', clause: 'P-28', unknown: 'forbid',
  required: [
    'id', 'taxonomy', 'label_zh', 'role', 'summary',
    'variant', 'container', 'density', 'slots', 'content_count', 'responsive', 'rhythm',
    'observed_on', 'confidence',
  ],
  fields: {
    id: STR('P-29'),
    taxonomy: STR('P-29'),
    label_zh: STR('P-29'),
    role: STR('P-29', { enum: E.FLOOR_ROLES }),
    aliases: { kind: 'array', clause: 'P-29', min: 1, item: STR('P-29') },
    summary: STR('P-29'),
    variant: VARIANT_SHAPE,
    container: {
      kind: 'object', clause: 'P-52', unknown: 'forbid', required: ['mode'],
      fields: { mode: STR('P-52', { enum: E.CONTAINER_MODES }), max_width_px: NUM('P-54', { min: 0 }) },
    },
    density: STR('P-50', { enum: E.DENSITY }),
    content_max: STR('P-28', { enum: E.CONTENT_MAX }),
    slots: SLOTS_SHAPE,
    content_count: CONTENT_COUNT_SHAPE,
    responsive: RESPONSIVE_SHAPE,
    rhythm: {
      kind: 'object', clause: 'P-48', unknown: 'forbid', required: ['surface'],
      fields: {
        surface: STR('P-45', { enum: E.RHYTHM_SURFACES }),
        alternate: STR('P-48', { enum: E.RHYTHM_ALTERNATE }),
        full_bleed_media: BOOL('P-48'),
        merge_spacing_with_prev: BOOL('P-48'),
      },
    },
    unmapped_reason: STR('P-09'),
    observed_on: { kind: 'array', clause: 'P-35', min: 1, item: STR('P-35') },
    screenshot: STR('P-35'),
    dom_hint: STR('P-35'),
    dont: { kind: 'array', clause: 'P-35', min: 1, item: STR('P-35') },
    observations: OBSERVATIONS_SHAPE,
    observed: BOOL('P-36'),
    confidence: STR('P-35', { enum: E.CONFIDENCE }),
  },
};

/**
 * chrome.yaml：以 pattern id 为键的映射。P-60
 * 值不在本形状里展开——每个条目由校验器逐条走 PATTERN_SHAPE，避免同一条目报两遍。
 */
export const CHROME_SHAPE = {
  kind: 'map', clause: 'P-60', keyPattern: /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*$/,
  min: 1, value: { kind: 'any' },
};
