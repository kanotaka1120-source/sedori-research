// 計算ロジック（GAS版からそのまま移植・テスト済み）と初期データ
// pointInfo / calcProfit / checkWarn は外部の状態を参照しない純粋関数

export const CATEGORIES = ['家電', 'おもちゃ', 'ゲーム', '本', '衣類', '美容', '日用品', '食品', '工具', 'その他'];
export const CHANNELS = ['メルカリ', 'ヤフオク', 'BASE', 'Amazon'];
export const STATUSES = ['検討中', '購入済', '出品中', '売却済', '見送り'];
export const CAMP_TYPES = ['毎日', '毎月の日付', '曜日', '期間'];

export const DEFAULT_SETTINGS = {
  mercariRate: 0.10, yahooRate: 0.10, basePayRate: 0.036, basePayFixed: 40, baseServiceRate: 0.03,
  amazonReferralRate: 0.10, amazonReferralMin: 30, amazonFbaFee: 450, amazonMonthlyPerItem: 50, amazonInboundPerItem: 60,
  packingCost: 30, defaultCostShipping: 600, minProfit: 500, minMargin: 0.15, minMonthlySold: 3,
  marketFreshDays: 60, monthlyBudget: 50000, maxPerItem: 2, stockAlertDays: 30,
  rakutenAppId: '', rakutenAccessKey: '', rakutenReferer: '', yahooAppId: '', keepaKey: '', geminiKey: '', groqKey: '', groqModel: '', aiEndpoint: '/api/ai',
  // 共有DB（運営のSupabase）。publishable キーは公開前提のキーで、RLS により読み取りと追加しかできない
  supabaseUrl: 'https://iugxomihhdybqwcoccpg.supabase.co', supabaseAnonKey: 'sb_publishable_h9JwyIBE4XPtX0RI2vOmEg_xSFNyKxQ', shareMarket: true, shareNick: '', region: '',
};
export const SETTING_LABELS = {
  mercariRate: 'メルカリ販売手数料率', yahooRate: 'ヤフオク落札システム利用料率（LYPプレミアムなら0.088）',
  basePayRate: 'BASE決済手数料率', basePayFixed: 'BASE決済手数料の固定額（円）', baseServiceRate: 'BASEサービス利用料率',
  amazonReferralRate: 'Amazon販売手数料率', amazonReferralMin: 'Amazon販売手数料の最低額（円）', amazonFbaFee: 'FBA配送代行手数料（円）',
  amazonMonthlyPerItem: '大口月額の1個あたり按分（円）', amazonInboundPerItem: 'FBA納品送料 1個あたり（円）', packingCost: '梱包資材費 1個あたり（円）',
  defaultCostShipping: '「送料別」商品に足す仕入送料（円）', minProfit: '◎買いの最低利益（円）', minMargin: '◎買いの最低利益率',
  minMonthlySold: '月間販売数がこれ未満なら売れ行き注意', marketFreshDays: '相場の鮮度（日）', monthlyBudget: '月の仕入予算（円）', maxPerItem: '1商品あたりの最大仕入数', stockAlertDays: '在庫アラート（仕入れから何日で値下げ検討）',
};

export const DEFAULT_SHIP = [
  { name: 'ネコポス', fee: 210, material: 0, memo: '厚さ3cm・1kg以内（らくらくメルカリ便）' },
  { name: 'ゆうパケットポスト', fee: 215, material: 65, memo: '専用箱65円' },
  { name: 'ゆうパケット', fee: 230, material: 0, memo: '厚さ3cm・1kg以内' },
  { name: '宅急便コンパクト', fee: 450, material: 70, memo: '専用BOX70円' },
  { name: '宅急便60', fee: 750, material: 0, memo: '' }, { name: '宅急便80', fee: 850, material: 0, memo: '' },
  { name: '宅急便100', fee: 1050, material: 0, memo: '' }, { name: '宅急便120', fee: 1200, material: 0, memo: '' },
  { name: '宅急便140', fee: 1450, material: 0, memo: '' }, { name: '宅急便160', fee: 1700, material: 0, memo: '' },
];

export const DEFAULT_PROFILES = [
  { name: '楽天市場', base: 1, extra: 2, payMult: 1, value: 1, memo: '上乗せ＝自分のSPU倍率−1（楽天カード払いなら+2から）' },
  { name: 'Yahoo!ショッピング', base: 1, extra: 0, payMult: 1, value: 1, memo: 'PayPayカード等の上乗せを入力' },
  { name: 'Amazon', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'ウエルシア', base: 1, extra: 0, payMult: 1, value: 1, memo: '20日のウエル活はキャンペーンで1.5倍払い' },
  { name: 'マツキヨココカラ', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'ツルハ', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'スギ薬局', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'コストコ', base: 0, extra: 0, payMult: 1, value: 1, memo: '支払いはMastercardのみ' },
  { name: 'セカンドストリート', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'ハードオフ・オフハウス', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'トレファク', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
  { name: 'ブックオフ', base: 1, extra: 0, payMult: 1, value: 1, memo: '税抜価格の1%' },
  { name: 'NETSEA', base: 0, extra: 0, payMult: 1, value: 1, memo: '卸' },
  { name: 'メルカリ', base: 0, extra: 0, payMult: 1, value: 1, memo: '仕入れに使う場合' },
  { name: 'ヤフオク', base: 0, extra: 0, payMult: 1, value: 1, memo: '仕入れに使う場合' },
  { name: '店舗（その他）', base: 0, extra: 0, payMult: 1, value: 1, memo: '' },
];

export const DEFAULT_CAMPAIGNS = [
  { on: true, source: '楽天市場', name: '5と0のつく日', type: '毎月の日付', cond: '5,10,15,20,25,30', add: 1, payMult: 1, cap: '特典分 月1,000ptまで', entry: true, memo: '楽天カード払い＋エントリー' },
  { on: false, source: '楽天市場', name: 'お買い物マラソン（10ショップ）', type: '期間', cond: '2026-12-04 20:00〜2026-12-11 01:59', add: 9, payMult: 1, cap: '7,000ptまで', entry: true, memo: '日程は公式で確認してから有効に。買い回り店舗数−1を%に' },
  { on: true, source: 'Yahoo!ショッピング', name: '5のつく日', type: '毎月の日付', cond: '5,15,25', add: 4, payMult: 1, cap: '1,000ptまで', entry: true, memo: '' },
  { on: false, source: 'Yahoo!ショッピング', name: 'プレミアムな日曜日', type: '曜日', cond: '日', add: 5, payMult: 1, cap: '2,000ptまで', entry: true, memo: 'LYPプレミアム会員・1注文5,000円以上' },
  { on: false, source: 'Yahoo!ショッピング', name: 'ファーストデイ', type: '毎月の日付', cond: '1', add: 3, payMult: 1, cap: '2,000ptまで', entry: true, memo: '1注文3,000円以上' },
  { on: false, source: 'Yahoo!ショッピング', name: 'ヤフショ感謝デー', type: '毎月の日付', cond: '11,22', add: 4, payMult: 1, cap: '1,000ptまで', entry: true, memo: 'シルバー+4%／ゴールド+5%' },
  { on: true, source: 'ウエルシア', name: 'ウエル活（お客様感謝デー）', type: '毎月の日付', cond: '20', add: 0, payMult: 1.5, cap: '1日5,000ptまで', entry: false, memo: 'WAON POINT払いが1.5倍' },
];

// 横断検索の行き先。{q}=キーワード、{jan}=JAN（なければキーワード）
export const DEFAULT_SITES = [
  { show: true, group: '商品を特定', name: 'Google', url: 'https://www.google.com/search?q={jan}', note: '' },
  { show: true, group: '商品を特定', name: 'Googleレンズ', url: 'https://lens.google.com/', note: '写真で探す' },
  { show: true, group: '売れた実績', name: 'メルカリ売り切れ', url: 'https://jp.mercari.com/search?keyword={q}&status=sold_out', note: '' },
  { show: true, group: '売れた実績', name: 'ヤフオク落札', url: 'https://auctions.yahoo.co.jp/closedsearch/closedsearch?p={q}', note: '' },
  { show: true, group: '売れた実績', name: 'ラクマ売り切れ', url: 'https://fril.jp/s?query={q}&transaction=soldout', note: '' },
  { show: true, group: '売れた実績', name: 'Keepa', url: 'https://keepa.com/#!search/5-{jan}', note: '' },
  { show: true, group: '売れた実績', name: 'オークファン', url: 'https://www.google.com/search?q={q}+site%3Aaucfan.com', note: 'G' },
  { show: true, group: '新品', name: '楽天', url: 'https://search.rakuten.co.jp/search/mall/{q}/', note: '' },
  { show: true, group: '新品', name: 'Yahoo!ショッピング', url: 'https://shopping.yahoo.co.jp/search?p={q}', note: '' },
  { show: true, group: '新品', name: 'Amazon', url: 'https://www.amazon.co.jp/s?k={jan}', note: '' },
  { show: true, group: '新品', name: '価格.com', url: 'https://kakaku.com/search_results/{q}/', note: '' },
  { show: true, group: '新品', name: 'コストコ', url: 'https://www.costco.co.jp/search?text={q}', note: '' },
  { show: true, group: '新品', name: 'マツキヨココカラ', url: 'https://www.google.com/search?q={q}+site%3Amatsukiyococokara-online.com', note: 'G' },
  { show: true, group: '新品', name: 'チラシ（トクバイ）', url: 'https://www.google.com/search?q={q}+site%3Atokubai.co.jp', note: 'G' },
  { show: true, group: '中古', name: 'セカスト', url: 'https://www.2ndstreet.jp/search?keyword={q}', note: '' },
  { show: true, group: '中古', name: 'オフモール', url: 'https://www.google.com/search?q={q}+site%3Anetmall.hardoff.co.jp', note: 'G' },
  { show: true, group: '中古', name: 'トレファク', url: 'https://www.google.com/search?q={q}+site%3Atrefac.jp', note: 'G' },
  { show: true, group: '中古', name: 'ブックオフ', url: 'https://shopping.bookoff.co.jp/search/keyword/{q}', note: '' },
  { show: true, group: '中古', name: '駿河屋', url: 'https://www.suruga-ya.jp/search?search_word={q}', note: '' },
  { show: true, group: '卸', name: 'NETSEA', url: 'https://www.netsea.jp/search?keyword={q}', note: '' },
  { show: true, group: '卸', name: 'スーパーデリバリー', url: 'https://www.google.com/search?q={q}+site%3Asuperdelivery.com', note: 'G' },
  { show: true, group: '需要・季節', name: 'Googleトレンド', url: 'https://trends.google.co.jp/trends/explore?geo=JP&q={q}', note: '検索数の推移' },
  { show: true, group: '需要・季節', name: 'Google 直近1か月', url: 'https://www.google.com/search?q={q}&tbs=qdr:m', note: '新型・話題' },
  { show: true, group: 'SNS', name: 'X', url: 'https://x.com/search?q={q}&f=live', note: '' },
  { show: true, group: 'SNS', name: 'X 「売れた」', url: 'https://x.com/search?q={q}%20%E5%A3%B2%E3%82%8C%E3%81%9F&f=live', note: '' },
  { show: true, group: 'SNS', name: 'Instagram', url: 'https://www.instagram.com/explore/search/keyword/?q={q}', note: '' },
  { show: true, group: 'SNS', name: 'TikTok', url: 'https://www.tiktok.com/search?q={q}', note: '' },
  { show: true, group: 'SNS', name: 'YouTube', url: 'https://www.youtube.com/results?search_query={q}', note: '' },
  { show: true, group: 'SNS', name: 'Threads', url: 'https://www.threads.net/search?q={q}', note: '' },
];

export const DEFAULT_WARN = [
  { words: '第1類医薬品|第2類医薬品|指定第2類|第3類医薬品|医薬品', cat: '医薬品', msg: '医薬品の販売には許可が必要（メルカリ等でも出品禁止）' },
  { words: 'コンタクトレンズ|カラコン', cat: '医療機器', msg: 'コンタクトレンズは高度管理医療機器。販売には許可が必要' },
  { words: 'ビール|ワイン|日本酒|焼酎|ウイスキー|ウィスキー|リキュール|発泡酒|梅酒|ブランデー|シャンパン|酒', cat: '酒類', msg: '酒類を継続して販売するには酒類販売業免許が必要' },
  { words: 'たばこ|タバコ|煙草', cat: 'たばこ', msg: 'たばこは販売に許可が必要で定価販売' },
  { words: '精米|玄米|無洗米|お米|コシヒカリ|あきたこまち|ひとめぼれ', cat: '米', msg: '米穀の不正転売は規制対象' },
  { words: 'チケット|入場券|観戦券', cat: 'チケット', msg: '興行チケットの不正転売は法律で禁止' },
  { words: '冷凍|冷蔵|チルド', cat: '冷凍冷蔵食品', msg: '冷凍・冷蔵食品のネット販売は保健所への営業届出が必要' },
  { words: '小分け', cat: '小分け', msg: '化粧品の小分け販売は薬機法違反。食品の小分けは許可業種' },
  { words: 'ルイヴィトン|ヴィトン|シャネル|エルメス|ロレックス|グッチ|プラダ|オメガ', cat: 'ブランド', msg: '偽物リスク。真贋・付属品・購入証明を確認' },
];

export function pointInfo(source, dateStr, apiRate, P) {
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v))) ? d : Number(v);
  const pr = (P && P.profiles && P.profiles[source]) || { base: 0, extra: 0, payMult: 1, value: 1 };
  const toD = (s) => {
    if (s instanceof Date) return s;
    const m = String(s || '').match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null;
  };
  const day = toD(dateStr) || new Date();
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const d1 = new Date(d0.getTime() + 86400000 - 1);
  const hasApi = apiRate !== '' && apiRate != null && !isNaN(Number(apiRate)) && Number(apiRate) > 0;
  const parts = [{ name: hasApi ? 'ショップ倍率' : '基本', pct: hasApi ? Number(apiRate) : num(pr.base, 0) }];
  if (num(pr.extra, 0)) parts.push({ name: '上乗せ', pct: num(pr.extra, 0) });
  let payMult = Math.max(1, num(pr.payMult, 1));
  const notes = [];
  ((P && P.campaigns) || []).forEach((c) => {
    if (!c.on) return;
    if (c.source && c.source !== '全て' && c.source !== source) return;
    const cond = String(c.cond == null ? '' : c.cond); let hit = false;
    if (c.type === '毎日') hit = true;
    else if (c.type === '毎月の日付') hit = cond.split(/[,、\s]+/).filter(String).map(Number).indexOf(d0.getDate()) >= 0;
    else if (c.type === '曜日') hit = cond.indexOf('日月火水木金土'.charAt(d0.getDay())) >= 0;
    else if (c.type === '期間') {
      const se = cond.split(/〜|～|~/);
      const s = toD(se[0]); let e = toD(se[1]);
      if (e && !/\d{1,2}:\d{2}/.test(se[1] || '')) e = new Date(e.getTime() + 86400000 - 1);
      hit = !!(s && e && s <= d1 && e >= d0);
    }
    if (!hit) return;
    if (num(c.add, 0)) parts.push({ name: c.name, pct: num(c.add, 0) });
    if (num(c.payMult, 1) > payMult) payMult = num(c.payMult, 1);
    notes.push([c.name, c.cap ? '上限 ' + c.cap : '', c.entry ? '要エントリー' : ''].filter(String).join('・'));
  });
  const pct = Math.round(parts.reduce((a, b) => a + b.pct, 0) * 100) / 100;
  const value = num(pr.value, 1);
  return { pct, effPct: Math.round(pct * value * 100) / 100, payMult, value, parts, notes };
}

export function calcProfit(p, s) {
  const n = (v) => (v === '' || v == null || isNaN(Number(v))) ? 0 : Number(v);
  const cost = n(p.cost), costShip = n(p.costShipping), pt = n(p.pointRate), sell = n(p.sellPrice);
  const m = n(p.payMult) > 1 ? n(p.payMult) : 1;
  const ch = p.channel || 'メルカリ';
  const sh = (s.ship && s.ship[p.shipMethod]) || { fee: 0, material: 0 };
  const pointOf = (c) => m > 1 ? 0 : Math.floor(c / 1.1 * pt / 100);
  const effOf = (c) => Math.round(c / m) + costShip - pointOf(c);
  const feeOf = (price) => {
    if (ch === 'Amazon') {
      const rate = n(p.referralRate) > 0 ? n(p.referralRate) : n(s.amazonReferralRate);
      const fba = n(p.fbaFee) > 0 ? n(p.fbaFee) : n(s.amazonFbaFee);
      return Math.max(Math.floor(price * rate), n(s.amazonReferralMin)) + fba + n(s.amazonMonthlyPerItem);
    }
    if (ch === 'ヤフオク') return Math.floor(price * n(s.yahooRate));
    if (ch === 'BASE') return Math.ceil(price * n(s.basePayRate) + n(s.basePayFixed)) + Math.ceil(price * n(s.baseServiceRate));
    return Math.floor(price * n(s.mercariRate));
  };
  const ship = ch === 'Amazon' ? n(s.amazonInboundPerItem) : n(sh.fee) + n(sh.material);
  const pack = ch === 'Amazon' ? 0 : n(s.packingCost);
  const point = pointOf(cost), effCost = effOf(cost);
  if (sell <= 0) return { point, effCost, fee: 0, ship, pack, net: null, profit: null, margin: null, roi: null, maxBuy: null, judge: '相場未入力' };
  const fee = feeOf(sell);
  const net = sell - fee - ship - pack;
  const profit = net - effCost;
  const margin = profit / sell;
  const roi = effCost > 0 ? profit / effCost : null;
  const target = Math.max(n(s.minProfit), Math.ceil(sell * n(s.minMargin)));
  const k = 1 / m - (m > 1 ? 0 : pt / 110);
  let maxBuy = 0;
  if (k > 0) {
    let c = Math.max(0, Math.floor((net - costShip - target) / k)), g = 0;
    while (c > 0 && net - effOf(c) < target && g++ < 300) c--;
    g = 0;
    while (net - effOf(c + 1) >= target && g++ < 300) c++;
    maxBuy = net - effOf(c) >= target ? c : 0;
  }
  let judge;
  if (profit >= n(s.minProfit) && margin >= n(s.minMargin)) judge = '◎買い';
  else if (profit > 0) judge = '△薄利';
  else judge = '×赤字';
  const ms = p.monthlySold;
  if (judge === '◎買い' && ms !== '' && ms != null && !isNaN(Number(ms)) && Number(ms) < n(s.minMonthlySold)) judge = '○売れ行き注意';
  return { point, effCost, fee, ship, pack, net, profit, margin, roi, maxBuy, judge };
}

export function checkWarn(text, rules) {
  const t = String(text || '').toLowerCase(), out = [];
  (rules || []).forEach((r) => {
    const words = String(r.words || '').split('|').filter(String);
    for (const w of words) { if (t.indexOf(w.toLowerCase()) >= 0) { out.push({ cat: r.cat, word: w, msg: r.msg }); break; } }
  });
  return out;
}

// 商品名・説明文から JAN(13桁, 45/49始まり) をチェックディジット検証付きで抜き出す
export function extractJan(text) {
  const m = String(text || '').match(/(?:^|\D)(4[59]\d{11})(?!\d)/g) || [];
  for (const raw of m) {
    const c = raw.replace(/\D/g, '');
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(c[i]) * (i % 2 ? 3 : 1);
    if ((10 - sum % 10) % 10 === Number(c[12])) return c;
  }
  return '';
}

export function isValidJan(code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 13 && code.length !== 8) return false;
  let sum = 0;
  for (let i = 0; i < code.length - 1; i++) sum += Number(code[i]) * ((code.length - 1 - i) % 2 ? 3 : 1);
  return (10 - sum % 10) % 10 === Number(code[code.length - 1]);
}

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const yen = (v) => (v == null || v === '' || isNaN(Number(v))) ? '-' : Math.round(Number(v)).toLocaleString('ja-JP') + '円';
export const pct = (v) => (v == null || v === '' || isNaN(Number(v))) ? '-' : (Number(v) * 100).toFixed(1) + '%';
