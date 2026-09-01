// 确定性随机：材料顺序必须可复现（种子写进 manifest），否则事后无法复核裁判看到的是什么次序。
import crypto from 'node:crypto';

export function makeRng(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  let i = 0;
  return function next() {
    if (i >= h.length - 4) {
      h = crypto.createHash('sha256').update(h).digest();
      i = 0;
    }
    const v = h.readUInt32BE(i);
    i += 4;
    return v / 0x100000000;
  };
}

export function shuffle(arr, seed) {
  const rng = makeRng(seed);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const itemId = (file, seed) =>
  crypto.createHash('sha1').update(`${seed}|${file}`).digest('hex').slice(0, 8);
