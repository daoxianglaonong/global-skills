// VENDORED-FROM: page-theme-core/src/index.mjs
// VENDORED-BY: node .agents/skills/page-theme-core/sync-vendor.mjs
// DO-NOT-EDIT: 手改副本会被 --check 拦下；改判据请改 core 源再重放

// page-theme-core 的**唯一**公开面。
//
// 三个消费包只准 import 本文件（经各自 `scripts/vendor/page-theme-core/index.mjs`），
// 不得深引 `src/schemas/*.mjs`。深引会让「同一把尺」变成四份可各自漂移的副本，
// 而漂移在颜色判档与 CSS 变量名上是静默的：生成侧算出 `--color-surface-default`、
// 验证侧查 `--color-surface-Default`，两边都不报错，页面直接白底。
//
// 本文件只做 re-export，不含任何判据。新增判据一律落到下面某个模块里。

export {
  tokenPathToCssVar,
  classifyCssVar,
  isColorPrimitiveLeak,
  isUnresolvedVar,
} from './css-var.mjs';

export {
  parseCssColor,
  toHex,
  relativeLuminance,
  contrastRatio,
  srgbToOklch,
  oklchString,
  deltaE00,
  normalizeColorKey,
  gradeColorMatch,
  describeColor,
} from './color.mjs';

export {
  walkTokens,
  resolveAlias,
  isAlias,
  aliasPath,
  isTokenNode,
  kidsOf,
} from './tokens-tree.mjs';

export { buildClosedSet, CLOSED_SET_SCHEMA_VERSION } from './closed-set.mjs';

export {
  paintSequence,
  classifyPaintStep,
  normalizeRhythm,
  PaintError,
} from './paint.mjs';

export { buildFloorIndex, FLOOR_INDEX_SCHEMA_VERSION } from './floor-index.mjs';

export { parseYaml, YamlError } from './yaml.mjs';

export * as ENUMS from './enums.mjs';

export {
  VALUE_SHAPES,
  SCALE_SHAPE,
  MEASURED_SHAPE,
  WCAG_SHAPE,
  TOKEN_OBSERVATIONS_SHAPE,
  EXT_SHAPE,
  REQUIRED_TOKEN_PATHS,
  RESOLVER_SHAPE,
} from './schemas/tokens.schema.mjs';

export { PATTERN_SHAPE, CHROME_SHAPE, GRID_SHAPE, BREAKPOINT_SHAPE } from './schemas/patterns.schema.mjs';

export { INDEX_SHAPE, SEQUENCE_FORBIDDEN_KEYS } from './schemas/index.schema.mjs';

export { CLOSED_SET_SHAPE } from './schemas/closed-set.schema.mjs';

export { FLOOR_INDEX_SHAPE } from './schemas/floor-index.schema.mjs';

export {
  VOICE_FRONT_MATTER_SHAPE,
  VOICE_SECTION_TITLES,
  LOCALE_PACK_SUBSECTIONS,
  PLACEHOLDER_PATTERNS,
} from './schemas/voice.schema.mjs';
