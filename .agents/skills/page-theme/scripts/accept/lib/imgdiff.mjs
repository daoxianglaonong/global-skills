// 位图轨（轨 A）与遮罩底座。
// 拆件来源：fidelity-check/scripts/lib/diff.js 的 pixelmatch 调用参数、白底 pad 对齐、
// 8×8 均值池化 SSIM（Q-07 必须复用项）。
// 唯一改动：解码/编码由 pngjs 换成 sharp——合同 §3 只预批了 pixelmatch 与 sharp 两个依赖，
// 不得为 pngjs 再加第六个（合同 §3 末段）。
// 注意：pixelmatch 的 threshold 0.1 / includeAA:false / alpha 0.4 是所复用件的算法参数，
// 沿用原值；它们不是通过线，本文件不产出任何否决判定（Q-13）。

import fs from 'node:fs';
import path from 'node:path';

let _sharp = null;
async function sharpLib() {
  if (_sharp) return _sharp;
  try {
    _sharp = (await import('sharp')).default;
  } catch {
    throw new Error('缺 sharp：请在 scripts/ 下 npm install（依赖由 scripts/package.json 锁定）');
  }
  return _sharp;
}
let _pixelmatch = null;
async function pixelmatchLib() {
  if (_pixelmatch) return _pixelmatch;
  try {
    _pixelmatch = (await import('pixelmatch')).default;
  } catch {
    throw new Error('缺 pixelmatch：请在 scripts/ 下 npm install（依赖由 scripts/package.json 锁定）');
  }
  return _pixelmatch;
}

export async function loadRGBA(file) {
  const sharp = await sharpLib();
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

export async function writePNG(img, file) {
  const sharp = await sharpLib();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .png()
    .toFile(file);
  return file;
}

// 高度不等按白底 pad 对齐（Q-18）：未覆盖区计入 mismatch 是正确的，不得裁短就当对上了。
function padTo(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = new Uint8Array(w * h * 4).fill(0xff);
  for (let y = 0; y < img.height; y++) {
    out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * w * 4);
  }
  return { data: out, width: w, height: h };
}

export function commonCanvas(a, b) {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  return [padTo(a, w, h), padTo(b, w, h), w, h];
}

export function fillRect(img, rect, rgba) {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(img.width, Math.round(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.round(rect.y + rect.h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * img.width + x) * 4;
      img.data[o] = rgba[0];
      img.data[o + 1] = rgba[1];
      img.data[o + 2] = rgba[2];
      img.data[o + 3] = rgba[3] ?? 255;
    }
  }
  return img;
}

// 等体积中性替换的填充色（Q-39）：取遮罩区外圈一圈像素的中位色。
// 取自图像自身而非常量，既满足「中性」（不会自己变成最显眼元素），也不引入本项目自造的色值。
export function ringMedianColor(img, rect) {
  const samples = [[], [], []];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const o = (y * img.width + x) * 4;
    samples[0].push(img.data[o]);
    samples[1].push(img.data[o + 1]);
    samples[2].push(img.data[o + 2]);
  };
  const x0 = Math.round(rect.x);
  const y0 = Math.round(rect.y);
  const x1 = Math.round(rect.x + rect.w);
  const y1 = Math.round(rect.y + rect.h);
  for (let x = x0 - 1; x <= x1; x++) {
    push(x, y0 - 1);
    push(x, y1);
  }
  for (let y = y0 - 1; y <= y1; y++) {
    push(x0 - 1, y);
    push(x1, y);
  }
  const med = (arr) => {
    if (!arr.length) return 128;
    const s = [...arr].sort((a, b) => a - b);
    return s[s.length >> 1];
  };
  return [med(samples[0]), med(samples[1]), med(samples[2]), 255];
}

export async function pixelDiff(imgA, imgB, opts = {}) {
  const pixelmatch = await pixelmatchLib();
  const [a, b, w, h] = commonCanvas(imgA, imgB);
  const diff = new Uint8Array(w * h * 4);
  const diffPixels = pixelmatch(a.data, b.data, diff, w, h, {
    threshold: opts.threshold ?? 0.1,
    includeAA: false,
    alpha: 0.4,
  });
  const total = w * h;
  return { width: w, height: h, diffPixels, mismatch: total ? diffPixels / total : 0, diff: { data: diff, width: w, height: h } };
}

export function ssim(imgA, imgB) {
  const [a, b, w, h] = commonCanvas(imgA, imgB);
  const gray = (img) => {
    const g = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      g[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
    }
    return g;
  };
  const ga = gray(a);
  const gb = gray(b);
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const win = 8;
  let acc = 0;
  let n = 0;
  for (let y = 0; y + win <= h; y += win) {
    for (let x = 0; x + win <= w; x += win) {
      let ma = 0;
      let mb = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const idx = (y + j) * w + (x + i);
          ma += ga[idx];
          mb += gb[idx];
        }
      const cnt = win * win;
      ma /= cnt;
      mb /= cnt;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let j = 0; j < win; j++)
        for (let i = 0; i < win; i++) {
          const idx = (y + j) * w + (x + i);
          va += (ga[idx] - ma) ** 2;
          vb += (gb[idx] - mb) ** 2;
          cov += (ga[idx] - ma) * (gb[idx] - mb);
        }
      va /= cnt;
      vb /= cnt;
      cov /= cnt;
      acc += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      n++;
    }
  }
  return n ? acc / n : 1;
}
