-- v2（ユーザーごとのデータ分離）用のスキーマ。v1はブラウザ保存なので未使用。
create table if not exists items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text, model text, jan text, category text, photo_url text, ai_notes text, created_at timestamptz default now());
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references items(id), source text, cost int, cost_shipping int default 0, point_rate numeric default 0, pay_mult numeric default 1,
  channel text, sell_price int, ship_method text, monthly_sold int, prices jsonb, result jsonb, judge text, warn text,
  status text default '検討中', buy_date date, actual int, sold_date date, actual_profit int, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists market_prices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  keyword text, jan text, channel text, price int, monthly int, memo text, created_at timestamptz default now());
create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  keyword text, ng text, min_price int, max_price int, mall text, channel text, sell_price int, ship_method text, monthly_sold int, last_checked timestamptz, created_at timestamptz default now());
create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade, settings jsonb, ship jsonb, profiles jsonb, campaigns jsonb, sites jsonb, warn jsonb, updated_at timestamptz default now());
create table if not exists ai_usage (
  id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, task text, input_tokens int, output_tokens int, cost_jpy numeric, created_at timestamptz default now());
-- 本人以外は読めない
alter table items enable row level security; alter table candidates enable row level security; alter table market_prices enable row level security;
alter table watchlist enable row level security; alter table settings enable row level security; alter table ai_usage enable row level security;
do $$ declare t text; begin
  foreach t in array array['items','candidates','market_prices','watchlist','settings','ai_usage'] loop
    execute format('create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop; end $$;
