// VENDORED-FROM: page-theme-core/src/schemas/index.schema.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// patterns/index.yaml 的声明式形状。
// DSL 见 shape-dsl.md。词表与枚举在 enums.mjs。
// 楼层 pattern（{id}.yaml / chrome.yaml）的形状不在本文件，在同目录 patterns.schema.mjs。
// 本文件从 patterns.schema.mjs 原样切出：形状、条款号、必填集与闭集引用一字未改。

import * as E from '../enums.mjs';

const STR = (clause, extra = {}) => ({ kind: 'scalar', type: 'string', minLength: 1, clause, ...extra });
const INT = (clause, extra = {}) => ({ kind: 'scalar', type: 'int', clause, ...extra });
const NUM = (clause, extra = {}) => ({ kind: 'scalar', type: 'number', clause, ...extra });
const BOOL = (clause) => ({ kind: 'scalar', type: 'boolean', clause });

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
