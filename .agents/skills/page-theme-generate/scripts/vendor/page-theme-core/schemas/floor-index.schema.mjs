// VENDORED-FROM: page-theme-core/src/schemas/floor-index.schema.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// floor-index.json（楼层选型索引）的声明式形状。
// DSL 见 shape-dsl.md。涂色裁定的算法在 ../paint.mjs，本文件只描述落盘形状。

import * as E from '../enums.mjs';

const CL = 'asset-contract.md §7';
const STR = (extra = {}) => ({ kind: 'scalar', type: 'string', minLength: 1, clause: CL, ...extra });
const INT = (extra = {}) => ({ kind: 'scalar', type: 'int', clause: CL, ...extra });
const NUM = (extra = {}) => ({ kind: 'scalar', type: 'number', clause: CL, ...extra });
const BOOL = () => ({ kind: 'scalar', type: 'boolean', clause: CL });

/**
 * 涂色的**算法输入与跳过裁定**。这里没有「应涂色」，也不该有：
 * `surfaces[n % len]` 里的 `n` 数的是参与交替的楼层个数，同一楼层排在不同序列里
 * 算出来不是同一个底色，逐楼层预存一个值在数学上没有定义。
 *
 * 三条 bool 都是**按自带涂色**裁的。序列条目上手写了 `surface` 会改变 resolve 结果，
 * 从而可能改变裁定——终值一律以 `paintSequence()` 跑出来的为准，本表只作输入。
 */
const PAINT_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid',
  required: ['ownSurface', 'skippedByRole', 'skippedByTaxonomy', 'ownSurfaceIsHardSkip', 'hitsSkip', 'participatesInCount'],
  fields: {
    ownSurface: STR({ enum: E.RHYTHM_SURFACES }),
    skippedByRole: BOOL(),
    skippedByTaxonomy: BOOL(),
    ownSurfaceIsHardSkip: BOOL(),
    hitsSkip: BOOL(),
    participatesInCount: BOOL(),
  },
};

const VARIANT_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid', required: ['layout', 'mediaPosition', 'overlay'],
  fields: {
    layout: STR({ enum: E.VARIANT_LAYOUTS }),
    columns: INT({ min: 1 }),
    mediaPosition: STR({ enum: E.VARIANT_MEDIA_POSITIONS }),
    overlay: BOOL(),
    offGrid: BOOL(),
    bentoMap: { kind: 'array', clause: CL, min: 1, item: STR({ pattern: /^\d+x\d+$/ }) },
    align: STR({ enum: E.VARIANT_ALIGNS }),
    card: STR({ enum: E.VARIANT_CARDS }),
  },
};

const SLOT_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid', required: ['name', 'required'],
  fields: {
    name: STR(),
    required: BOOL(),
    repeatable: BOOL(),
    typicalChars: STR(),
  },
};

const FLOOR_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid',
  required: ['id', 'source', 'file', 'labelZh', 'taxonomy', 'role', 'summary',
    'variant', 'container', 'density', 'slots', 'contentCount', 'paint', 'confidence'],
  fields: {
    id: STR(),
    // 与 `file` 一起答「这一行是从哪投影来的」：不同步时校验器要能把人直接送到那个文件，
    // 而 chrome 条目与 pattern 条目住法不同（前者共处一文件），光有 file 指不准
    source: STR({ enum: ['pattern', 'chrome'] }),
    file: STR(),
    labelZh: STR(),
    taxonomy: STR(),
    role: STR({ enum: E.FLOOR_ROLES }),
    summary: STR(),
    variant: VARIANT_SHAPE,
    container: {
      kind: 'object', clause: CL, unknown: 'forbid', required: ['mode'],
      fields: { mode: STR({ enum: E.CONTAINER_MODES }), maxWidthPx: NUM({ min: 0 }) },
    },
    density: STR({ enum: E.DENSITY }),
    contentMax: STR({ enum: E.CONTENT_MAX }),
    slots: { kind: 'array', clause: CL, min: 1, item: SLOT_SHAPE },
    contentCount: {
      kind: 'object', clause: CL, unknown: 'forbid', required: ['unit', 'min', 'max', 'typical'],
      fields: { unit: STR(), min: INT({ min: 1 }), max: INT({ min: 1 }), typical: INT({ min: 1 }) },
    },
    paint: PAINT_SHAPE,
    confidence: STR({ enum: E.CONFIDENCE }),
  },
};

const SKELETON_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid', required: ['id', 'labelZh', 'steps', 'confidence'],
  fields: {
    id: STR({ pattern: E.SKELETON_ID_PATTERN }),
    labelZh: STR(),
    steps: {
      kind: 'array', clause: CL, min: 1,
      item: {
        kind: 'object', clause: CL, unknown: 'forbid', required: ['taxonomy', 'required', 'repeat'],
        fields: {
          taxonomy: STR(),
          required: BOOL(),
          repeat: {
            kind: 'object', clause: CL, unknown: 'forbid', required: ['min', 'max'],
            fields: { min: INT({ min: 0 }), max: INT({ min: 0 }) },
          },
        },
      },
    },
    confidence: STR({ enum: E.CONFIDENCE }),
  },
};

export const FLOOR_INDEX_SHAPE = {
  kind: 'object', clause: CL, unknown: 'forbid',
  required: ['schemaVersion', 'styleSetId', 'rhythm', 'floors', 'skeletons'],
  fields: {
    schemaVersion: INT({ const: 1 }),
    styleSetId: STR(),
    rhythm: {
      kind: 'object', clause: CL, unknown: 'forbid',
      required: ['scheme', 'surfaces', 'skipRoles', 'skipTaxonomies'],
      fields: {
        scheme: STR({ enum: E.RHYTHM_SCHEMES }),
        surfaces: { kind: 'array', clause: CL, min: 1, item: STR({ enum: E.RHYTHM_SURFACES }) },
        skipRoles: { kind: 'array', clause: CL, min: 1, item: STR({ enum: E.FLOOR_ROLES }) },
        // 空数组合法：站点明确不按 taxonomy 跳过时就是空的，不得与「省略」混为一谈
        skipTaxonomies: { kind: 'array', clause: CL, min: 0, item: STR() },
      },
    },
    floors: { kind: 'array', clause: CL, min: 1, item: FLOOR_SHAPE },
    skeletons: { kind: 'array', clause: CL, min: 1, item: SKELETON_SHAPE },
  },
};
