// 资产文件 → 形状/解析方式的登记表。validate-asset.mjs 只认本表，不硬编码路径。
// 形状 DSL 见 shape-dsl.md。

import { INDEX_SHAPE, PATTERN_SHAPE, CHROME_SHAPE, SEQUENCE_FORBIDDEN_KEYS } from './patterns.schema.mjs';
import { VOICE_FRONT_MATTER_SHAPE, VOICE_SECTION_TITLES, LOCALE_PACK_SUBSECTIONS, PLACEHOLDER_PATTERNS } from './voice.schema.mjs';
import {
  VALUE_SHAPES, EXT_SHAPE, SCALE_SHAPE, RESOLVER_SHAPE, REQUIRED_TOKEN_PATHS,
} from './tokens.schema.mjs';
import { tokenPathToCssVar, classifyCssVar, isColorPrimitiveLeak, isUnresolvedVar } from './css-var.mjs';
import * as ENUMS from './enums.mjs';

/**
 * 资产文件登记表（总纲 §4 的机检投影）。
 * presence：`required` 缺失即阻断；`conditional` 由规则表判定；`advisory` 缺失只报警。
 * format：`json` \| `yaml` \| `markdown`（front matter + 节）\| `text`（只作交叉引用不校形状）。
 * owner：定义章，进报错行。
 */
export const ASSET_FILES = [
  { path: 'tokens.json', format: 'json', presence: 'required', owner: 'ch02', clause: 'T-01' },
  { path: 'tokens.dark.json', format: 'json', presence: 'conditional', owner: 'ch02', clause: 'T-02' },
  { path: 'resolver.json', format: 'json', presence: 'conditional', owner: 'ch02', clause: 'T-03', shape: RESOLVER_SHAPE },
  { path: 'patterns/index.yaml', format: 'yaml', presence: 'required', owner: 'ch03', clause: 'P-14', shape: INDEX_SHAPE },
  { path: 'patterns/chrome.yaml', format: 'yaml', presence: 'required', owner: 'ch03', clause: 'P-16', shape: CHROME_SHAPE },
  { path: 'voice.md', format: 'markdown', presence: 'required', owner: 'ch04', clause: 'V-01', shape: VOICE_FRONT_MATTER_SHAPE },
  { path: 'DESIGN.md', format: 'text', presence: 'required', owner: 'ch07', clause: '总纲 §4' },
  { path: 'README.md', format: 'text', presence: 'required', owner: 'ch07', clause: '总纲 §4' },
  { path: 'run-meta.json', format: 'json', presence: 'advisory', owner: 'ch06', clause: '总纲 §4' },
  { path: 'screenshots/index.json', format: 'json', presence: 'advisory', owner: 'ch05', clause: '总纲 §4' },
  { path: 'screenshots/.gitignore', format: 'text', presence: 'advisory', owner: 'ch05', clause: '总纲 §4' },
  { path: 'raw/.gitignore', format: 'text', presence: 'advisory', owner: 'ch05', clause: '总纲 §4' },
];

/** `patterns/` 下允许的路径形态；第五种即阻断。P-14 */
export const PATTERNS_ALLOWED = [
  { re: /^index\.yaml$/, kind: 'index' },
  { re: /^chrome\.yaml$/, kind: 'chrome' },
  { re: /^[^/]+\.notes\.md$/, kind: 'notes' },
  { re: /^[^/]+\.yaml$/, kind: 'pattern' },
];

export {
  INDEX_SHAPE, PATTERN_SHAPE, CHROME_SHAPE, SEQUENCE_FORBIDDEN_KEYS,
  VOICE_FRONT_MATTER_SHAPE, VOICE_SECTION_TITLES, LOCALE_PACK_SUBSECTIONS, PLACEHOLDER_PATTERNS,
  VALUE_SHAPES, EXT_SHAPE, SCALE_SHAPE, RESOLVER_SHAPE, REQUIRED_TOKEN_PATHS,
  tokenPathToCssVar, classifyCssVar, isColorPrimitiveLeak, isUnresolvedVar,
  ENUMS,
};
