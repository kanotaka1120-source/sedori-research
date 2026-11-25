// Vercel サーバーレス関数：AI中継。Claude APIキーはここ（環境変数 ANTHROPIC_API_KEY）だけが持つ。
// v1 は自分専用：環境変数 APP_TOKEN を設定した場合、ヘッダー x-app-token が一致しないと拒否する。
// v2 以降は Supabase の JWT を検証して user_id ごとに利用量を記録する（TODO 箇所）。
export const config = { runtime: 'edge' };

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-5';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (process.env.APP_TOKEN && req.headers.get('x-app-token') !== process.env.APP_TOKEN) return json({ error: 'unauthorized' }, 401);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: 'ANTHROPIC_API_KEY が未設定' }, 500);
  let body;
  try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
  const { task, text, image } = body || {};
  if (!task) return json({ error: 'task required' }, 400);
  // ユーザー自身の無料キーがヘッダーで来ていれば先に使う（サーバーのClaudeは最後の手段）
  const userGemini = req.headers.get('x-gemini-key');
  if (userGemini) {
    const g = await tryGemini(userGemini, text, image).catch(() => null);
    if (g) return json({ text: g, route: 'gemini' });
  }
  const content = [];
  if (image) {
    const m = String(image).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return json({ error: 'image must be a jpeg/png/webp data URL' }, 400);
    if (m[2].length * 0.75 > MAX_IMAGE_BYTES) return json({ error: 'image too large' }, 413);
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: String(text || '') });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) return json({ error: 'claude api ' + r.status + ': ' + (await r.text()).slice(0, 200) }, 502);
  const j = await r.json();
  const out = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  // TODO(v2): ここで user_id と j.usage を Supabase の ai_usage に記録する
  return json({ text: out, usage: j.usage || null, route: 'claude' });
}
async function tryGemini(key, text, image) {
  for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
    const parts = [];
    const m = image && String(image).match(/^data:([^;,]+);base64,(.*)$/);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
    parts.push({ text: String(text || '') });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { maxOutputTokens: 1024, temperature: 0.2 } }) });
    if (r.status === 429 || r.status === 404) continue;
    if (!r.ok) return null;
    const j = await r.json();
    return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
  }
  return null;
}
function json(obj, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
