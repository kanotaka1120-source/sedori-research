import { CATEGORIES, CHANNELS, STATUSES, CAMP_TYPES, SETTING_LABELS, pointInfo, calcProfit, checkWarn, isValidJan, ymd, yen, pct } from './calc.js';
import * as store from './store.js';
import * as ai from './ai.js';
import * as scan from './scan.js';
import * as shared from './shared.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jcls = (j) => /◎/.test(j) ? 'j-buy' : /○|△/.test(j) ? 'j-mid' : 'j-ng';
const opts = (arr, sel) => arr.map((x) => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
const today = () => ymd(new Date());

let C = null; // 設定（store.config()）
// 「調べる」→「判定」へ引き継ぐ作業中の商品
const cur = { category: '', store: '', priceNote: '', name: '', jan: '', model: '', photo: '', source: '', cost: '', costShipping: 0, date: today(), prices: {}, shipMethod: 'ネコポス', monthlySold: '', notes: '', aiNotes: '', warn: [], marketNotes: [] };

/* ---------- 処理状況バー・トースト ---------- */
let timer = null, t0 = 0;
function status(state, text) {
  const el = $('status'); el.className = 'status ' + (state || '');
  clearInterval(timer);
  if (state === 'run') {
    t0 = Date.now();
    const tick = () => { $('statusText').textContent = `⏳ ${text}（${Math.floor((Date.now() - t0) / 1000)}秒経過・動いています）`; };
    tick(); timer = setInterval(tick, 1000);
  } else $('statusText').textContent = (state === 'done' ? '✅ ' : state === 'err' ? '⚠️ ' : '') + text;
}
async function run(label, fn) {
  status('run', label);
  try { const r = await fn(); status('done', `${label} 完了（${((Date.now() - t0) / 1000).toFixed(1)}秒${/AI/.test(label) && ai.lastRoute ? '・' + ai.lastRoute : ''}）${/AI/.test(label) && ai.lastSkipped.length ? ' ※' + ai.lastSkipped[0] : ''}`); return r; }
  catch (e) { status('err', `${label} 失敗：${e && e.message || e}`); throw e; }
}
let toastT = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
function sheet(title, html) { $('sheet_title').textContent = title; $('sheet_body').innerHTML = html; $('sheet').classList.add('on'); }
$('sheet_close').onclick = () => $('sheet').classList.remove('on');
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) $('sheet').classList.remove('on'); });

/* ---------- 共通部品 ---------- */
function launcher(q, jan) {
  q = (q || '').trim(); jan = (jan || '').trim();
  if (!q && !jan) return '<div class="muted">商品名かJANを入れると、各サイトの検索ボタンが出ます</div>';
  const groups = {}, order = [];
  C.sites.filter((s) => s.show !== false).forEach((s) => { if (!groups[s.group]) { groups[s.group] = []; order.push(s.group); } groups[s.group].push(s); });
  return '<div class="links">' + order.map((g) => `<div class="g">${esc(g)}</div>` + groups[g].map((s) => {
    const url = s.url.replace(/\{q\}/g, encodeURIComponent(q || jan)).replace(/\{jan\}/g, encodeURIComponent(jan || q));
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(s.name)}${s.note ? `<small>${esc(s.note)}</small>` : ''}</a>`;
  }).join('')).join('') + '</div>';
}
function pointHtml(pi) {
  let h = pi.parts.map((p) => `<span class="pill${['基本', 'ショップ倍率', '上乗せ'].includes(p.name) ? '' : ' hot'}">${esc(p.name)} ${p.pct}%</span>`).join('') + ` = <b>${pi.effPct}%</b>` + (pi.payMult > 1 ? ` <span class="pill hot">ポイント払い×${pi.payMult}</span>` : '');
  if (pi.notes.length) h += `<div class="muted">${pi.notes.map(esc).join(' ／ ')}</div>`;
  return h;
}
function warnHtml(list) { return list.length ? `<div class="warn">${list.map((w) => `⚠️ <b>${esc(w.cat)}</b>：${esc(w.msg)}`).join('<br>')}</div>` : ''; }
function judgeOf(c) {
  const pi = pointInfo(c.source, c.date, null, C.P);
  const base = { cost: c.cost, costShipping: c.costShipping, pointRate: c.pointRate !== undefined && c.pointRate !== '' ? c.pointRate : pi.effPct, payMult: c.payMult || pi.payMult, shipMethod: c.shipMethod, monthlySold: c.monthlySold };
  const rows = CHANNELS.filter((ch) => c.prices && c.prices[ch]).map((ch) => ({ ch, sell: Number(c.prices[ch]), r: calcProfit(Object.assign({}, base, { channel: ch, sellPrice: c.prices[ch] }), C.s) }));
  rows.sort((a, b) => (b.r.profit ?? -1e9) - (a.r.profit ?? -1e9));
  return { pi, base, rows, best: rows[0] || null };
}

/* ---------- 画面：ホーム ---------- */
async function viewHome() {
  const cands = await store.listCandidates();
  const ym = today().slice(0, 7);
  let buy = 0, sales = 0, prof = 0, stockN = 0, stockAmt = 0, exp = 0, act = 0, days = 0, dated = 0;
  cands.forEach((c) => {
    const r = c.result || {};
    if (c.buyDate && c.buyDate.slice(0, 7) === ym && ['購入済', '出品中', '売却済'].includes(c.status)) buy += Number(c.cost) || 0;
    if (c.status === '売却済' && c.soldDate && c.soldDate.slice(0, 7) === ym) { sales += Number(c.actual) || 0; prof += Number(c.actualProfit) || 0; }
    if (c.status === '購入済' || c.status === '出品中') { stockN++; stockAmt += Number(r.effCost) || 0; if (c.buyDate) { days += (Date.now() - new Date(c.buyDate).getTime()) / 86400000; dated++; } }
    if (c.status === '売却済' && r.profit != null && c.actualProfit != null) { exp += r.profit; act += c.actualProfit; }
  });
  const budget = Number(C.s.monthlyBudget) || 0, used = budget ? Math.min(100, Math.round(buy / budget * 100)) : 0;
  const hist = await store.listHistory(5);
  const cal = calRows(7);
  $('view').innerHTML = `
    <h1>今月</h1>
    <div class="grid2">
      <div class="tile"><div class="k">実利益</div><div class="v mono">${yen(prof)}</div></div>
      <div class="tile"><div class="k">売上</div><div class="v mono">${yen(sales)}</div></div>
      <div class="tile"><div class="k">在庫</div><div class="v mono">${stockN}件 ${yen(stockAmt)}</div></div>
      <div class="tile"><div class="k">見込み比（売却済）</div><div class="v mono">${exp ? Math.round(act / exp * 100) + '%' : '-'}</div></div>
    </div>
    <div class="card" style="margin-top:10px"><div class="row"><div><b>仕入予算</b> <span class="muted">${yen(buy)} / ${yen(budget)}</span></div><div style="text-align:right" class="muted">${dated ? '在庫の平均 ' + Math.round(days / dated) + '日' : ''}</div></div><div class="progress"><i style="width:${used}%;background:${used >= 90 ? 'var(--ng)' : 'var(--acc)'}"></i></div></div>
    ${(() => { const al = stockAlerts(cands); return al.length ? `<div class="warn" style="margin-top:8px">⏰ 在庫アラート ${al.length}件（${esc(al[0].c.name)} ${al[0].days}日 ほか）→ 在庫・実績で確認</div>` : ''; })()}
    <button class="btn big block" data-go="search">🔍 商品を調べる</button>
    <h3>この先7日のポイント日</h3>
    <div class="card" style="padding:8px"><table class="cal">${cal}</table></div>
    <h3>セール・ポイント情報（みんなで共有）<button class="btn sm ghost" id="h_sale_add" style="float:right">＋投稿</button></h3>
    <div id="h_sales" class="card" style="padding:8px"><div class="muted">${shared.enabled(C.s) ? '読み込み中…' : '未接続（設定 → 共有）。ウエル活・セカスト半額デー・コストコなどの情報をみんなで共有する機能です'}</div></div>
    <h3>最近調べたもの</h3>
    <div class="list">${hist.length ? hist.map((h) => `<div class="item" data-hist="${esc(h.id)}"><div class="hstack">${h.photo ? `<img class="thumb" src="${h.photo}">` : ''}<div style="flex:1"><div class="name">${esc(h.name || h.jan || '(名称なし)')}</div><div class="meta">${esc(h.createdAt.slice(5, 16).replace('T', ' '))}${h.judge ? ' ／ <span class="j ' + jcls(h.judge) + '">' + esc(h.judge) + '</span>' : ''}${h.profit != null ? ' ' + yen(h.profit) : ''}</div></div></div></div>`).join('') : '<div class="empty">まだありません。「調べる」から始めてください</div>'}</div>`;
  $('view').querySelector('[data-go]').onclick = () => go('search');
  $('h_sale_add').onclick = () => {
    if (!shared.enabled(C.s)) { status('err', 'セール情報の投稿には共有の設定（設定 → 共有）が必要です'); return; }
    sheet('セール・ポイント情報を投稿', `<label>店名</label><input id="sa_store" placeholder="例：ウエルシア／セカンドストリート"><label>内容</label><input id="sa_title" placeholder="例：ウエル活 ポイント1.5倍／冬物半額"><label>補足（任意）</label><input id="sa_detail" placeholder="例：会員限定、〇〇店のみ"><div class="row"><div><label>開始日</label><input id="sa_start" type="date" value="${today()}"></div><div><label>終了日</label><input id="sa_end" type="date" value="${today()}"></div></div><label>地域（空なら全国）</label><input id="sa_region" value="${esc(C.s.region || '')}"><button class="btn block" id="sa_go">投稿する</button>`);
    $('sa_go').onclick = async () => {
      const row = { store: $('sa_store').value.trim(), title: $('sa_title').value.trim(), detail: $('sa_detail').value.trim(), start: $('sa_start').value, end: $('sa_end').value, region: $('sa_region').value.trim() };
      if (!row.store || !row.title || !row.start) { status('err', '店名・内容・開始日は必須です'); return; }
      try { await run('セール情報を投稿', () => shared.pushSale(C.s, row)); $('sheet').classList.remove('on'); toast('投稿しました'); viewHome(); } catch (e) { /* status */ }
    };
  };
  if (shared.enabled(C.s)) {
    shared.pullSales(C.s, { region: C.s.region }).then((rows) => {
      $('h_sales').innerHTML = rows.length ? rows.slice(0, 15).map((r) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${esc(r.store)}</b> ${esc(r.title)}<div class="muted">${esc(r.start_date.slice(5))}${r.end_date !== r.start_date ? '〜' + esc(r.end_date.slice(5)) : ''}${r.region ? ' ／ ' + esc(r.region) : ' ／ 全国'}${r.detail ? ' ／ ' + esc(r.detail) : ''}${r.nick ? ' ／ by ' + esc(r.nick) : ''}</div></div>`).join('') : '<div class="muted">この先30日の投稿はまだありません。最初の1件を投稿してください</div>';
    }).catch((e) => { $('h_sales').innerHTML = `<div class="warn">${esc(e.message)}</div>`; });
  }
  $('view').querySelectorAll('[data-hist]').forEach((el) => { el.onclick = () => { const h = hist.find((x) => x.id === el.dataset.hist); loadCur(h); go('judge'); }; });
}
function calRows(n) {
  const srcs = ['楽天市場', 'Yahoo!ショッピング'];
  C.P.campaigns.forEach((c) => { if (c.on && c.source && c.source !== '全て' && !srcs.includes(c.source)) srcs.push(c.source); });
  let h = '<tr><th>日付</th>' + srcs.map((s) => `<th>${esc(s.replace('ショッピング', ''))}</th>`).join('') + '</tr>';
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i), ds = ymd(d);
    h += `<tr><td>${d.getMonth() + 1}/${d.getDate()}(${'日月火水木金土'.charAt(d.getDay())})${i === 0 ? ' 今日' : ''}</td>` + srcs.map((s) => { const pi = pointInfo(s, ds, null, C.P); return `<td class="${pi.notes.length ? 'hot' : ''}">${pi.effPct}%${pi.payMult > 1 ? '<br>×' + pi.payMult : ''}</td>`; }).join('') + '</tr>';
  }
  return h;
}
function loadCur(h) {
  Object.assign(cur, { name: h.name || '', jan: h.jan || '', model: h.model || '', photo: h.photo || '', source: h.source || cur.source, cost: h.cost || '', prices: h.prices || {}, aiNotes: h.aiNotes || '', category: h.category || '', date: today(), marketNotes: [] });
  cur.warn = checkWarn(cur.name, C.warn);
}

/* ---------- 画面：調べる ---------- */
function viewSearch() {
  $('view').innerHTML = `
    <h1>調べる</h1>
    <button class="btn big block" id="s_shelf" style="margin:0 0 8px"><span style="font-size:22px;margin-right:8px">🏷️</span>店頭モード：値札＋商品を1枚撮って即判定</button>
    <div class="grid3">
      <button class="btn big" id="s_scan" style="flex-direction:column;gap:2px"><span style="font-size:24px">📷</span><span style="font-size:12px">バーコード</span></button>
      <button class="btn big sub" id="s_photo" style="flex-direction:column;gap:2px"><span style="font-size:24px">🤖</span><span style="font-size:12px">写真でAI特定</span></button>
      <button class="btn big ghost" id="s_shot" style="flex-direction:column;gap:2px"><span style="font-size:24px">🖼</span><span style="font-size:12px">スクショを読む</span></button>
    </div>
    <div class="card" style="margin-top:10px">
      <div id="s_photo_box"></div>
      <label>商品名・キーワード</label><input id="s_name" value="${esc(cur.name)}" placeholder="例：〇〇 型番">
      <div class="row"><div><label>JAN</label><input id="s_jan" inputmode="numeric" value="${esc(cur.jan)}"></div><div><label>型番</label><input id="s_model" value="${esc(cur.model)}"></div></div>
      <div id="s_ai"></div>
      <div id="s_warn"></div>
    </div>
    <div class="card"><h2>売れた実績・仕入れ先・SNS</h2><div class="muted">開いて相場を確認 → 「判定」で入力。スクショを読ませると自動で入ります。</div><div id="s_links"></div></div>
    <div id="s_market"></div>
    <button class="btn big block" id="s_next">¥ 判定へ進む</button>`;
  const upd = () => {
    cur.name = $('s_name').value; cur.jan = $('s_jan').value.replace(/\D/g, ''); cur.model = $('s_model').value;
    cur.warn = checkWarn(cur.name, C.warn);
    $('s_warn').innerHTML = warnHtml(cur.warn);
    $('s_links').innerHTML = launcher(cur.name || cur.model, cur.jan);
    $('s_photo_box').innerHTML = cur.photo ? `<img class="photo" src="${cur.photo}">` : '';
    $('s_ai').innerHTML = cur.aiNotes ? `<div class="ai">🤖 ${esc(cur.aiNotes)}</div>` : '';
    $('s_market').innerHTML = cur.marketNotes.length ? `<div class="card"><h2>読み取った相場</h2>${cur.marketNotes.map((m) => `<div class="ai">${esc(m)}</div>`).join('')}</div>` : '';
  };
  ['s_name', 's_jan', 's_model'].forEach((id) => $(id).addEventListener('input', upd));
  upd();
  $('s_scan').onclick = startScan;
  $('s_shelf').onclick = () => { $('file_shelf').value = ''; $('file_shelf').click(); };
  $('s_photo').onclick = () => { $('file_photo').value = ''; $('file_photo').click(); };
  $('s_shot').onclick = () => { $('file_shot').value = ''; $('file_shot').click(); };
  $('s_next').onclick = () => go('judge');
}
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let liveFailed = false;
async function startScan() {
  if (liveFailed || !scan.canLive()) { $('file_barcode').value = ''; $('file_barcode').click(); return; }
  const v = $('scan_v'); $('scan').classList.add('on'); $('scan_msg').textContent = 'カメラを起動中…';
  try {
    await scan.startLive(v, (code) => { onJan(code); return true; }, (m) => { $('scan_msg').textContent = m; });
  } catch (e) {
    scan.stopLive(v); $('scan').classList.remove('on'); liveFailed = true;
    status('err', 'カメラを映せませんでした。もう一度📷を押すと写真で読み取ります（' + (e && e.message || e) + '）');
  }
}
$('scan_close').onclick = () => { scan.stopLive($('scan_v')); $('scan').classList.remove('on'); };
function onJan(code) {
  scan.stopLive($('scan_v')); $('scan').classList.remove('on');
  if (navigator.vibrate) navigator.vibrate(80);
  cur.jan = code;
  if (document.querySelector('#s_jan')) { $('s_jan').value = code; $('s_jan').dispatchEvent(new Event('input')); }
  status('done', `JAN ${code} を読み取りました。写真でAI特定、または🏷️店頭モードで値札ごと撮ると早いです`);
}
$('file_barcode').onchange = async function () {
  const f = this.files && this.files[0]; if (!f) return;
  const code = await run('写真からバーコードを読み取り', () => scan.decodeFile(f));
  if (code) onJan(code); else status('err', 'バーコードを読み取れませんでした。大きく・明るく・まっすぐ写してもう一度。または「写真でAI特定」を使ってください');
};
$('file_photo').onchange = async function () {
  const f = this.files && this.files[0]; if (!f) return;
  try {
    cur.photo = await ai.shrinkImage(f, 1280);
    if (document.querySelector('#s_photo_box')) $('s_photo_box').innerHTML = `<img class="photo" src="${cur.photo}">`;
    const r = await run('AIが商品を特定中', () => ai.ask('identify', { imageDataUrl: cur.photo, text: cur.jan ? 'JAN: ' + cur.jan : '' }, C.s));
    if (r.name) cur.name = r.name;
    if (r.model) cur.model = r.model;
    if (r.jan && isValidJan(r.jan) && !cur.jan) cur.jan = r.jan;
    cur.aiNotes = [r.category, r.condition, r.notes, r.confidence != null ? `確信度 ${Math.round(r.confidence * 100)}%` : ''].filter(Boolean).join(' ／ ');
    cur.warn = checkWarn(cur.name, C.warn);
    await store.addHistory({ name: cur.name, jan: cur.jan, model: cur.model, photo: cur.photo, aiNotes: cur.aiNotes });
    viewSearch();
  } catch (e) { /* status に表示済み */ }
};
$('file_shelf').onchange = async function () {
  const f = this.files && this.files[0]; if (!f) return;
  try {
    cur.photo = await ai.shrinkImage(f, 1400, 0.85);
    const r = await run('AIが商品と値札を読み取り中', () => ai.ask('shelf', { imageDataUrl: cur.photo, text: cur.jan ? 'JAN: ' + cur.jan : '' }, C.s));
    Object.assign(cur, { name: r.name || cur.name, model: r.model || '', category: r.category || '', store: r.store || '', priceNote: r.priceNote || '', marketNotes: [] });
    if (r.jan && isValidJan(r.jan)) cur.jan = r.jan;
    if (r.price) cur.cost = Number(r.price);
    const profiles = C.profileList.map((p) => p.name);
    const hit = r.store && profiles.find((p) => r.store.includes(p.replace('ストリート', '')) || p.includes(r.store));
    if (hit) cur.source = hit;
    cur.aiNotes = [r.category, r.condition, r.priceNote, r.notes, r.confidence != null ? `確信度 ${Math.round(r.confidence * 100)}%` : ''].filter(Boolean).join(' ／ ');
    cur.warn = checkWarn(cur.name, C.warn);
    await store.addHistory({ name: cur.name, jan: cur.jan, model: cur.model, photo: cur.photo, aiNotes: cur.aiNotes, cost: cur.cost, source: cur.source });
    // 記録済みの相場があれば自動で入れて、判定へ
    const m = await store.findMarket({ keyword: cur.name, jan: cur.jan }).catch(() => ({}));
    Object.keys(m).forEach((ch) => { if (!cur.prices[ch]) cur.prices[ch] = m[ch].price; });
    toast(r.price ? `店頭 ${yen(r.price)} を読み取りました` : '値札は読めませんでした。判定で入力してください');
    go('judge');
  } catch (e) { /* status に表示済み */ }
};
$('file_shot').onchange = async function () {
  const f = this.files && this.files[0]; if (!f) return;
  try {
    const img = await ai.shrinkImage(f, 1400, 0.8);
    const r = await run('AIがスクショから相場を読み取り中', () => ai.ask('read_market', { imageDataUrl: img, text: cur.name ? '商品: ' + cur.name : '' }, C.s));
    const ch = /メルカリ/.test(r.source) ? 'メルカリ' : /ヤフオク/.test(r.source) ? 'ヤフオク' : /Amazon/i.test(r.source) ? 'Amazon' : '';
    const med = Number(r.median) || (r.prices && r.prices.length ? r.prices.slice().sort((a, b) => a - b)[Math.floor(r.prices.length / 2)] : 0);
    if (ch && med) { cur.prices[ch] = med; await store.saveMarket([{ keyword: cur.name, jan: cur.jan, channel: ch, price: med, monthly: r.soldCount || '', memo: r.notes || '' }]); }
    if (r.soldCount && !cur.monthlySold) cur.monthlySold = r.soldCount;
    cur.marketNotes.push(`${r.source || '不明'}：中央値 ${yen(med)}（${(r.prices || []).length}件 ${r.period || ''}）需要${r.demand || '-'}。${r.notes || ''}`);
    viewSearch();
  } catch (e) { /* noop */ }
};

/* ---------- 画面：判定 ---------- */
function viewJudge() {
  const profiles = C.profileList.map((p) => p.name);
  if (!cur.source) cur.source = profiles.includes('セカンドストリート') ? 'セカンドストリート' : profiles[0];
  const ships = C.shipList.map((s) => s.name);
  $('view').innerHTML = `
    <h1>判定</h1>
    <div class="card">
      <div class="hstack">${cur.photo ? `<img class="thumb" src="${cur.photo}">` : ''}<div style="flex:1"><input id="j_name" value="${esc(cur.name)}" placeholder="商品名"><div class="muted" style="margin-top:4px">${cur.jan ? 'JAN ' + esc(cur.jan) : ''} ${cur.model ? '／ ' + esc(cur.model) : ''}</div></div></div>
      <div class="row"><div><label>仕入先</label><select id="j_src">${opts(profiles, cur.source)}</select></div><div><label>購入日</label><input id="j_date" type="date" value="${esc(cur.date)}"></div></div>
      <div class="row"><div><label>カテゴリ</label><select id="j_cat">${opts(['', ...CATEGORIES], CATEGORIES.includes(cur.category) ? cur.category : '')}</select></div><div id="j_stat" class="muted" style="align-self:end;font-size:12px"></div></div>
      <div class="row"><div><label>仕入価格（税込）</label><input id="j_cost" type="number" inputmode="numeric" value="${esc(cur.cost)}" placeholder="店頭の値段"></div><div><label>仕入送料</label><input id="j_cship" type="number" inputmode="numeric" value="${esc(cur.costShipping)}"></div></div>
      <div id="j_point" style="margin-top:8px"></div>
      <div id="j_warn">${warnHtml(cur.warn)}</div>
    </div>
    <div class="card">
      <div class="row" style="align-items:center"><h2 style="margin:0">売れた相場</h2><button class="btn sm ghost" id="j_mload" style="flex:none">自分の記録</button><button class="btn sm sub" id="j_mshared" style="flex:none">みんなの相場</button></div>
      <div class="muted">売り切れ・落札の価格を入力。スクショを読ませると自動で入ります。</div>
      <div class="grid2">${CHANNELS.map((ch) => `<div><label>${ch}${ch === 'BASE' ? '（売価）' : ''}</label><input data-p="${ch}" type="number" inputmode="numeric" value="${esc(cur.prices[ch] || '')}"></div>`).join('')}</div>
      <div class="row"><div><label>配送方法</label><select id="j_ship">${opts(ships, cur.shipMethod)}</select></div><div><label>月間販売数</label><input id="j_ms" type="number" inputmode="numeric" value="${esc(cur.monthlySold)}" placeholder="売れた回数/月"></div></div>
      <div id="j_mkinfo" class="muted" style="margin-top:6px"></div>
    </div>
    <div id="j_result"></div>
    <div class="row"><button class="btn sub" id="j_ai">🤖 AIに理由を聞く</button><button class="btn sub" id="j_msave">相場を記録</button></div>
    <button class="btn big block" id="j_save">候補に保存</button>
    <button class="btn block ghost" id="j_buy">仕入れた（購入済で保存）</button>
    <div id="j_explain"></div>`;
  const read = () => {
    cur.name = $('j_name').value; cur.source = $('j_src').value; cur.date = $('j_date').value; cur.category = $('j_cat').value; cur.cost = $('j_cost').value; cur.costShipping = $('j_cship').value;
    cur.shipMethod = $('j_ship').value; cur.monthlySold = $('j_ms').value;
    CHANNELS.forEach((ch) => { const v = $('view').querySelector(`[data-p="${ch}"]`).value; if (v) cur.prices[ch] = Number(v); else delete cur.prices[ch]; });
    cur.warn = checkWarn(cur.name, C.warn);
  };
  const render = () => {
    read();
    const J = judgeOf(cur);
    $('j_point').innerHTML = pointHtml(J.pi);
    $('j_warn').innerHTML = warnHtml(cur.warn);
    if (!J.rows.length) { $('j_result').innerHTML = '<div class="verdict none"><div class="t">相場未入力</div><div class="s">売れた相場を1つ以上入れると判定します</div></div>'; return J; }
    const b = J.best, cls = /◎/.test(b.r.judge) ? 'buy' : /○|△/.test(b.r.judge) ? 'mid' : 'ng';
    const warnTxt = cur.warn.length ? '（注意：' + cur.warn.map((w) => w.cat).join('・') + '）' : '';
    $('j_result').innerHTML = `
      <div class="verdict ${cls}"><div class="t">${esc(b.r.judge)} ${warnTxt}</div><div class="s">${esc(b.ch)}で ${yen(b.sell)} → 利益 <b>${yen(b.r.profit)}</b>（${pct(b.r.margin)}・ROI ${pct(b.r.roi)}）</div>
      <div class="s">実質仕入 ${yen(b.r.effCost)}${b.r.point ? '（ポイント ' + yen(b.r.point) + '）' : ''} ／ ${b.r.maxBuy > 0 ? '仕入上限 <b>' + yen(b.r.maxBuy) + '</b>' : 'この売価では基準に届きません'}</div></div>
      <div class="card"><table><tr><th>販売先</th><th>手数料</th><th>送料等</th><th>利益</th><th>率</th><th>判定</th></tr>${J.rows.map((x) => `<tr class="${x === b ? 'best' : ''}"><td>${x.ch}</td><td>${yen(x.r.fee)}</td><td>${yen(x.r.ship + x.r.pack)}</td><td class="mono">${yen(x.r.profit)}</td><td>${pct(x.r.margin)}</td><td class="j ${jcls(x.r.judge)}">${x.r.judge}</td></tr>`).join('')}</table></div>`;
    return J;
  };
  $('view').querySelectorAll('input,select').forEach((el) => { el.addEventListener('input', render); el.addEventListener('change', render); });
  render();
  store.listCandidates().then((all) => {
    const showStat = () => { const st = winStats(all).byCat[$('j_cat').value]; $('j_stat').textContent = st && st.sold ? `この分類の実績：${st.sold}件 見込み比${st.ratio}% 平均${st.days}日 赤字${st.lossPct}%` : ''; };
    $('j_cat').addEventListener('change', showStat); showStat();
  });
  $('j_mload').onclick = async () => {
    const m = await run('記録した相場を検索', () => store.findMarket({ keyword: cur.name, jan: cur.jan }));
    const keys = Object.keys(m);
    keys.forEach((ch) => { const el = $('view').querySelector(`[data-p="${ch}"]`); if (el && !el.value) el.value = m[ch].price; if (m[ch].monthly && !$('j_ms').value) $('j_ms').value = m[ch].monthly; });
    $('j_mkinfo').textContent = keys.length ? '記録：' + keys.map((ch) => `${ch} ${yen(m[ch].price)}（${m[ch].days}日前${m[ch].days > Number(C.s.marketFreshDays) ? '・古い' : ''}）`).join(' ／ ') : '記録された相場はまだありません';
    render();
  };
  $('j_mshared').onclick = async () => {
    read();
    if (!shared.enabled(C.s)) { $('j_mkinfo').innerHTML = 'みんなの相場は未接続です。設定 → 共有 でSupabaseを設定すると使えます'; return; }
    try {
      const m = await run('みんなの相場を検索', () => shared.pullMarket(C.s, { jan: cur.jan, keyword: cur.name }));
      const keys = Object.keys(m);
      keys.forEach((ch) => { const el = $('view').querySelector(`[data-p="${ch}"]`); if (el && !el.value) el.value = m[ch].median; if (m[ch].monthly && !$('j_ms').value) $('j_ms').value = m[ch].monthly; });
      $('j_mkinfo').textContent = keys.length ? 'みんなの相場：' + keys.map((ch) => `${ch} 中央値 ${yen(m[ch].median)}（${m[ch].n}件 ${yen(m[ch].min)}〜${yen(m[ch].max)} 最新 ${m[ch].latest}）`).join(' ／ ') : 'みんなの相場にはまだありません。記録すると最初の1件になります';
      render();
    } catch (e) { /* status */ }
  };
  const shareNow = async (list) => {
    if (!shared.enabled(C.s) || !C.s.shareMarket) return;
    try { const n = await shared.pushMarket(C.s, list); if (n) toast(`みんなの相場に${n}件共有しました`); } catch (e) { status('err', '共有に失敗：' + e.message); }
  };
  $('j_msave').onclick = async () => {
    read();
    const list = CHANNELS.filter((ch) => cur.prices[ch]).map((ch) => ({ keyword: cur.name, jan: cur.jan, channel: ch, price: cur.prices[ch], monthly: cur.monthlySold }));
    if (!list.length || (!cur.name && !cur.jan)) { status('err', '商品名かJANと、相場を1つ以上入れてください'); return; }
    await run('相場を記録', () => store.saveMarket(list)); toast('相場を記録しました');
    shareNow(list);
  };
  const save = async (statusName) => {
    const J = render();
    if (!J.best) { status('err', '相場を入れてから保存してください'); return; }
    const b = J.best;
    const row = { name: cur.name, jan: cur.jan, model: cur.model, photo: cur.photo, source: cur.source, date: cur.date, category: cur.category, cost: Number(cur.cost) || 0, costShipping: Number(cur.costShipping) || 0,
      pointRate: J.pi.effPct, payMult: J.pi.payMult, channel: b.ch, sellPrice: b.sell, shipMethod: cur.shipMethod, monthlySold: cur.monthlySold, prices: Object.assign({}, cur.prices),
      result: b.r, judge: b.r.judge, warn: cur.warn.map((w) => w.cat).join('・'), aiNotes: cur.aiNotes, status: statusName };
    await run('保存', () => store.saveCandidate(row));
    shareNow(CHANNELS.filter((ch) => cur.prices[ch]).map((ch) => ({ keyword: cur.name, jan: cur.jan, channel: ch, price: cur.prices[ch], monthly: cur.monthlySold })));
    await store.addHistory({ name: cur.name, jan: cur.jan, model: cur.model, photo: cur.photo, source: cur.source, cost: cur.cost, prices: cur.prices, aiNotes: cur.aiNotes, judge: b.r.judge, profit: b.r.profit });
    toast(statusName === '購入済' ? '購入済として保存しました' : '候補に保存しました');
  };
  $('j_save').onclick = () => save('検討中');
  $('j_buy').onclick = () => save('購入済');
  $('j_ai').onclick = async () => {
    const J = render(); if (!J.best) { status('err', '相場を入れてから聞いてください'); return; }
    const b = J.best;
    const text = `商品: ${cur.name}\n仕入先: ${cur.source} ${yen(cur.cost)}（実質 ${yen(b.r.effCost)}、ポイント${J.pi.effPct}%）\n販売先: ${b.ch} 売価 ${yen(b.sell)}\n利益: ${yen(b.r.profit)}（利益率 ${pct(b.r.margin)}、ROI ${pct(b.r.roi)}）\n月間販売数: ${cur.monthlySold || '不明'}\n判定: ${b.r.judge}\n注意ワード: ${cur.warn.map((w) => w.cat).join('・') || 'なし'}\nAIの商品メモ: ${cur.aiNotes || 'なし'}\n読み取った相場メモ: ${cur.marketNotes.join(' / ') || 'なし'}`;
    try { const t = await run('AIが判定理由を作成中', () => ai.ask('explain', { text }, C.s)); $('j_explain').innerHTML = `<div class="ai">🤖 ${esc(t)}</div>`; } catch (e) { /* noop */ }
  };
}

/* ---------- 勝ちパターン統計 ---------- */
function winStats(all) {
  const agg = (key) => {
    const g = {};
    all.forEach((c) => {
      const k = c[key] || '（未分類）'; const r = c.result || {};
      if (!g[k]) g[k] = { n: 0, sold: 0, exp: 0, act: 0, days: 0, loss: 0, stock: 0 };
      const o = g[k]; o.n++;
      if (c.status === '売却済' && c.actualProfit != null) {
        o.sold++; o.exp += r.profit || 0; o.act += c.actualProfit;
        if (c.actualProfit < 0) o.loss++;
        if (c.buyDate && c.soldDate) o.days += Math.max(0, (new Date(c.soldDate) - new Date(c.buyDate)) / 86400000);
      }
      if (c.status === '購入済' || c.status === '出品中') o.stock++;
    });
    Object.values(g).forEach((o) => { o.ratio = o.exp ? Math.round(o.act / o.exp * 100) : 0; o.days = o.sold ? Math.round(o.days / o.sold) : 0; o.lossPct = o.sold ? Math.round(o.loss / o.sold * 100) : 0; o.avg = o.sold ? Math.round(o.act / o.sold) : 0; });
    return g;
  };
  return { byCat: agg('category'), bySource: agg('source'), byChannel: agg('channel') };
}
function statsTable(g, label) {
  const rows = Object.entries(g).filter(([, o]) => o.sold > 0).sort((a, b) => b[1].act - a[1].act);
  if (!rows.length) return `<div class="muted">売却済が増えると${label}別の勝ちパターンが出ます</div>`;
  return `<table><tr><th>${label}</th><th>売却</th><th>実利益</th><th>平均/件</th><th>見込み比</th><th>日数</th><th>赤字率</th></tr>${rows.map(([k, o]) => `<tr><td>${esc(k)}</td><td>${o.sold}</td><td class="mono">${yen(o.act)}</td><td class="mono">${yen(o.avg)}</td><td class="${o.ratio >= 90 ? 'j-buy' : o.ratio >= 60 ? 'j-mid' : 'j-ng'}">${o.ratio}%</td><td>${o.days}日</td><td class="${o.lossPct > 30 ? 'j-ng' : ''}">${o.lossPct}%</td></tr>`).join('')}</table>`;
}
function stockAlerts(all) {
  const lim = Number(C.s.stockAlertDays) || 30;
  return all.filter((c) => (c.status === '購入済' || c.status === '出品中') && c.buyDate).map((c) => ({ c, days: Math.floor((Date.now() - new Date(c.buyDate)) / 86400000) })).filter((x) => x.days >= lim).sort((a, b) => b.days - a.days);
}
async function askRepricing(c, days) {
  const r = c.result || {};
  const text = `商品: ${c.name}\n仕入れからの日数: ${days}日（アラート基準 ${C.s.stockAlertDays}日）\n販売先: ${c.channel} 出品価格の想定: ${yen(c.sellPrice)}\n実質仕入値（損切りライン）: ${yen(r.effCost)}\n販売手数料率: ${c.channel === 'メルカリ' ? '10%' : c.channel === 'ヤフオク' ? '10%' : c.channel === 'BASE' ? '約6.6%+40円' : '15%前後'}\n送料等: ${yen((r.ship || 0) + (r.pack || 0))}\n見込み利益: ${yen(r.profit)}\n他販路の相場: ${Object.entries(c.prices || {}).map(([k, v]) => k + ' ' + yen(v)).join(', ') || '不明'}`;
  return ai.ask('repricing', { text }, C.s);
}

/* ---------- 画面：在庫・実績 ---------- */
let stockFilter = '';
async function viewStock() {
  const all = await store.listCandidates();
  const list = all.filter((c) => !stockFilter || c.status === stockFilter);
  const counts = {}; all.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
  $('view').innerHTML = `
    <h1>在庫・実績</h1>
    ${(() => { const al = stockAlerts(all); return al.length ? `<div class="card" style="border-color:var(--ng)"><h2>⏰ 在庫アラート（${al.length}件）</h2><div class="muted">仕入れから${esc(C.s.stockAlertDays)}日以上。値下げ・販路変更・損切りを検討。</div>${al.map(({ c, days }) => `<div class="row" style="margin-top:6px;align-items:center"><div><b>${esc(c.name)}</b><div class="muted">${days}日 ／ ${esc(c.channel)} ${yen(c.sellPrice)} ／ 損切り ${yen((c.result || {}).effCost)}</div></div><button class="btn sm sub" data-rep="${esc(c.id)}" style="flex:none">🤖 値下げ案</button></div><div id="rep_${esc(c.id)}"></div>`).join('')}</div>` : ''; })()}
    <div class="seg">${['', ...STATUSES].map((s) => `<button data-f="${esc(s)}" class="${s === stockFilter ? 'on' : ''}">${s || '全部'}${s && counts[s] ? ' ' + counts[s] : ''}</button>`).join('')}</div>
    <div class="row"><button class="btn sm ghost" id="k_csv">CSV書き出し</button><button class="btn sm ghost" id="k_base">BASE出品CSV（出品中）</button><button class="btn sm ghost" id="k_stats">勝ちパターン</button></div>
    <div id="k_stats_box"></div>
    <div class="list" style="margin-top:8px">${list.length ? list.map((c) => {
      const r = c.result || {};
      return `<div class="item" data-id="${esc(c.id)}"><div class="hstack">${c.photo ? `<img class="thumb" src="${c.photo}">` : ''}<div style="flex:1"><div class="name">${esc(c.name || c.jan || '(名称なし)')}</div>
        <div class="meta">${esc((c.createdAt || '').slice(5, 10))} ／ ${esc(c.source)} → ${esc(c.channel)}${c.buyDate ? ' ／ 仕入 ' + esc(c.buyDate.slice(5)) : ''}${c.soldDate ? ' ／ 売却 ' + esc(c.soldDate.slice(5)) : ''}</div>
        <div style="margin-top:4px">仕入 ${yen(c.cost)} → 売価 ${yen(c.sellPrice)}　見込み <b class="mono">${yen(r.profit)}</b> <span class="j ${jcls(c.judge || '')}">${esc(c.judge || '')}</span>${c.actualProfit != null ? `　実利益 <b class="mono">${yen(c.actualProfit)}</b>` : ''}</div>
        ${c.warn ? `<div class="warn">⚠️ ${esc(c.warn)}</div>` : ''}
        <div class="row" style="margin-top:8px"><select data-st="${esc(c.id)}">${opts(STATUSES, c.status)}</select><input type="number" inputmode="numeric" placeholder="実売価格" value="${c.actual != null ? c.actual : ''}" data-ac="${esc(c.id)}"><button class="btn sm" data-up="${esc(c.id)}" style="flex:none">保存</button></div>
        <div class="row" style="margin-top:6px"><button class="btn sm ghost" data-open="${esc(c.id)}">判定を開く</button><button class="btn sm ghost" data-list="${esc(c.id)}">出品文をAIで</button><button class="btn sm ghost" data-del="${esc(c.id)}" style="color:var(--ng)">削除</button></div>
      </div></div></div>`; }).join('') : '<div class="empty">該当なし</div>'}</div>`;
  $('view').querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { stockFilter = b.dataset.f; viewStock(); }; });
  $('k_csv').onclick = async () => {
    const csv = store.toCsv(all, [{ label: '登録日', get: (c) => (c.createdAt || '').slice(0, 10) }, { label: '商品名', key: 'name' }, { label: 'JAN', key: 'jan' }, { label: '仕入先', key: 'source' }, { label: '仕入価格', key: 'cost' }, { label: '販売先', key: 'channel' }, { label: '想定売価', key: 'sellPrice' }, { label: '見込み利益', get: (c) => (c.result || {}).profit }, { label: '判定', key: 'judge' }, { label: '状態', key: 'status' }, { label: '仕入日', key: 'buyDate' }, { label: '実売価格', key: 'actual' }, { label: '売却日', key: 'soldDate' }, { label: '実利益', key: 'actualProfit' }]);
    download(`sedori_${today()}.csv`, csv, 'text/csv');
  };
  $('k_stats').onclick = () => { const w = winStats(all); $('k_stats_box').innerHTML = `<div class="card"><h2>勝ちパターン（自分の実績）</h2>${statsTable(w.byCat, 'カテゴリ')}<div style="height:8px"></div>${statsTable(w.bySource, '仕入先')}<div style="height:8px"></div>${statsTable(w.byChannel, '販売先')}</div>`; };
  $('k_base').onclick = () => {
    const rows = all.filter((c) => c.status === '出品中' || c.status === '購入済');
    if (!rows.length) { status('err', '購入済・出品中の商品がありません'); return; }
    // BASEの商品一括登録（CSV）に合わせた下書き。列名はBASE管理画面のテンプレートに合わせて調整してください。
    const csv = store.toCsv(rows, [{ label: '商品名', key: 'name' }, { label: '商品説明', get: (c) => `${c.name}${c.model ? '（' + c.model + '）' : ''}\n${c.aiNotes || ''}` }, { label: '価格', get: (c) => c.prices && c.prices.BASE ? c.prices.BASE : c.sellPrice }, { label: '税率', get: () => 10 }, { label: '在庫数', get: () => 1 }, { label: '公開状態', get: () => '非公開' }, { label: 'JAN', key: 'jan' }, { label: '管理メモ', get: (c) => `仕入 ${c.cost}円 ${c.source} ${c.buyDate || ''}` }]);
    download(`base_items_${today()}.csv`, '\ufeff' + csv, 'text/csv'); toast('BASE取込用の下書きCSVを書き出しました');
  };
  $('view').onclick = async (e) => {
    const t = e.target, id = t.dataset.up || t.dataset.open || t.dataset.del || t.dataset.list || t.dataset.rep;
    if (!id) return;
    const c = all.find((x) => x.id === id); if (!c) return;
    if (t.dataset.up) {
      c.status = $('view').querySelector(`[data-st="${id}"]`).value;
      const ac = $('view').querySelector(`[data-ac="${id}"]`).value;
      c.actual = ac === '' ? null : Number(ac);
      c.actualProfit = c.actual ? calcProfit({ cost: c.cost, costShipping: c.costShipping, pointRate: c.pointRate, payMult: c.payMult, channel: c.channel, shipMethod: c.shipMethod, sellPrice: c.actual }, C.s).profit : null;
      await run('更新', () => store.saveCandidate(c)); toast('更新しました'); viewStock();
    } else if (t.dataset.open) {
      Object.assign(cur, { name: c.name, jan: c.jan, model: c.model, photo: c.photo, source: c.source, cost: c.cost, costShipping: c.costShipping, prices: Object.assign({}, c.prices), shipMethod: c.shipMethod, monthlySold: c.monthlySold, aiNotes: c.aiNotes, date: today(), marketNotes: [] });
      cur.warn = checkWarn(cur.name, C.warn); go('judge');
    } else if (t.dataset.del) {
      if (confirm('この記録を削除しますか？')) { await store.deleteCandidate(id); toast('削除しました'); viewStock(); }
    } else if (t.dataset.rep) {
      const days = Math.floor((Date.now() - new Date(c.buyDate)) / 86400000);
      try { const txt = await run('AIが値下げ案を作成中', () => askRepricing(c, days)); $('rep_' + id).innerHTML = `<div class="ai">🤖 ${esc(txt)}</div>`; } catch (e) { /* noop */ }
    } else if (t.dataset.list) {
      try { const r = await run('AIが出品文を作成中', () => ai.ask('listing', { text: `商品: ${c.name}\n型番: ${c.model || ''}\n状態メモ: ${c.aiNotes || ''}\n売価の目安: ${c.sellPrice}` }, C.s)); sheet('出品文（コピーして使ってください）', `<label>タイトル</label><textarea style="min-height:50px">${esc(r.title)}</textarea><label>説明文</label><textarea style="min-height:180px">${esc(r.body)}</textarea>`); } catch (e) { /* noop */ }
    }
  };
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- 画面：設定 ---------- */
function viewSettings() {
  const s = C.s;
  const numKeys = Object.keys(SETTING_LABELS);
  $('view').innerHTML = `
    <h1>設定</h1>
    <div class="card"><h2>判定基準・手数料</h2>${numKeys.map((k) => `<label>${esc(SETTING_LABELS[k])}</label><input data-k="${k}" type="number" step="any" inputmode="decimal" value="${esc(s[k])}">`).join('')}<button class="btn block" id="st_save">保存</button></div>
    <div class="card"><h2>ポイント設定（仕入先ごと）</h2><div class="muted">基本％＋上乗せ％＋その日のキャンペーンが合計還元率。楽天の上乗せは自分のSPU倍率−1。</div>
      <table><tr><th>仕入先</th><th>基本%</th><th>上乗せ%</th><th>倍率</th></tr>${C.profileList.map((p, i) => `<tr><td>${esc(p.name)}</td><td><input data-pf="${i}" data-f="base" type="number" step="any" value="${p.base}" style="width:64px;padding:6px"></td><td><input data-pf="${i}" data-f="extra" type="number" step="any" value="${p.extra}" style="width:64px;padding:6px"></td><td><input data-pf="${i}" data-f="payMult" type="number" step="any" value="${p.payMult}" style="width:56px;padding:6px"></td></tr>`).join('')}</table>
      <button class="btn block sub" id="pf_save">ポイント設定を保存</button></div>
    <div class="card"><h2>キャンペーン（日付で効くもの）</h2>${C.P.campaigns.map((c, i) => `<div class="check"><input type="checkbox" data-c="${i}" ${c.on ? 'checked' : ''}><div><b>${esc(c.source)}：${esc(c.name)}</b><div class="muted">${esc(c.type)} ${esc(c.cond)}${c.add ? ' +' + c.add + '%' : ''}${c.payMult > 1 ? ' ×' + c.payMult : ''}${c.cap ? ' ／ 上限 ' + esc(c.cap) : ''}</div></div></div>`).join('')}
      <div class="muted" style="margin-top:6px">お買い物マラソンは期間を直してからON。</div><label>マラソン期間（例 2026-12-04 20:00〜2026-12-11 01:59）</label><input id="cp_marathon" value="${esc((C.P.campaigns.find((c) => /マラソン/.test(c.name)) || {}).cond || '')}">
      <button class="btn block sub" id="cp_save">キャンペーンを保存</button></div>
    <div class="card"><h2>送料表</h2><table><tr><th>方法</th><th>送料</th><th>資材</th></tr>${C.shipList.map((x, i) => `<tr><td>${esc(x.name)}</td><td><input data-sh="${i}" data-f="fee" type="number" value="${x.fee}" style="width:72px;padding:6px"></td><td><input data-sh="${i}" data-f="material" type="number" value="${x.material}" style="width:64px;padding:6px"></td></tr>`).join('')}</table><button class="btn block sub" id="sh_save">送料表を保存</button></div>
    <div class="card"><h2>AI（無料枠）</h2>
      <div class="muted">今の順番：${ai.aiRoutes(s).map((r) => esc(ai.ROUTE_LABEL[r] || r)).join(' → ')}</div>
      <label>Gemini APIキー（無料・推奨）</label><input data-k="geminiKey" value="${esc(s.geminiKey)}" placeholder="AIza…" autocomplete="off">
      <div class="muted">取得：<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> でGoogleログイン →「APIキーを作成」→ 貼り付け。無料枠は1日あたり Flash-Lite 500回・Flash 20回（Googleの枠は変わることがあります。送った写真はGoogleの改善に使われます）。</div>
      <label>Groq APIキー（任意・予備）</label><input data-k="groqKey" value="${esc(s.groqKey)}" placeholder="gsk_…" autocomplete="off">
      <div class="muted">取得：<a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com</a>。Geminiの枠を使い切った時に自動で切り替わります。</div>
      <button class="btn block" id="ai_save">AI設定を保存</button>
      <button class="btn block ghost" id="ai_test">接続テスト（写真なし・1回分使います）</button>
      <div id="ai_test_out"></div>
    </div>
    <div class="card"><h2>API（自動検索・中継）</h2>
      <label>楽天 アプリID</label><input data-k="rakutenAppId" value="${esc(s.rakutenAppId)}"><label>楽天 アクセスキー</label><input data-k="rakutenAccessKey" value="${esc(s.rakutenAccessKey)}"><label>Yahoo! Client ID</label><input data-k="yahooAppId" value="${esc(s.yahooAppId)}"><label>Keepa APIキー</label><input data-k="keepaKey" value="${esc(s.keepaKey)}"><label>AI中継URL</label><input data-k="aiEndpoint" value="${esc(s.aiEndpoint)}">
      <div class="muted" style="margin-top:6px">楽天・Yahoo!の自動検索は、中継サーバー（Vercel）を置いてから有効になります。</div><button class="btn block" id="api_save">保存</button></div>
    <div class="card"><h2>共有（みんなの相場DB・セールカレンダー）</h2>
      <div class="muted">${shared.enabled(s) ? '接続先あり' : '未接続'}。相場は「JAN／商品名・販売先・価格」だけを匿名で共有します。個人情報・仕入値は送りません。</div>
      <label>Supabase URL</label><input data-k="supabaseUrl" value="${esc(s.supabaseUrl)}" placeholder="https://xxxx.supabase.co" autocomplete="off">
      <label>Supabase anon key</label><input data-k="supabaseAnonKey" value="${esc(s.supabaseAnonKey)}" placeholder="eyJ…" autocomplete="off">
      <div class="row"><div><label>ニックネーム（任意）</label><input data-k="shareNick" value="${esc(s.shareNick)}"></div><div><label>地域（都道府県）</label><input data-k="region" value="${esc(s.region)}" placeholder="栃木"></div></div>
      <div class="check" style="margin-top:8px"><input type="checkbox" id="sh_on" ${s.shareMarket ? 'checked' : ''}><div><b>自分が記録した相場を共有する</b><div class="muted">ONにすると、相場を記録・候補保存した時に自動でみんなの相場へ送ります</div></div></div>
      <div class="row" style="margin-top:8px"><button class="btn sub" id="sh_save">共有設定を保存</button><button class="btn ghost" id="sh_test">接続テスト</button></div><div id="sh_out"></div>
    </div>
    <div class="card"><h2>データ</h2><div class="row"><button class="btn sub" id="bk_exp">バックアップ（JSON）</button><button class="btn sub" id="bk_imp">復元</button></div><div class="muted" style="margin-top:8px">データはこの端末のブラウザに保存されています。機種変更前にバックアップしてください。</div></div>
    <div class="muted" style="text-align:center;margin:12px 0">セドリサーチ v1.0 ／ ${esc(navigator.userAgent.slice(0, 60))}</div>`;
  const saveSettings = async (keys) => { const next = Object.assign({}, s); keys.forEach((k) => { const el = $('view').querySelector(`[data-k="${k}"]`); next[k] = el.type === 'number' ? Number(el.value) : el.value.trim(); }); C = await store.saveConfig('settings', next); toast('保存しました'); };
  $('st_save').onclick = () => saveSettings(numKeys);
  $('api_save').onclick = () => saveSettings(['rakutenAppId', 'rakutenAccessKey', 'yahooAppId', 'keepaKey', 'aiEndpoint']);
  $('ai_save').onclick = async () => { await saveSettings(['geminiKey', 'groqKey']); viewSettings(); };
  $('ai_test').onclick = async () => {
    await saveSettings(['geminiKey', 'groqKey']);
    try {
      const t = await run('AIの接続テスト', () => ai.ask('explain', { text: '商品: テスト\n仕入先: テスト 1,000円\n販売先: メルカリ 売価 2,000円\n利益: 500円（利益率 25%、ROI 50%）\n判定: ◎買い' }, C.s));
      const skipped = ai.lastSkipped.length ? `<div class="warn">飛ばした経路：<br>${ai.lastSkipped.map(esc).join('<br>')}</div>` : '';
      $('ai_test_out').innerHTML = `<div class="ai">✅ ${esc(ai.lastRoute)} で応答あり：${esc(String(t).slice(0, 80))}…</div>${skipped}`;
    } catch (e) { $('ai_test_out').innerHTML = `<div class="warn">${esc(e.message)}</div>`; }
  };
  $('pf_save').onclick = async () => { const list = C.profileList.map((p, i) => Object.assign({}, p, { base: Number($('view').querySelector(`[data-pf="${i}"][data-f="base"]`).value) || 0, extra: Number($('view').querySelector(`[data-pf="${i}"][data-f="extra"]`).value) || 0, payMult: Number($('view').querySelector(`[data-pf="${i}"][data-f="payMult"]`).value) || 1 })); C = await store.saveConfig('profiles', list); toast('保存しました'); };
  $('cp_save').onclick = async () => { const list = C.P.campaigns.map((c, i) => Object.assign({}, c, { on: $('view').querySelector(`[data-c="${i}"]`).checked, cond: /マラソン/.test(c.name) ? $('cp_marathon').value : c.cond })); C = await store.saveConfig('campaigns', list); toast('保存しました'); };
  $('sh_save').onclick = async () => { const list = C.shipList.map((x, i) => Object.assign({}, x, { fee: Number($('view').querySelector(`[data-sh="${i}"][data-f="fee"]`).value) || 0, material: Number($('view').querySelector(`[data-sh="${i}"][data-f="material"]`).value) || 0 })); C = await store.saveConfig('ship', list); toast('保存しました'); };
  $('sh_save').onclick = async () => { const next = Object.assign({}, C.s); ['supabaseUrl', 'supabaseAnonKey', 'shareNick', 'region'].forEach((k) => { next[k] = $('view').querySelector(`[data-k="${k}"]`).value.trim(); }); next.shareMarket = $('sh_on').checked; C = await store.saveConfig('settings', next); toast('保存しました'); viewSettings(); };
  $('sh_test').onclick = async () => { $('sh_save').click(); await new Promise((r) => setTimeout(r, 300)); try { await run('共有サーバーに接続', () => shared.ping(C.s)); $('sh_out').innerHTML = '<div class="ai">✅ 接続OK</div>'; } catch (e) { $('sh_out').innerHTML = `<div class="warn">${esc(e.message)}</div>`; } };
  $('bk_exp').onclick = async () => { const d = await store.exportAll(); download(`sedori_backup_${today()}.json`, JSON.stringify(d), 'application/json'); };
  $('bk_imp').onclick = () => { $('file_import').value = ''; $('file_import').click(); };
}
$('file_import').onchange = async function () {
  const f = this.files && this.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); const n = await run('復元', () => store.importAll(d)); C = store.config(); toast(n + '件を復元しました'); viewSettings(); } catch (e) { status('err', '復元できませんでした：' + e.message); }
};

/* ---------- ルーター ---------- */
const VIEWS = { home: viewHome, search: viewSearch, judge: viewJudge, stock: viewStock, settings: viewSettings };
async function go(t) {
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  window.scrollTo(0, 0);
  await VIEWS[t]();
}
document.querySelectorAll('#nav button').forEach((b) => { b.onclick = () => go(b.dataset.t); });

(async () => {
  try {
    C = await store.loadConfig();
    const mode = ai.aiMode(C.s);
    await go('search');
    status('done', '準備OK' + (mode === 'relay' ? '（AIを使うには設定でGeminiキーを入れてください）' : mode === 'mock' ? '（テストモード）' : '・AI: ' + (ai.ROUTE_LABEL[mode] || mode)));
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* noop */ });
  } catch (e) { status('err', '起動に失敗：' + (e && e.message || e)); }
})();
