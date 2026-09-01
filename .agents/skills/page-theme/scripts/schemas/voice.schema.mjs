// voice.md 的 front matter 与正文节结构的声明式形状。
// DSL 见 shape-dsl.md。枚举在 enums.mjs。

import * as E from './enums.mjs';

const STR = (clause, extra = {}) => ({ kind: 'scalar', type: 'string', minLength: 1, clause, ...extra });
const STR_ARRAY = (clause) => ({ kind: 'array', clause, item: { kind: 'scalar', type: 'string' } });

/** front matter。V-07 / V-08 */
export const VOICE_FRONT_MATTER_SHAPE = {
  kind: 'object', clause: 'V-08', unknown: 'forbid',
  required: [
    'schema', 'locale', 'register', 'tone_axes', 'brand_self', 'reader', 'audience_noun',
    'primary_cta', 'secondary_cta', 'consult_cta', 'headline_structures', 'slot_caps',
    'locale_pack', 'few_shot_count', 'chrome_upgrades',
  ],
  fields: {
    schema: STR('V-07', { const: E.VOICE_SCHEMA_ID }),
    locale: STR('V-08', { pattern: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/ }),
    register: STR('V-33', { enum: E.VOICE_REGISTER }),
    tone_axes: {
      kind: 'object', clause: 'V-34', unknown: 'forbid', required: ['humor', 'respect', 'enthusiasm'],
      fields: {
        humor: STR('V-34', { enum: E.VOICE_TONE_AXES.humor }),
        respect: STR('V-34', { enum: E.VOICE_TONE_AXES.respect }),
        enthusiasm: STR('V-34', { enum: E.VOICE_TONE_AXES.enthusiasm }),
      },
    },
    brand_self: STR('V-08'),
    reader: STR('V-08', { enum: E.VOICE_READER }),
    audience_noun: STR_ARRAY('V-08'),
    primary_cta: STR_ARRAY('V-28'),
    secondary_cta: STR_ARRAY('V-28'),
    consult_cta: STR_ARRAY('V-57'), // 本图自定意图槽（V-58）
    headline_structures: {
      kind: 'array', clause: 'V-35',
      item: {
        kind: 'object', clause: 'V-43', unknown: 'forbid', required: ['id', 'evidence'],
        fields: {
          id: STR('V-43', { pattern: E.HEADLINE_TYPE_PATTERN }),
          evidence: {
            kind: 'array', clause: 'V-44', min: E.HEADLINE_MIN_EVIDENCE,
            item: {
              kind: 'object', unknown: 'forbid', required: ['text', 'url', 'pageId'],
              fields: { text: STR('V-44'), url: STR('V-44', { pattern: /^https?:\/\/\S+$/ }), pageId: STR('V-44') },
            },
          },
          observed: { kind: 'scalar', type: 'boolean', clause: 'V-42' },
          confidence: STR('V-42', { enum: E.CONFIDENCE }),
        },
      },
    },
    slot_caps: {
      kind: 'map', clause: 'V-32', keyEnum: E.SLOTS,
      value: {
        kind: 'object', clause: 'V-32', unknown: 'forbid', required: ['min', 'typical', 'max'],
        fields: {
          min: { kind: 'scalar', type: 'int', min: 0, clause: 'V-32' },
          typical: { kind: 'scalar', type: 'int', min: 0, clause: 'V-32' },
          max: { kind: 'scalar', type: 'int', min: 0, clause: 'V-32' },
          observed: { kind: 'scalar', type: 'boolean', clause: 'V-32' },
          confidence: STR('V-32', { enum: E.CONFIDENCE }),
        },
      },
    },
    locale_pack: { kind: 'scalar', type: 'string', enum: E.VOICE_LOCALE_PACK, nullable: true, clause: 'V-03' },
    few_shot_count: { kind: 'scalar', type: 'int', min: 0, clause: 'V-08' },
    chrome_upgrades: {
      kind: 'array', clause: 'V-54',
      item: {
        kind: 'object', clause: 'V-54', unknown: 'allow', required: ['slotHint', 'fromChrome', 'ephemeral'],
        fields: {
          slotHint: STR('V-15'),
          fromChrome: STR('V-54'),
          ephemeral: { kind: 'scalar', type: 'boolean', clause: 'V-54' },
          text: { kind: 'scalar', type: 'string', clause: 'V-54' },
        },
      },
    },
  },
};

/** 正文固定 8 节的标题识别。V-09 */
export const VOICE_SECTION_TITLES = {
  '§V0': '一句话本质',
  '§V1': '气质对',
  '§V2': '槽位句式',
  '§V3': '词汇',
  '§V4': "Don't",
  '§V5': '金句',
  '§V6': '情境变调',
  '§V7': '中文专章',
};

/** §V7 必须含的四子节（仅中文站）。V-20 */
export const LOCALE_PACK_SUBSECTIONS = ['punctuation', 'numbers', 'cjk_latin', 'address'];

/** V-48 硬禁占位模式（资产自身与生成页共用）。 */
export const PLACEHOLDER_PATTERNS = [/lorem/i, /ipsum/i, /placeholder/i, /Acme\s+Corp/i];
