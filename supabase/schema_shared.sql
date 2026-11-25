-- みんなの相場DB・セールカレンダー（v1.5：匿名で読み書き）
-- Supabase の SQL Editor にそのまま貼って実行する。
-- v2 で Google ログインを入れたら、insert を認証ユーザーに限定し user_id を追加する。

-- 部分一致検索用
create extension if not exists pg_trgm;

create table if not exists market_shared (
  id bigserial primary key,
  jan text,
  keyword text,
  channel text not null,
  price int not null check (price between 100 and 5000000),
  monthly int,
  region text,
  nick text,
  created_at timestamptz default now()
);
create index if not exists market_shared_jan_idx on market_shared (jan, created_at desc);
create index if not exists market_shared_kw_idx on market_shared using gin (keyword gin_trgm_ops);

create table if not exists sale_calendar (
  id bigserial primary key,
  store text not null,
  title text not null,
  detail text,
  start_date date not null,
  end_date date not null,
  region text,
  nick text,
  created_at timestamptz default now()
);
create index if not exists sale_calendar_date_idx on sale_calendar (start_date, end_date);

-- 誰でも読める・誰でも追加できる（更新・削除は不可）。荒らし対策は v2 でログイン必須にする。
alter table market_shared enable row level security;
alter table sale_calendar enable row level security;
create policy "read all" on market_shared for select using (true);
create policy "insert anon" on market_shared for insert with check (true);
create policy "read all" on sale_calendar for select using (true);
create policy "insert anon" on sale_calendar for insert with check (true);

-- 1時間に同じ anon からの大量投稿を抑える簡易策（Supabase 側の API レート制限も併用）
-- 必要になったら: create policy ... with check (( select count(*) from market_shared where created_at > now() - interval '1 hour') < 5000);
