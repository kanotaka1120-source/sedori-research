// 保存層：v1はブラウザのIndexedDB。後でSupabaseアダプタに差し替えられるよう、ここだけが保存先を知っている
import { DEFAULT_SETTINGS, DEFAULT_SHIP, DEFAULT_PROFILES, DEFAULT_CAMPAIGNS, DEFAULT_SITES, DEFAULT_WARN } from './calc.js';

const DB_NAME = 'sedori-research', DB_VER = 1;
const STORES = ['candidates', 'market', 'history', 'kv'];

function openDb() {
  return new Promise((ok, ng) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ng(req.error);
  });
}
let dbp = null;
const db = () => (dbp = dbp || openDb());

function tx(store, mode, fn) {
  return db().then((d) => new Promise((ok, ng) => {
    const t = d.transaction(store, mode), os = t.objectStore(store);
    const r = fn(os);
    t.oncomplete = () => ok(r && r.result !== undefined ? r.result : r);
    t.onerror = () => ng(t.error);
  }));
}
const getAll = (store) => tx(store, 'readonly', (os) => os.getAll()).then((r) => r || []);
const put = (store, obj) => tx(store, 'readwrite', (os) => os.put(obj)).then(() => obj);
const del = (store, id) => tx(store, 'readwrite', (os) => os.delete(id));
const get = (store, id) => tx(store, 'readonly', (os) => os.get(id));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 12);
const now = () => new Date().toISOString();

// ---- 設定（kvストア） ----
const KV_DEFAULTS = { settings: DEFAULT_SETTINGS, ship: DEFAULT_SHIP, profiles: DEFAULT_PROFILES, campaigns: DEFAULT_CAMPAIGNS, sites: DEFAULT_SITES, warn: DEFAULT_WARN };
const cache = {};
export async function loadConfig() {
  for (const k of Object.keys(KV_DEFAULTS)) {
    const row = await get('kv', k);
    const v = row ? row.value : null;
    cache[k] = k === 'settings' ? Object.assign({}, KV_DEFAULTS.settings, v || {}) : (v || JSON.parse(JSON.stringify(KV_DEFAULTS[k])));
  }
  return config();
}
export function config() {
  const s = Object.assign({}, cache.settings);
  s.ship = {};
  (cache.ship || []).forEach((r) => { if (r.name) s.ship[r.name] = { fee: Number(r.fee) || 0, material: Number(r.material) || 0 }; });
  const profiles = {};
  (cache.profiles || []).forEach((p) => { if (p.name) profiles[p.name] = p; });
  return { s, P: { profiles, campaigns: cache.campaigns || [] }, shipList: cache.ship || [], profileList: cache.profiles || [], sites: cache.sites || [], warn: cache.warn || [] };
}
export async function saveConfig(key, value) {
  cache[key] = value;
  await put('kv', { id: key, value });
  return config();
}
export async function resetConfig(key) { return saveConfig(key, JSON.parse(JSON.stringify(KV_DEFAULTS[key]))); }

// ---- 候補・実績 ----
export async function listCandidates() {
  const all = await getAll('candidates');
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
export async function saveCandidate(c) {
  const row = Object.assign({ id: uid(), createdAt: now(), status: '検討中' }, c, { updatedAt: now() });
  const today = row.updatedAt.slice(0, 10);
  if (['購入済', '出品中', '売却済'].includes(row.status) && !row.buyDate) row.buyDate = today;
  if (row.status === '売却済' && !row.soldDate) row.soldDate = today;
  return put('candidates', row);
}
export const deleteCandidate = (id) => del('candidates', id);
export const getCandidate = (id) => get('candidates', id);

// ---- 相場DB ----
export async function saveMarket(entries) {
  const rows = [];
  for (const e of entries) {
    if (!e || !e.channel || !(Number(e.price) > 0)) continue;
    rows.push(await put('market', Object.assign({ id: uid(), createdAt: now() }, e, { price: Number(e.price) })));
  }
  return rows;
}
export async function findMarket({ keyword, jan }) {
  keyword = String(keyword || '').trim(); jan = String(jan || '').trim();
  if (!keyword && !jan) return {};
  const all = await getAll('market'), out = {};
  all.forEach((r) => {
    const hit = (jan && r.jan && r.jan === jan) || (keyword && r.keyword && r.keyword === keyword);
    if (!hit) return;
    if (!out[r.channel] || out[r.channel].createdAt < r.createdAt) out[r.channel] = r;
  });
  Object.values(out).forEach((r) => { r.days = Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 86400000); });
  return out;
}

// ---- 調べた履歴 ----
export async function addHistory(h) {
  const row = Object.assign({ id: uid(), createdAt: now() }, h);
  await put('history', row);
  const all = await getAll('history');
  if (all.length > 300) {
    all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const r of all.slice(0, all.length - 300)) await del('history', r.id);
  }
  return row;
}
export async function listHistory(n = 50) {
  const all = await getAll('history');
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, n);
}

// ---- バックアップ ----
export async function exportAll() {
  const out = { exportedAt: now(), version: 1 };
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}
export async function importAll(data) {
  let n = 0;
  for (const s of STORES) for (const row of (data[s] || [])) { if (row && row.id) { await put(s, row); n++; } }
  await loadConfig();
  return n;
}
export function toCsv(rows, cols) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.map((c) => esc(c.label)).join(',')].concat(rows.map((r) => cols.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))).join('\n');
}
