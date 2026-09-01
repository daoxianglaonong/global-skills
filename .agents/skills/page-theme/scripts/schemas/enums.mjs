// 闭集枚举与命名常量。
// 取值一律来自规格条款（条款号见每项注释）；此处不得新增无出处的取值或阈值。

/* ------------------------------------------------------------------ */
/* 通用字段（tokens / patterns / voice 共用）                            */
/* ------------------------------------------------------------------ */

export const CONFIDENCE = ['high', 'medium', 'low']; // T-74
export const SOURCE = ['measured', 'supplied', 'autodetected']; // T-75
export const DEFAULT_SCHEME = ['light', 'dark']; // T-124
export const MATCH_GRADES = ['exact', 'near', 'different']; // T-90
export const JUDGE = ['script', 'llm']; // T-81

/* ------------------------------------------------------------------ */
/* tokens.json                                                         */
/* ------------------------------------------------------------------ */

/** DTCG 保留键；不计入「子 token」判定。T-17 */
export const DTCG_META_KEYS = ['$value', '$type', '$description', '$extensions', '$deprecated', '$schema'];

/** 8 原子类型 + 2 复合类型。T-09 / T-10 */
export const TOKEN_TYPES = [
  'color', 'dimension', 'fontFamily', 'fontWeight', 'duration', 'cubicBezier', 'number', 'shadow',
  'typography', 'border',
];

/** 明令不得采用的类型。T-11 */
export const FORBIDDEN_TOKEN_TYPES = ['transition', 'gradient', 'strokeStyle', 'fontStyle', 'percentage', 'file'];

/** 顶层 group 白名单。T-05；`layout` 明令禁止（T-05 · P-27）。 */
export const TOKENS_TOP_GROUPS = [
  'color', 'dimension', 'fontFamily', 'fontWeight', 'number', 'duration', 'cubicBezier', 'shadow',
  'typography', 'motion', 'elevation', 'shape', 'component',
];
export const TOKENS_TOP_FORBIDDEN = ['layout']; // T-05

export const SCHEMA_URL_FORMAT = 'https://www.designtokens.org/schemas/2025.10/format.json'; // T-04
export const SCHEMA_URL_RESOLVER = 'https://www.designtokens.org/schemas/2025.10/resolver.json'; // T-04

/** 色相族名闭集（本项目自定）。T-36 */
export const COLOR_FAMILIES = [
  'neutral', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'pink', 'brown',
];

/**
 * semantic 角色词表。键 = 角色路径（`color.` 之下），值 = 该角色下允许的子键与产出档。
 * 产出档：must = 必产出（无观测走 T-85）；cond = 条件必产出（不满足则 omit）；opt = 选产出。
 * T-45 / T-46 / T-56
 */
export const COLOR_ROLES = {
  'primary': { keys: { $root: 'must', hover: 'cond' } },
  'identity': { keys: { $root: 'must', hover: 'cond' } },
  'accent': { keys: { $root: 'opt' } },
  'on.primary': { keys: { $root: 'must' } },
  'on.identity': { keys: { $root: 'cond' } },
  'on.accent': { keys: { $root: 'cond' } },
  'text.default': { keys: { $root: 'must' } },
  'text.muted': { keys: { $root: 'must' } },
  'text.link': { keys: { $root: 'must' } },
  'surface.default': { keys: { $root: 'must' } },
  'surface.muted': { keys: { $root: 'must' } },
  'surface.identity': { keys: { $root: 'cond' } },
  'surface.inverse': { keys: { $root: 'cond' } },
  'surface.transparent': { keys: { $root: 'cond' } },
  'on.surface.default': { keys: { $root: 'must' } },
  'on.surface.muted': { keys: { $root: 'must' } },
  'on.surface.identity': { keys: { $root: 'cond' } },
  'on.surface.inverse': { keys: { $root: 'cond' } },
  'on.surface.transparent': { keys: { $root: 'cond' } },
  'border.default': { keys: { $root: 'must' } },
  'border.muted': { keys: { $root: 'opt' } },
  'overlay': { keys: { $root: 'cond' } },
  'focus': { keys: { $root: 'cond' } },
  'success': { keys: { $root: 'cond' } },
  'warning': { keys: { $root: 'cond' } },
  'danger': { keys: { $root: 'cond' } },
  'info': { keys: { $root: 'cond' } },
  'on.success': { keys: { $root: 'cond' } },
  'on.warning': { keys: { $root: 'cond' } },
  'on.danger': { keys: { $root: 'cond' } },
  'on.info': { keys: { $root: 'cond' } },
  'transparent': { keys: { $root: 'cond' }, bareLeafAllowed: true }, // T-37 步骤 5：独立，不进阶
};

/** 条件必产出角色：无观测必须 omit，不得占位造值。T-53 / T-54 / T-56 / T-57 */
export const COND_ROLES_MUST_OMIT = [
  'focus', 'primary.hover', 'identity.hover',
  'success', 'warning', 'danger', 'info',
  'surface.identity', 'surface.inverse', 'surface.transparent',
];

/** semantic 非色域角色。T-46 */
export const TYPOGRAPHY_ROLES = ['body', 'heading', 'label', 'display', 'caption'];
export const TYPOGRAPHY_REQUIRED = ['body', 'heading'];
export const SHAPE_RADIUS_ROLES = ['control', 'container']; // T-46：即使同值也要两条

/** component 并列 kebab 三段闭集。T-65 */
export const COMPONENT_ELEMENTS = [
  'button', 'link', 'input', 'textarea', 'select', 'checkbox', 'radio',
  'card', 'badge', 'chip', 'nav', 'tab', 'tooltip', 'modal',
];
export const COMPONENT_VARIANTS = [
  'primary', 'secondary', 'ghost', 'outline', 'destructive', 'link',
  'outlined', 'filled', 'lifted', 'glass',
];
export const COMPONENT_STATES = ['hover', 'active', 'focus', 'disabled', 'loading']; // T-65

/** component 属性名闭集（camelCase；禁 bg / fg / radius 别名）。T-66 */
export const COMPONENT_PROPS = [
  'backgroundColor', 'textColor', 'borderColor', 'typography', 'rounded',
  'padding', 'height', 'width', 'size', 'border',
];
export const COMPONENT_PROPS_REQUIRED = ['backgroundColor', 'textColor', 'rounded']; // T-66
export const COMPONENT_COLOR_PROPS = ['backgroundColor', 'textColor', 'borderColor']; // T-20
export const COMPONENT_MIN_FLOOR = ['button-primary']; // T-67

/** `$extensions["page-theme"]` 已定义字段。T-73–T-81 / T-124–T-126 */
export const EXT_FIELDS = [
  'observed', 'confidence', 'source', 'lossy', 'merged', 'unmapped', 'measured', 'scale',
  'officialName', 'suppliedValue', 'suppliedPath', 'conflict', 'match', 'deltaE00',
  'paintedRatio', 'observedHex', 'oklch', 'wcag', 'judge', 'sourceRef', 'css',
  'defaultScheme', 'observations', 'dontId',
];
export const EXT_NAMESPACE = 'page-theme'; // T-18
export const SCALE_MODES = ['declared', 'ordinal']; // T-79
export const SCALE_MEASURES = ['oklch-l', 'px']; // T-79
export const DONT_ID_PATTERN = /^design-dont-[a-z0-9][a-z0-9-]*$/; // T-126

/* ------------------------------------------------------------------ */
/* patterns/                                                           */
/* ------------------------------------------------------------------ */

/** L0 角色轴闭集。P-04 */
export const FLOOR_ROLES = ['chrome', 'section', 'overlay'];

/** L1 通用层 26 条 → 默认角色。P-05 */
export const TAXONOMY_L1 = {
  navbar: ['chrome'], announcement: ['chrome'], 'floor-nav': ['chrome'], 'float-widget': ['chrome'],
  'cookie-consent': ['overlay'],
  hero: ['section'], 'page-header': ['section'], feature: ['section'], content: ['section'],
  stats: ['section'], 'logo-cloud': ['section'], testimonial: ['section'], 'case-study': ['section'],
  gallery: ['section'], pricing: ['section'], comparison: ['section'], cta: ['section'],
  newsletter: ['section'], faq: ['section'], team: ['section'], blog: ['section'],
  contact: ['section'], timeline: ['section'], career: ['section'], event: ['section'],
  footer: ['section'], // P-62：并入 chrome.yaml 只改文件布局，role 不变
};

/** L2 中文扩充 3 条。P-07 */
export const TAXONOMY_L2 = {
  credentials: ['section'],
  'qr-lead': ['section', 'overlay'],
  'legal-bar': ['chrome'],
};

/** L3 电商 8 条（附录 A，显式启用）。P-01 附录 A */
export const TAXONOMY_L3 = {
  'product-list': ['section'], 'category-preview': ['section'], 'product-overview': ['section'],
  promo: ['section'], review: ['section'], filter: ['chrome', 'overlay'],
  cart: ['overlay', 'section'], checkout: ['section'],
};

export const TAXONOMY_LAYERS = ['L1', 'L2', 'L3']; // P-20
export const TAXONOMY_FALLBACK = 'content'; // P-09

/** 槽位闭集 36 条（正文）。P-31 */
export const SLOTS = [
  'eyebrow', 'heading', 'subcopy', 'body', 'primary_cta', 'secondary_cta', 'media', 'logo',
  'item_icon', 'item_title', 'item_body', 'quote', 'attribution', 'avatar', 'stat_value',
  'stat_label', 'price', 'price_period', 'feature_list', 'form', 'input', 'faq_q', 'faq_a',
  'nav_item', 'social', 'legal', 'beian', 'phone', 'map', 'qr', 'channel_label', 'certificate',
  'badge', 'tab', 'step_label', 'date',
];
/** L3 槽位 3 条（附录 A）。P-31 附录 A */
export const SLOTS_L3 = ['sku_title', 'sku_price', 'sku_media'];

export const VARIANT_LAYOUTS = [
  'stacked', 'centered', 'split', 'grid', 'bento', 'off-grid', 'overlay',
  'slider', 'marquee', 'tabs', 'accordion', 'stepper', 'list',
]; // P-30
export const VARIANT_MEDIA_POSITIONS = ['none', 'left', 'right', 'top', 'bottom', 'background', 'start', 'end']; // P-30
export const VARIANT_ALIGNS = ['start', 'center', 'end', 'justified']; // P-30
export const VARIANT_CARDS = ['none', 'outlined', 'filled', 'lifted', 'glass']; // P-30
/** layout → PC 基准视觉列数硬约束。P-30 */
export const VARIANT_COLUMNS_FIXED = { split: 2, stacked: 1, centered: 1 };

export const CONTAINER_MODES = ['full-bleed', 'contained', 'breakout']; // P-52
export const DENSITY = ['compact', 'default', 'spacious']; // P-50
export const CONTENT_MAX = ['prose-narrow', 'prose', 'prose-wide', 'full']; // P-28（本项目自定）
export const CONTENT_COUNT_UNITS = ['item', 'plan', 'quote', 'logo', 'stat', 'slide', 'certificate']; // P-34
export const CONTENT_COUNT_UNITS_L3 = ['sku']; // P-34 附录 A

export const RHYTHM_SURFACES = ['default', 'muted', 'identity', 'inverse', 'image', 'transparent']; // P-45 · T-23
export const RHYTHM_SURFACES_SKIPPED = ['transparent', 'image']; // P-47：硬跳过，不占交替计数
export const RHYTHM_SCHEMES = ['alternate-muted', 'alternate-identity', 'stripe-3', 'monotone', 'custom']; // P-46
export const RHYTHM_ALTERNATE = ['prefer-contrast-with-prev', 'keep', 'always-muted']; // P-48
export const RHYTHM_SKIP_ROLES_MIN = ['chrome', 'overlay']; // P-47

export const BREAKPOINTS = ['pc', 'tablet', 'mobile']; // P-37
export const STACK_BELOW = ['pc', 'tablet', 'mobile', 'never']; // P-44
export const OVERLAY_STRATEGY = ['stack', 'keep', 'hide']; // P-44

/** `index.yaml` 顶层 `chrome` 挂载位闭集（挂载位闭集 ≠ taxonomy 闭集）。P-25 */
export const CHROME_MOUNTS = {
  navbar: 'navbar',
  footer: 'footer',
  float_widget: 'float-widget',
  legal_bar: 'legal-bar',
  breadcrumb: null, // P-61：挂载位保留，无 L1 词条
  announcement: 'announcement',
  floor_nav: 'floor-nav',
  cookie_consent: 'cookie-consent',
};

export const SKELETON_ID_PATTERN = /^sk-[a-z0-9][a-z0-9-]*$/; // P-27a

/* ------------------------------------------------------------------ */
/* voice.md                                                            */
/* ------------------------------------------------------------------ */

export const VOICE_SCHEMA_ID = 'page-theme-voice/v1'; // V-07
export const VOICE_REGISTER = ['formal', 'semi-formal', 'casual']; // V-33
export const VOICE_TONE_AXES = {
  humor: ['serious', 'mixed', 'funny'],
  respect: ['respectful', 'mixed', 'irreverent'],
  enthusiasm: ['matter-of-fact', 'moderate', 'enthusiastic'],
}; // V-34
export const VOICE_READER = ['你', '您', '混合']; // V-08
export const VOICE_LOCALE_PACK = ['zh-CN']; // V-02 / V-03（否则必须 null）
export const HEADLINE_TYPE_PATTERN = /^S_custom_[a-z0-9_]+$/; // V-43
export const HEADLINE_MIN_EVIDENCE = 2; // V-44：每型 ≥2 条实测原句
export const FEW_SHOT_MAX_CODEPOINTS = 80; // V-77（本项目自定）
export const VOICE_SECTIONS = ['§V0', '§V1', '§V2', '§V3', '§V4', '§V5', '§V6']; // V-09
export const VOICE_SECTION_ZH = '§V7'; // V-09 / V-03：仅中文站
export const VOICE_DONT_ID_PATTERN = /^voice-dont-\d{2,}$/; // V-17

/** 现场自造前缀禁令。P-10 / V-43 */
export const FORBIDDEN_KEY_PREFIX = /^x-/;
