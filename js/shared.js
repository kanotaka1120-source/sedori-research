// 共有レイヤー：みんなの相場DB・セールカレンダー（Supabase REST を直接叩く。SDK不要）
// 設定の supabaseUrl / supabaseAnonKey が空なら「共有なし」で動く。
// v1.5：匿名（anonキー）で読み書き。v2 で Google ログインとユーザーIDに置き換える。

function conf(s) {
  const url = (s.supabaseUrl || '').replace(/\/+$/, '');
  return url && s.supabaseAnonKey ? { url, key: s.supabaseAnonKey } : null;
}
export function enabled(s) { return !!conf(s); }

async function rest(s, path, { method = 'GET', body, prefer } = {}) {
  const c = conf(s); if (!c) throw new Error('共有は未設定（設定でSupabaseのURLとキーを入れてください）');
  const h = { apikey: c.key, 'Content-Type': 'application/json' };
  if (!/^sb_/.test(c.key)) h.Authorization = 'Bearer ' + c.key; // 旧式の anon JWT の時だけ
  if (prefer) h.Prefer = prefer;
  const r = await fetch(`${c.url}/rest/v1/${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* noop */ } throw new Error(`共有サーバー ${r.status}${m ? ': ' + m.slice(0, 100) : ''}`); }
  return r.status === 204 ? null : r.json();
}

// 相場を共有する（JANか商品名、販売先、価格）。個人情報は送らない。
export async function pushMarket(s, rows) {
  if (!enabled(s) || !s.shareMarket) return 0;
  const list = rows.filter((r) => r.price && (r.jan || r.keyword)).map((r) => ({ jan: r.jan || null, keyword: (r.keyword || '').slice(0, 120), channel: r.channel, price: Math.round(Number(r.price)), monthly: r.monthly ? Number(r.monthly) : null, region: s.region || null, nick: (s.shareNick || '').slice(0, 20) || null }));
  if (!list.length) return 0;
  await rest(s, 'market_shared', { method: 'POST', body: list, prefer: 'return=minimal' });
  return list.length;
}

// みんなの相場を引く：JAN優先、なければ商品名の部分一致。販売先ごとの中央値・件数・最新日を返す
export async function pullMarket(s, { jan, keyword }, days = 90) {
  if (!enabled(s)) return {};
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let q = `market_shared?select=channel,price,monthly,created_at&created_at=gte.${since}&order=created_at.desc&limit=200&`;
  if (jan) q += `jan=eq.${encodeURIComponent(jan)}`;
  else if (keyword) q += `keyword=ilike.${encodeURIComponent('*' + keyword.slice(0, 40) + '*')}`;
  else return {};
  const rows = await rest(s, q);
  const g = {};
  rows.forEach((r) => { (g[r.channel] = g[r.channel] || []).push(r); });
  const out = {};
  Object.keys(g).forEach((ch) => {
    const ps = g[ch].map((r) => r.price).sort((a, b) => a - b);
    out[ch] = { median: ps[Math.floor(ps.length / 2)], n: ps.length, min: ps[0], max: ps[ps.length - 1], latest: g[ch][0].created_at.slice(0, 10), monthly: g[ch].find((r) => r.monthly)?.monthly || '' };
  });
  return out;
}

// セールカレンダー：店名・内容・日付・地域。みんなで投稿
export async function pushSale(s, row) {
  await rest(s, 'sale_calendar', { method: 'POST', body: [{ store: row.store.slice(0, 40), title: row.title.slice(0, 80), detail: (row.detail || '').slice(0, 200), start_date: row.start, end_date: row.end || row.start, region: row.region || null, nick: (s.shareNick || '').slice(0, 20) || null }], prefer: 'return=minimal' });
}
export async function pullSales(s, { region, days = 30 } = {}) {
  if (!enabled(s)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  let q = `sale_calendar?select=id,store,title,detail,start_date,end_date,region,nick,created_at&end_date=gte.${today}&start_date=lte.${until}&order=start_date.asc&limit=200`;
  if (region) q += `&or=(region.is.null,region.eq.${encodeURIComponent(region)})`;
  return rest(s, q);
}

// 接続確認
export async function ping(s) {
  await rest(s, 'market_shared?select=id&limit=1');
  return true;
}
