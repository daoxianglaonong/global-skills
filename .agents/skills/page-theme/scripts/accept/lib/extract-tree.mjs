// 轨 B 取值器。拆件来源：fidelity-audit/scripts/extract-tree.js（Q-07 必须复用项）。
// 相对本仓原件的改动：ESM 化、加 data-pattern / data-pt-widget / landmark 三个对账必需属性、
// 加 sticky 与 position 读取（Q-12 chrome 几何）。塌缩规则与相对坐标口径原样保留——
// 绝对 y 在两个不同文档间不可比，这是原件的铁律，跨源对账同样成立。

export const EXTRACT_TREE_SRC = String.raw`
function __ptExtractTree(rootSelector) {
  var STYLE_KEYS = [
    'display', 'position', 'flexDirection', 'justifyContent', 'alignItems', 'gap',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopLeftRadius', 'borderTopWidth', 'borderTopColor', 'borderBottomWidth',
    'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'fontFamily',
    'color', 'backgroundColor', 'backgroundImage', 'boxShadow',
    'opacity', 'zIndex', 'overflow', 'transitionDuration', 'transitionTimingFunction'
  ];
  var round1 = function (n) { return Math.round(n * 10) / 10; };

  function ownText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) t += n.textContent;
    }
    return t.replace(/\s+/g, ' ').trim();
  }
  function pickStyles(cs) {
    var out = {};
    for (var i = 0; i < STYLE_KEYS.length; i++) out[STYLE_KEYS[i]] = cs[STYLE_KEYS[i]];
    return out;
  }
  function hasOwnVisual(cs) {
    var noBg = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    var noBorder = parseFloat(cs.borderTopWidth) === 0;
    return !(noBg && noBorder && cs.backgroundImage === 'none' && cs.boxShadow === 'none' &&
      cs.overflow === 'visible' && parseFloat(cs.opacity) === 1);
  }
  function kidsOf(el) {
    return Array.prototype.filter.call(el.children, function (c) {
      return ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].indexOf(c.tagName) < 0;
    });
  }
  function landmarkOf(el) {
    var tag = el.tagName.toLowerCase();
    var role = (el.getAttribute('role') || '').toLowerCase();
    if (tag === 'header' || role === 'banner') return 'header';
    if (tag === 'footer' || role === 'contentinfo') return 'footer';
    if (tag === 'nav' || role === 'navigation') return 'nav';
    if (tag === 'main' || role === 'main') return 'main';
    return null;
  }

  function build(el, originRect) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    var kids = kidsOf(el);
    var text = ownText(el);
    var slotMark = el.getAttribute('data-pt-tgt') || el.getAttribute('data-slot');
    var marks = el.getAttribute('data-pattern') || el.getAttribute('data-pt-widget') || slotMark || landmarkOf(el);
    if (kids.length === 1 && !text && !marks && !hasOwnVisual(cs)) {
      var hoisted = build(kids[0], originRect);
      if (!hoisted) return null;
      var c0 = (el.getAttribute('class') || '').split(' ')[0];
      hoisted.collapsed = [el.tagName.toLowerCase() + (c0 ? '.' + c0 : '')].concat(hoisted.collapsed || []);
      return hoisted;
    }
    var r = el.getBoundingClientRect();
    var node = {
      tag: el.tagName.toLowerCase(),
      text: text || undefined,
      pattern: el.getAttribute('data-pattern') || undefined,
      slot: slotMark || undefined, // P-31 槽名标记，Q-16 的 slots 对账要用
      widget: el.getAttribute('data-pt-widget') || undefined,
      landmark: landmarkOf(el) || undefined,
      sticky: cs.position === 'sticky' || cs.position === 'fixed' ? cs.position : undefined,
      img: el.tagName === 'IMG' || el.tagName === 'SVG' || (cs.backgroundImage && cs.backgroundImage !== 'none') || undefined,
      rect: { x: round1(r.left - originRect.left), y: round1(r.top - originRect.top), w: round1(r.width), h: round1(r.height) },
      styles: pickStyles(cs),
      children: []
    };
    for (var i = 0; i < kids.length; i++) {
      var child = build(kids[i], r);
      if (child) node.children.push(child);
    }
    if (!node.children.length) delete node.children;
    return node;
  }

  var root = document.querySelector(rootSelector || 'body');
  if (!root) return { error: 'selector not found: ' + rootSelector };
  var rr = root.getBoundingClientRect();
  var tree = build(root, { left: rr.left, top: rr.top });
  if (tree) {
    tree.origin = { left: round1(rr.left + scrollX), top: round1(rr.top + scrollY) };
    tree.viewport = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  }
  return tree;
}
`;

// 展平成绝对坐标（相对根）。来源同上：pair-derive.js 的 flatten，仅内部量差用。
export function flatten(tree) {
  const nodes = [];
  (function walk(n, parent, ax, ay) {
    if (!n || !n.rect) return;
    const abs = { x: ax + n.rect.x, y: ay + n.rect.y, w: n.rect.w, h: n.rect.h };
    const node = { src: n, parent, abs, text: (n.text || '').trim(), styles: n.styles || {}, tag: n.tag, children: [] };
    if (parent) parent.children.push(node);
    nodes.push(node);
    for (const c of n.children || []) walk(c, node, abs.x, abs.y);
  })(tree, null, 0, 0);
  return nodes;
}

// 面积权重：节点自身面积占根面积的比。近似量，只用于排序与「与资产已收录最小面积比」的
// 相对比较；绝不当 paintedRatio 直接写进报告（真 paintedRatio 归采集侧 raw）。
export function areaWeights(nodes) {
  const root = nodes[0];
  const total = root ? Math.max(1, root.abs.w * root.abs.h) : 1;
  const byColor = new Map();
  const byFont = new Map();
  const bump = (map, key, v) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + v);
  };
  for (const n of nodes) {
    const a = Math.max(0, n.abs.w) * Math.max(0, n.abs.h);
    if (!a) continue;
    const bg = n.styles.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') bump(byColor, bg, a / total);
    if (n.text) {
      // 文本色与字体按文本盒面积记，避免容器继承值把一个未上屏的色顶成高频
      bump(byColor, n.styles.color, a / total);
      bump(byFont, n.styles.fontFamily, a / total);
    }
  }
  return { byColor, byFont };
}

// 派生几何（pair-derive 精简版）：容器内缩 + 行间垂直 gap。
// 只用 rect 减法量，NEVER 读 padding / gap 声明——这是原件的铁律，跨源同样成立。
export function derivedGeometry(node) {
  const kids = node.children.filter((c) => c.abs.w > 0 && c.abs.h > 0);
  if (!kids.length) return null;
  const inset = {
    top: round1(Math.min(...kids.map((k) => k.abs.y)) - node.abs.y),
    left: round1(Math.min(...kids.map((k) => k.abs.x)) - node.abs.x),
    right: round1(node.abs.x + node.abs.w - Math.max(...kids.map((k) => k.abs.x + k.abs.w))),
    bottom: round1(node.abs.y + node.abs.h - Math.max(...kids.map((k) => k.abs.y + k.abs.h))),
  };
  const rows = [];
  for (const c of kids) {
    const row = rows.find((r) =>
      r.some((x) => Math.min(x.abs.y + x.abs.h, c.abs.y + c.abs.h) - Math.max(x.abs.y, c.abs.y) > 0),
    );
    if (row) row.push(c);
    else rows.push([c]);
  }
  rows.sort((a, b) => a[0].abs.y - b[0].abs.y);
  const rowSizes = rows.map((r) => r.length);
  const contentExtent = {
    left: Math.min(...kids.map((k) => k.abs.x)),
    right: Math.max(...kids.map((k) => k.abs.x + k.abs.w)),
  };
  const rowGaps = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i].reduce((m, x) => Math.max(m, x.abs.y + x.abs.h), -Infinity);
    const b = Math.min(...rows[i + 1].map((x) => x.abs.y));
    rowGaps.push(round1(b - a));
  }
  return { inset, rowGaps, rows: rows.length, rowSizes, contentWidth: round1(contentExtent.right - contentExtent.left) };
}

const round1 = (n) => Math.round(n * 10) / 10;
