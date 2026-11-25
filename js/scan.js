// バーコード読み取り：ライブ（BarcodeDetector→ZXing）と写真1枚からの読み取り
import { isValidJan } from './calc.js';

const S = { stream: null, timer: null, reader: null, busy: false };

function loadZXing() {
  return new Promise((ok, ng) => {
    if (window.ZXing) return ok();
    const s = document.createElement('script');
    s.src = 'vendor/zxing.min.js';
    s.onload = ok; s.onerror = () => ng(new Error('読み取りライブラリを読み込めませんでした'));
    document.head.appendChild(s);
  });
}
function hints() {
  const h = new Map();
  h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
  h.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return h;
}
const clean = (c) => String(c || '').replace(/\D/g, '');

export const canLive = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export function stopLive(video) {
  clearInterval(S.timer); S.timer = null;
  if (S.reader && S.reader.reset) { try { S.reader.reset(); } catch (e) { /* noop */ } }
  if (S.stream) { S.stream.getTracks().forEach((t) => t.stop()); S.stream = null; }
  if (video) video.srcObject = null;
  S.busy = false;
}

// onCode(code) が true を返したら停止
export async function startLive(video, onCode, onStatus) {
  if (!canLive()) throw new Error('このブラウザではカメラを使えません');
  const found = (raw) => { const c = clean(raw); if (isValidJan(c) && onCode(c)) stopLive(video); };
  if ('BarcodeDetector' in window) {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    video.srcObject = S.stream; await video.play();
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    onStatus && onStatus('バーコードを枠に入れてください');
    S.timer = setInterval(() => {
      if (S.busy || video.readyState < 2) return;
      S.busy = true;
      det.detect(video).then((codes) => { S.busy = false; if (codes && codes.length) found(codes[0].rawValue); }).catch(() => { S.busy = false; });
    }, 200);
    return 'native';
  }
  await loadZXing();
  S.reader = new ZXing.BrowserMultiFormatReader(hints(), 250);
  onStatus && onStatus('バーコードを枠に入れてください');
  await S.reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } }, video, (res) => { if (res) found(res.getText()); });
  S.stream = video.srcObject;
  return 'zxing';
}

// 写真1枚から：縮小→そのまま→90度回転→大きめ の順に試す
export async function decodeFile(file) {
  await loadZXing();
  const url = URL.createObjectURL(file);
  const img = await new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ng(new Error('写真を読み込めませんでした')); i.src = url; });
  URL.revokeObjectURL(url);
  const reader = new ZXing.BrowserMultiFormatReader(hints());
  const tries = [[1600, 0], [1600, 90], [2400, 0], [1000, 0]];
  for (const [max, rot] of tries) {
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas'); c.width = rot ? h : w; c.height = rot ? w : h;
    const ctx = c.getContext('2d');
    if (rot) { ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(img, -w / 2, -h / 2, w, h); } else ctx.drawImage(img, 0, 0, w, h);
    try {
      const res = await reader.decodeFromImageUrl(c.toDataURL('image/jpeg', 0.92));
      const code = clean(res.getText());
      if (isValidJan(code)) return code;
    } catch (e) { /* 次を試す */ }
  }
  return '';
}
