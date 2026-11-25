// AI アダプタ：どこで動いていても同じ関数で呼べるようにする
// 呼び出し順（上から順に試し、失敗や枠切れなら次へ）
//  1) ユーザー自身の Gemini 無料キー（Flash-Lite → 枠切れなら Flash）※ブラウザから直接
//  2) ユーザー自身の Groq 無料キー（予備）
//  3) claude.ai のアーティファクト内（プレビュー）→ window.claude.use('sample')
//  4) 本番（Vercel）→ /api/ai（サーバー側が有料のClaudeを呼ぶ。キーはサーバーだけが持つ）
//  ?mock=1 → 固定の応答（動作確認用）
// 最後に使った経路は lastRoute に入る（画面表示用）。
// 戻り値はすべて JSON。失敗は Error を投げる。

const PROMPTS = {
  identify: `あなたは日本のせどり（転売）リサーチの専門家です。商品写真から商品を特定してください。
JSONだけを返してください（前後に文章を付けない）:
{"name":"商品名（メーカー・シリーズ・型番まで）","model":"型番","jan":"JANが写っていれば13桁、なければ空","category":"カテゴリ","condition":"新品/中古/不明","keywords":["検索に使う短いキーワード1","2"],"notes":"せどり目線の注意点（偽物・規制・付属品・版違いなど）","confidence":0.0}
不明な項目は空文字にする。推測した型番には末尾に「?」を付ける。`,
  shelf: `あなたは日本のせどり（店舗仕入れ）の専門家です。画像は店頭で撮った「商品と値札」です。商品の特定と、値札の価格を同時に読み取ってください。
JSONだけを返してください（前後に文章を付けない）:
{"name":"商品名（メーカー・シリーズ・型番まで）","model":"型番","jan":"JANが写っていれば13桁、なければ空","category":"カテゴリ（家電/おもちゃ/ゲーム/本/衣類/美容/日用品/食品/工具/その他）","condition":"新品/中古/不明","price":値札の税込価格の数値（読めなければ0）,"priceNote":"値札の補足（税抜表記・割引・セール・まとめ価格など）","store":"写っていれば店名","notes":"せどり目線の注意点（付属品・状態・規制・偽物）","confidence":0.0}
税抜と書いてあれば税込に直して price に入れ、priceNote にその旨を書く。`,
  markdown_price: `画像は値下げ・セールの値札やPOPです。元値・値引後の価格・条件（期間・会員・まとめ買い）をJSONだけで: {"price":数値,"original":数値,"cond":"条件","note":"補足"}`,
  repricing: `あなたは慎重なせどりアドバイザーです。売れ残っている在庫について、値下げ・販路変更・損切りのどれが良いかを日本語で3文以内で提案し、具体的な提案価格を1つ示してください。数字は与えられたものから計算し、損切りライン（実質仕入値）を下回る提案は「損切り」と明記する。`,
  read_market: `画像はフリマ・オークション・SNSのスクリーンショットです。売れた実績を読み取ってください。
JSONだけを返してください:
{"source":"メルカリ/ヤフオク/ラクマ/Amazon/X/Instagram/その他","prices":[売れた価格の数値...],"median":中央値の数値,"soldCount":読み取れた売れた件数,"period":"読み取れる期間の目安","demand":"高/中/低","notes":"相場の傾向・状態差・注意点を2文以内"}
価格は「SOLD」「売り切れ」「落札」など売れたものだけ。出品中は除く。`,
  explain: `あなたは慎重なせどりアドバイザーです。以下の判定結果について、買うべきか・見送るべきかの理由を日本語で3文以内で説明し、最後に注意点を1文で添えてください。断定を避け、根拠（回転・利益率・規制・偽物・季節・競合）を具体的に。数字は与えられたものだけを使い、新しい数字を作らない。`,
  listing: `メルカリ向けの出品タイトル（40字以内）と説明文（300字以内）を日本語で作ってください。誇張や断定（「必ず」「最安」）は使わず、状態・付属品・サイズ・注意事項を含める。JSONだけ: {"title":"...","body":"..."}`,
};

function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AIの応答を読み取れませんでした');
  return JSON.parse(m[0]);
}

// data:URL → Blob（fetch(data:) はiOS Safariや一部のサンドボックスで "Load failed" になるため手動変換）
function dataUrlToBlob(u) {
  const m = String(u).match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) throw new Error('画像の形式を読めませんでした');
  const bin = atob(m[2]), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}
export const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
export const GROQ_MODEL = 'qwen/qwen3.6-27b';
export let lastRoute = '';
export let lastSkipped = []; // 今回、失敗して飛ばした経路と理由

function splitDataUrl(u) {
  const m = String(u || '').match(/^data:([^;,]+);base64,(.*)$/);
  return m ? { mime: m[1], b64: m[2] } : null;
}
class QuotaError extends Error { constructor(msg) { super(msg); this.quota = true; } }

async function viaGemini(task, { text, imageDataUrl }, key) {
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    const parts = [];
    const img = splitDataUrl(imageDataUrl);
    if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
    parts.push({ text: (PROMPTS[task] || '') + '\n\n' + (text || '') });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 1024, temperature: 0.2 } }),
    });
    if (r.status === 429) { lastErr = new QuotaError(`Gemini ${model} の無料枠を使い切りました（日本時間17時にリセット）`); continue; }
    if (r.status === 404) { lastErr = new Error(`Gemini のモデル ${model} が見つかりません（名前が変わった可能性）`); continue; }
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      let m = ''; try { const j = await r.json(); m = (j.error && j.error.message) || ''; } catch (e) { /* noop */ }
      throw new Error(/API key|API_KEY/i.test(m) ? 'APIキーが無効です（AI Studioの「APIキーを作成」で作ったキーか確認。先頭は AIza… が一般的）' : 'Gemini エラー ' + r.status + ': ' + m.slice(0, 120));
    }
    if (!r.ok) { let m = 'Gemini エラー ' + r.status; try { const j = await r.json(); if (j.error && j.error.message) m += ': ' + j.error.message.slice(0, 120); } catch (e) { /* noop */ } throw new Error(m); }
    const j = await r.json();
    const out = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    lastRoute = 'Gemini ' + model;
    return out.map((p) => p.text || '').join('');
  }
  throw lastErr || new Error('Gemini を呼べませんでした');
}

async function viaGroq(task, { text, imageDataUrl }, key, model) {
  const content = [];
  const img = splitDataUrl(imageDataUrl);
  if (img) content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  content.push({ type: 'text', text: (PROMPTS[task] || '') + '\n\n' + (text || '') });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model: model || GROQ_MODEL, max_tokens: 1024, temperature: 0.2, messages: [{ role: 'user', content }] }),
  });
  if (r.status === 429) throw new QuotaError('Groq の無料枠を使い切りました');
  if (!r.ok) { let m = 'Groq エラー ' + r.status; try { const j = await r.json(); if (j.error && j.error.message) m += ': ' + j.error.message.slice(0, 120); } catch (e) { /* noop */ } throw new Error(m); }
  const j = await r.json();
  lastRoute = 'Groq';
  return (((j.choices || [])[0] || {}).message || {}).content || '';
}

let sampleNs = null;
async function viaArtifact(task, { text, imageDataUrl }) {
  if (!sampleNs) sampleNs = await window.claude.use('sample');
  if (!sampleNs) throw new Error('このページではAIを使えません（権限なし）');
  const opts = { modelTier: imageDataUrl ? 'default' : 'quick' };
  if (imageDataUrl) {
    const lim = await sampleNs.limits().catch(() => ({}));
    if (!lim || !lim.images) throw new Error('このページでは画像をAIに渡せません');
    opts.images = [dataUrlToBlob(imageDataUrl)];
  }
  const res = await sampleNs((PROMPTS[task] || '') + '\n\n' + (text || ''), opts);
  lastRoute = 'ページ内のClaude';
  return typeof res === 'string' ? res : (res.text || '');
}

async function viaRelay(task, { text, imageDataUrl }, endpoint, settings) {
  const headers = { 'Content-Type': 'application/json' };
  if (settings && settings.geminiKey) headers['x-gemini-key'] = settings.geminiKey;
  const r = await fetch(endpoint || '/api/ai', { method: 'POST', headers, body: JSON.stringify({ task, text: (PROMPTS[task] || '') + '\n\n' + (text || ''), image: imageDataUrl }) });
  if (!r.ok) {
    let msg = 'AI中継エラー ' + r.status;
    try { const j = await r.json(); if (j.error) msg += ': ' + j.error; } catch (e) { /* noop */ }
    throw new Error(msg);
  }
  const j = await r.json();
  lastRoute = '中継サーバー';
  return j.text;
}

function mock(task) {
  const m = {
    shelf: { name: 'サンプル加湿器 ハイブリッド式 HD-RX100', model: 'HD-RX100', jan: '', category: '家電', condition: '中古', price: 4980, priceNote: '税込表記', store: 'セカンドストリート', notes: '付属フィルターの有無を確認', confidence: 0.8 },
    repricing: '仕入れから35日で相場より8%高い設定なので、まず9,800円へ値下げして1週間様子を見るのが良いです。それでも動かなければヤフオクで即決8,500円に販路変更。損切りラインは実質仕入値6,980円です。',
    identify: { name: 'サンプル加湿器 ハイブリッド式 HD-RX100', model: 'HD-RX100', jan: '4901234567894', category: '生活家電', condition: '不明', keywords: ['HD-RX100', 'サンプル 加湿器'], notes: '型番は箱の表記から。付属フィルターの有無を確認', confidence: 0.8 },
    read_market: { source: 'メルカリ', prices: [9800, 11000, 10500, 12800, 9500], median: 10500, soldCount: 5, period: '直近1か月', demand: '中', notes: '未使用品は12,000円前後、使用済みは9,500〜10,500円。箱なしは安い' },
    explain: '利益率25%で基準を満たし、月販10件なら2週間以内に売れる見込みです。中古は状態差で相場が2,000円ほど動くので、付属品とフィルターの有無を確認してから仕入れてください。注意：同型の新モデルが出ると相場が下がります。',
    listing: { title: 'サンプル加湿器 ハイブリッド式 HD-RX100 動作確認済', body: '動作確認済みのハイブリッド式加湿器です。付属品：本体、電源コード、取扱説明書。使用に伴う小傷があります。写真でご確認ください。発送は宅急便80サイズ、簡易梱包です。' },
  };
  return new Promise((ok) => setTimeout(() => ok(typeof m[task] === 'string' ? m[task] : JSON.stringify(m[task])), 600));
}

// 使える経路を順番に返す（表示用にも使う）
export function aiRoutes(settings) {
  const s = settings || {};
  if (new URLSearchParams(location.search).get('mock') === '1') return ['mock'];
  const r = [];
  if (s.geminiKey) r.push('gemini');
  if (s.groqKey) r.push('groq');
  if (window.claude && typeof window.claude.use === 'function') r.push('artifact');
  else r.push('relay');
  return r;
}
export function aiMode(settings) { return aiRoutes(settings)[0]; }
export const ROUTE_LABEL = { mock: 'テスト応答', gemini: 'Gemini無料枠（自分のキー）', groq: 'Groq無料枠（自分のキー）', artifact: 'ページ内のClaude', relay: '中継サーバー（有料）' };

export async function ask(task, payload, settings) {
  const s = settings || {};
  const errs = [];
  lastSkipped = errs;
  for (const route of aiRoutes(s)) {
    try {
      let text;
      if (route === 'mock') text = await mock(task);
      else if (route === 'gemini') text = await viaGemini(task, payload, s.geminiKey);
      else if (route === 'groq') text = await viaGroq(task, payload, s.groqKey, s.groqModel);
      else if (route === 'artifact') text = await viaArtifact(task, payload);
      else text = await viaRelay(task, payload, s.aiEndpoint, s);
      return (task === 'explain' || task === 'repricing') ? String(text).trim() : parseJson(text);
    } catch (e) {
      errs.push((ROUTE_LABEL[route] || route) + '：' + (e && e.message || e));
      // 枠切れ・通信エラー・解析失敗はすべて次の経路へ
    }
  }
  throw new Error(errs.join(' ／ '));
}

// 画像を縮小して dataURL にする（通信量とAIコストを抑える）
export function shrinkImage(file, max = 1280, quality = 0.85) {
  return new Promise((ok, ng) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => ng(new Error('画像を読み込めませんでした'));
    img.src = url;
  });
}
