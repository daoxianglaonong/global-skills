// patterns/index.yaml · patterns/{id}.yaml · patterns/chrome.yaml 的声明式形状。
// DSL 见 shape-dsl.md。词表与枚举在 enums.mjs。

import * as E from './enums.mjs';

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

const GRID_SHAPE = {
  kind: 'object', clause: 'P-40', unknown: 'forbid', required: ['content_width_px', 'columns'],
  fields: {
    content_width_px: NUM('P-40', { min: 0 }),
    columns: INT('P-40', { min: 1 }),
    gutter_px: NUM('P-40', { min: 0 }),
    item_widths_px: { kind: 'array', clause: 'P-40', min: 1, item: NUM('P-40', { min: 0 }) },
    system_columns: INT('P-40', { min: 1 }),
  },
};

const BREAKPOINT_SHAPE = {
  kind: 'object', clause: 'P-40', unknown: 'forbid', required: ['columns', 'grid'],
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

/* ------------------------------------------------------------------ */
/* index.yaml。P-19 / P-20 / P-21 / P-22 / P-25 / P-27 / P-27a          */
/* ------------------------------------------------------------------ */

const CHROME_MOUNT_VALUE = {
  kind: 'union', clause: 'P-25', nullable: true,
  options: [
    STR('P-25'),
    {
      kind: 'object', clause: 'P-25', unknown: 'forbid', required: ['default'],
      fields: {
        default: STR('P-25'),
        variants: {
          kind: 'array', clause: 'P-25', min: 1,
          item: {
            kind: 'object', clause: 'P-25', unknown: 'forbid', required: ['hosts', 'pattern'],
            fields: {
              hosts: { kind: 'array', min: 1, item: STR('P-25') },
              pattern: STR('P-25'),
            },
          },
        },
      },
    },
  ],
};

/** P-23：sequence 条目里出现即阻断的构图字段。 */
const SEQUENCE_FORBIDDEN = Object.fromEntries(
  ['variant', 'slots', 'responsive', 'container', 'density'].map((k) => [k, {
    clause: 'P-23',
    message: `sequence 条目不得出现 \`${k}\`；构图变了必须新写 patterns/{id}.yaml 再引用`,
  }]),
);

const SEQUENCE_ITEM_SHAPE = {
  kind: 'object', clause: 'P-22', unknown: 'forbid', required: ['id', 'pattern'],
  forbidden: SEQUENCE_FORBIDDEN,
  fields: {
    id: STR('P-22'),
    pattern: STR('P-22'),
    taxonomy: STR('P-22'),
    surface: STR('P-22', { enum: E.RHYTHM_SURFACES }),
    content_count: {
      kind: 'object', clause: 'P-22', unknown: 'forbid', required: ['typical'],
      fields: { unit: STR('P-22'), typical: INT('P-22', { min: 1 }) },
    },
    label_zh: STR('P-22'),
    merge_spacing_with_prev: BOOL('P-22'),
    unmapped_reason: STR('P-22'),
    notes: { kind: 'scalar', type: 'string', clause: 'P-22' },
  },
};

const PAGE_SHAPE = {
  kind: 'object', clause: 'P-21', unknown: 'forbid', required: ['url', 'title_zh', 'sequence'],
  fields: {
    url: STR('P-21', { pattern: /^https?:\/\/\S+$/ }),
    title_zh: STR('P-21'),
    chrome: { kind: 'map', clause: 'P-21', keyEnum: Object.keys(E.CHROME_MOUNTS), value: CHROME_MOUNT_VALUE },
    rhythm: {
      kind: 'object', clause: 'P-21', unknown: 'forbid', required: [],
      fields: {
        scheme: STR('P-46', { enum: E.RHYTHM_SCHEMES }),
        surfaces: { kind: 'array', min: 1, item: STR('P-45', { enum: E.RHYTHM_SURFACES }) },
      },
    },
    sequence: { kind: 'array', clause: 'P-21', min: 1, item: SEQUENCE_ITEM_SHAPE },
  },
};

const SKELETON_SHAPE = {
  kind: 'object', clause: 'P-27a', unknown: 'forbid',
  required: ['id', 'label_zh', 'observed_on', 'steps', 'confidence'],
  fields: {
    id: STR('P-27a', { pattern: E.SKELETON_ID_PATTERN }),
    label_zh: STR('P-27a'),
    observed_on: { kind: 'array', min: 1, item: STR('P-27a') },
    steps: {
      kind: 'array', clause: 'P-27a', min: 1,
      item: {
        kind: 'object', unknown: 'forbid', required: ['taxonomy', 'required', 'repeat'],
        fields: {
          taxonomy: STR('P-27a'),
          required: BOOL('P-27a'),
          repeat: {
            kind: 'object', unknown: 'forbid', required: ['min', 'max'],
            fields: { min: INT('P-27a', { min: 0 }), max: INT('P-27a', { min: 0 }) },
          },
        },
      },
    },
    confidence: STR('P-27a', { enum: E.CONFIDENCE }),
  },
};

export const INDEX_SHAPE = {
  kind: 'object', clause: 'P-19', unknown: 'forbid',
  required: ['schema_version', 'style_set_id', 'taxonomy_layers', 'catalog', 'rhythm', 'chrome', 'page_skeletons', 'pages'],
  fields: {
    schema_version: INT('P-20', { const: 1 }),
    style_set_id: STR('P-20'),
    taxonomy_layers: {
      kind: 'array', clause: 'P-20', min: 1,
      item: STR('P-20', { enum: E.TAXONOMY_LAYERS }),
    },
    catalog: {
      kind: 'object', clause: 'P-17', unknown: 'forbid', required: ['chrome', 'sections'],
      fields: {
        chrome: STR('P-20', { const: 'chrome.yaml' }),
        sections: { kind: 'array', clause: 'P-20', item: STR('P-20') },
      },
    },
    rhythm: {
      kind: 'object', clause: 'P-19', unknown: 'forbid', required: ['scheme', 'skip_roles', 'surfaces'],
      fields: {
        scheme: STR('P-46', { enum: E.RHYTHM_SCHEMES }),
        skip_roles: { kind: 'array', min: 1, item: STR('P-47', { enum: E.FLOOR_ROLES }) },
        skip_taxonomies: { kind: 'array', min: 1, item: STR('P-47') },
        skip_surfaces: { kind: 'array', min: 1, item: STR('P-47', { enum: E.RHYTHM_SURFACES }) },
        surfaces: { kind: 'array', min: 1, item: STR('P-46', { enum: E.RHYTHM_SURFACES }) },
        notes: { kind: 'scalar', type: 'string', clause: 'P-19' },
      },
    },
    chrome: { kind: 'map', clause: 'P-25', keyEnum: Object.keys(E.CHROME_MOUNTS), value: CHROME_MOUNT_VALUE },
    layout: {
      kind: 'object', clause: 'P-27', unknown: 'forbid', required: ['grid'],
      fields: {
        grid: {
          kind: 'object', clause: 'P-27', unknown: 'forbid', required: ['derived', 'columns'],
          fields: {
            derived: { kind: 'scalar', type: 'boolean', const: true, clause: 'P-27' },
            columns: INT('P-27', { min: 1 }),
            gutter_px: NUM('P-27', { min: 0 }),
            content_width_px: NUM('P-27', { min: 0 }),
          },
        },
      },
    },
    page_skeletons: { kind: 'array', clause: 'P-27a', min: 1, item: SKELETON_SHAPE },
    pages: { kind: 'map', clause: 'P-20', keyPattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, min: 1, value: PAGE_SHAPE },
  },
};

export const SEQUENCE_FORBIDDEN_KEYS = Object.keys(SEQUENCE_FORBIDDEN);
