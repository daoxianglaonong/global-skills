// tokens.json / tokens.dark.json / resolver.json 的声明式形状。
// DSL 见 shape-dsl.md。三层结构与角色词表的闭集在 enums.mjs。

import * as E from './enums.mjs';

/** DTCG fontWeight 规范关键字。T-13 */
const FONT_WEIGHT_KEYWORDS = [
  'thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal', 'regular', 'book',
  'medium', 'semi-bold', 'demi-bold', 'bold', 'extra-bold', 'ultra-bold', 'black', 'heavy',
  'extra-black', 'ultra-black',
];

const DIMENSION_VALUE = {
  kind: 'object', clause: 'T-13', unknown: 'forbid', required: ['value', 'unit'],
  fields: {
    value: { kind: 'scalar', type: 'number' },
    unit: { kind: 'scalar', type: 'string', enum: ['px', 'rem'] },
  },
};

const COLOR_VALUE = {
  kind: 'object', clause: 'T-12', unknown: 'forbid', required: ['colorSpace', 'components', 'hex'],
  fields: {
    colorSpace: { kind: 'scalar', type: 'string', const: 'srgb' },
    components: { kind: 'array', min: 3, max: 3, item: { kind: 'scalar', type: 'number', min: 0, max: 1 } },
    alpha: { kind: 'scalar', type: 'number', min: 0, max: 1 },
    hex: { kind: 'scalar', type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ },
  },
};

const SHADOW_ONE = {
  kind: 'object', clause: 'T-13', unknown: 'forbid', required: ['color', 'offsetX', 'offsetY', 'blur'],
  fields: {
    color: { kind: 'union', options: [COLOR_VALUE, { kind: 'scalar', type: 'string' }] },
    offsetX: DIMENSION_VALUE,
    offsetY: DIMENSION_VALUE,
    blur: DIMENSION_VALUE,
    spread: DIMENSION_VALUE,
    inset: { kind: 'scalar', type: 'boolean' },
  },
};

/** `$type` → `$value` 形状。alias（`{a.b.c}`）在规则层短路，不进本表。T-12 / T-13 */
export const VALUE_SHAPES = {
  color: COLOR_VALUE,
  dimension: DIMENSION_VALUE,
  duration: {
    kind: 'object', clause: 'T-13', unknown: 'forbid', required: ['value', 'unit'],
    fields: {
      value: { kind: 'scalar', type: 'number' },
      unit: { kind: 'scalar', type: 'string', enum: ['ms', 's'] },
    },
  },
  fontFamily: {
    kind: 'union', clause: 'T-13',
    options: [
      { kind: 'scalar', type: 'string', minLength: 1 },
      { kind: 'array', min: 1, item: { kind: 'scalar', type: 'string', minLength: 1 } },
    ],
  },
  fontWeight: {
    kind: 'union', clause: 'T-13',
    options: [
      { kind: 'scalar', type: 'int', min: 1, max: 1000 },
      { kind: 'scalar', type: 'string', enum: FONT_WEIGHT_KEYWORDS },
    ],
  },
  number: { kind: 'scalar', type: 'number', clause: 'T-13' },
  cubicBezier: {
    kind: 'array', clause: 'T-13', min: 4, max: 4,
    item: { kind: 'scalar', type: 'number' },
  },
  shadow: {
    kind: 'union', clause: 'T-13',
    options: [SHADOW_ONE, { kind: 'array', min: 1, item: SHADOW_ONE }],
  },
  typography: {
    kind: 'object', clause: 'T-10', unknown: 'forbid',
    required: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'],
    fields: {
      fontFamily: { kind: 'any' },
      fontSize: { kind: 'any' },
      fontWeight: { kind: 'any' },
      lineHeight: { kind: 'any' },
      letterSpacing: { kind: 'any' },
    },
  },
  border: {
    kind: 'object', clause: 'T-10', unknown: 'forbid', required: ['color', 'width', 'style'],
    fields: { color: { kind: 'any' }, width: { kind: 'any' }, style: { kind: 'any' } },
  },
};

/** family / 维度 group 级 `scale` 对象。T-79 */
export const SCALE_SHAPE = {
  kind: 'object', clause: 'T-79', unknown: 'forbid', required: ['mode'],
  fields: {
    mode: { kind: 'scalar', type: 'string', enum: E.SCALE_MODES },
    declaredFrom: { kind: 'scalar', type: 'string', minLength: 1 },
    guessedSystem: { kind: 'scalar', type: 'string' },
    measure: { kind: 'scalar', type: 'string', enum: E.SCALE_MEASURES },
    basePx: { kind: 'scalar', type: 'number' },
  },
};

/** token 级 `measured`。T-80 */
export const MEASURED_SHAPE = {
  kind: 'object', clause: 'T-80', unknown: 'forbid', required: [],
  fields: {
    oklchL: { kind: 'scalar', type: 'number' },
    px: { kind: 'scalar', type: 'number' },
  },
};

/** token 级 `wcag`。T-81 / T-117 / T-119 */
export const WCAG_SHAPE = {
  kind: 'object', clause: 'T-81', unknown: 'forbid', required: ['ratio'],
  fields: {
    ratio: { kind: 'scalar', type: 'number' },
    aaText: { kind: 'scalar', type: 'boolean' },
    aaLarge: { kind: 'scalar', type: 'boolean' },
    aaUi: { kind: 'scalar', type: 'boolean' },
    alert: { kind: 'scalar', type: 'boolean' },
  },
};

/** token 级 `observations`（形状以 M-33 为准，本表只收 ch02 已引用的必填列）。T-125 */
export const TOKEN_OBSERVATIONS_SHAPE = {
  kind: 'array', clause: 'T-125', min: 1,
  item: {
    kind: 'object', unknown: 'allow', required: ['pageId', 'value', 'selected'],
    fields: {
      pageId: { kind: 'scalar', type: 'string', minLength: 1 },
      pageUrl: { kind: 'scalar', type: 'string', minLength: 1 },
      value: { kind: 'any' },
      selected: { kind: 'scalar', type: 'boolean' },
    },
  },
};

/** `$extensions["page-theme"]` 的字段形状；未列键走 T-18 保留策略（报警不阻断）。 */
export const EXT_SHAPE = {
  kind: 'object', clause: 'T-72', unknown: 'warn', required: [],
  fields: {
    observed: { kind: 'scalar', type: 'boolean', clause: 'T-73' },
    confidence: { kind: 'scalar', type: 'string', enum: E.CONFIDENCE, clause: 'T-74' },
    source: { kind: 'scalar', type: 'string', enum: E.SOURCE, clause: 'T-75' },
    lossy: { kind: 'scalar', type: 'boolean', clause: 'T-76' },
    merged: { kind: 'scalar', type: 'boolean', clause: 'T-77' },
    unmapped: { kind: 'scalar', type: 'boolean', clause: 'T-78' },
    scale: SCALE_SHAPE,
    measured: MEASURED_SHAPE,
    officialName: { kind: 'scalar', type: 'string', clause: 'T-83' },
    suppliedValue: { kind: 'any', clause: 'T-81' },
    suppliedPath: { kind: 'scalar', type: 'string', clause: 'T-81' },
    conflict: { kind: 'scalar', type: 'boolean', clause: 'T-82' },
    match: { kind: 'scalar', type: 'string', enum: E.MATCH_GRADES, clause: 'T-90' },
    deltaE00: { kind: 'scalar', type: 'number', clause: 'T-90' },
    paintedRatio: { kind: 'scalar', type: 'number', min: 0, max: 1, clause: 'T-81' },
    observedHex: { kind: 'scalar', type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/, clause: 'T-81' },
    oklch: { kind: 'array', min: 3, max: 3, item: { kind: 'scalar', type: 'number' }, clause: 'T-81' },
    wcag: WCAG_SHAPE,
    judge: { kind: 'scalar', type: 'string', enum: E.JUDGE, clause: 'T-81' },
    sourceRef: { kind: 'scalar', type: 'string', clause: 'T-84' },
    css: { kind: 'scalar', type: 'string', clause: 'T-11' },
    defaultScheme: { kind: 'scalar', type: 'string', enum: E.DEFAULT_SCHEME, clause: 'T-124' },
    observations: TOKEN_OBSERVATIONS_SHAPE,
    dontId: { kind: 'scalar', type: 'string', pattern: E.DONT_ID_PATTERN, clause: 'T-126' },
  },
};

/**
 * 必产出 token 路径。缺失即阻断（无观测走 T-85 占位，不是省略）。
 * T-46 / T-67
 */
export const REQUIRED_TOKEN_PATHS = [
  'color.primary.$root', 'color.on.primary.$root', 'color.identity.$root',
  'color.text.default.$root', 'color.text.muted.$root', 'color.text.link.$root',
  'color.surface.default.$root', 'color.on.surface.default.$root',
  'color.surface.muted.$root', 'color.on.surface.muted.$root',
  'color.border.default.$root',
  'typography.body', 'typography.heading',
  'shape.radius.control', 'shape.radius.container',
  'component.button-primary',
];

/** resolver.json 形状。T-07 */
export const RESOLVER_SHAPE = {
  kind: 'object', clause: 'T-07', unknown: 'forbid',
  required: ['$schema', 'name', 'version', 'sets', 'modifiers', 'resolutionOrder'],
  fields: {
    $schema: { kind: 'scalar', type: 'string', const: E.SCHEMA_URL_RESOLVER, clause: 'T-04' },
    name: { kind: 'scalar', type: 'string', minLength: 1 },
    version: { kind: 'scalar', type: 'string', const: '2025.10' },
    sets: {
      kind: 'object', unknown: 'forbid', required: ['base'],
      fields: {
        base: {
          kind: 'object', unknown: 'forbid', required: ['sources'],
          fields: { sources: { kind: 'array', min: 1, item: { kind: 'any' } } },
        },
      },
    },
    modifiers: {
      kind: 'object', unknown: 'forbid', required: ['theme'],
      fields: {
        theme: {
          kind: 'object', unknown: 'forbid', required: ['default', 'contexts'],
          fields: {
            default: { kind: 'scalar', type: 'string', enum: E.DEFAULT_SCHEME },
            contexts: {
              kind: 'map', keyEnum: E.DEFAULT_SCHEME,
              value: { kind: 'array', item: { kind: 'any' } },
            },
          },
        },
      },
    },
    resolutionOrder: { kind: 'array', min: 2, item: { kind: 'any' } },
  },
};
