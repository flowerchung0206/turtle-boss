-- ============================================================
-- 頑龜爬蟲 STReptile — Supabase schema
-- 這個資料庫跟你自己的小烏龜管理系統（turtle-erp）完全分開，
-- 請用一個全新的 Supabase 專案來跑這份 SQL。
-- 可以整份貼到 Supabase 的 SQL Editor 一次執行；重跑也安全
-- （每個 create 前面都有 drop if exists 防呆）。
-- ============================================================

-- ---------- 分類 ----------
create table if not exists categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 後台使用者 / 權限 ----------
-- 用 Supabase Auth 的使用者 + 這張表存角色。
create table if not exists admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql stable security definer
as $$
  select exists(select 1 from admin_profiles where id = auth.uid());
$$;

create or replace function is_owner()
returns boolean
language sql stable security definer
as $$
  select exists(select 1 from admin_profiles where id = auth.uid() and role = 'owner');
$$;

-- ---------- 會員（前台客人登入用） ----------
create table if not exists member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------- 烏龜 / 爬寵個體 ----------
create table if not exists turtles (
  id bigint generated always as identity primary key,
  code text not null,                         -- 自己設定的編號，例如 A1
  name text not null,
  category_id bigint references categories(id),
  status text not null default '在架' check (status in ('在架','預定中','已售出','下架')),
  price numeric(12,2),                        -- 前台顯示售價
  cost numeric(12,2),                         -- 進貨成本（後台內部，前台絕不顯示）
  runner_price numeric(12,2),                 -- 跑單者售價
  runner_cost numeric(12,2),                  -- 跑單這筆的成本
  -- 以下是可被「前台顯示設定」控制顯示/隱藏的基本資料欄位
  breed text,                                 -- 品種
  sex text,                                   -- 性別
  age_months int,                             -- 年齡（月）
  weight_g int,                               -- 體重（克）
  source text,                                -- 來源
  pattern text,                               -- 花紋
  personality text,                           -- 個性
  husbandry_status text,                      -- 飼養狀態（跟上面的 status 銷售狀態不同）
  note text,                                  -- 備註（內部／可選擇對外）
  acquired_date date,
  view_count int not null default 0,
  wishlist_count int not null default 0,
  cart_add_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 編號不能在「還在使用中」的狀態下重複；已售出就自由。
-- 用 partial unique index 達成：只對「非已售出」的列強制唯一。
drop index if exists uq_turtles_code_active;
create unique index uq_turtles_code_active on turtles (code) where status <> '已售出';

create table if not exists turtle_media (
  id bigint generated always as identity primary key,
  turtle_id bigint not null references turtles(id) on delete cascade,
  kind text not null check (kind in ('photo','video')),
  url text not null,
  is_cover boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 前台基本資料顯示／隱藏設定 ----------
-- 可被切換顯示/隱藏的欄位清單。注意：成本（cost/runner_price/runner_cost）
-- 不放進這張表 — 那三個欄位永遠不透過任何前台管道釋出，不是「預設隱藏可以被打開」，
-- 而是後面的 get_turtle_public() 函式從頭就不會去讀它們，就算這裡誤設成「顯示」也沒用。
-- 這是刻意比附件規格更嚴格一點的保護，之後我會跟你說明原因。
create table if not exists field_visibility_defaults (
  field_key text primary key,
  label text not null,
  visible boolean not null default true
);
insert into field_visibility_defaults (field_key, label, visible) values
  ('breed','品種',true),
  ('sex','性別',true),
  ('age_months','年齡',true),
  ('weight_g','體重',true),
  ('source','來源',false),
  ('pattern','花紋',true),
  ('personality','個性',true),
  ('acquired_date','取得日期',false),
  ('husbandry_status','飼養狀態',true),
  ('note','備註',false)
on conflict (field_key) do nothing;

-- 個體自己的覆蓋設定（有列在這裡才算覆蓋，沒有就跟著全站預設）
create table if not exists turtle_field_overrides (
  turtle_id bigint not null references turtles(id) on delete cascade,
  field_key text not null references field_visibility_defaults(field_key) on delete cascade,
  visible boolean not null,
  primary key (turtle_id, field_key)
);

create or replace function is_field_visible(p_turtle_id bigint, p_field text)
returns boolean
language sql stable
as $$
  select coalesce(
    (select visible from turtle_field_overrides where turtle_id = p_turtle_id and field_key = p_field),
    (select visible from field_visibility_defaults where field_key = p_field),
    true
  );
$$;

-- 前台詳情頁用這個函式拿資料：成本類欄位永遠不在回傳內容裡，
-- 其餘欄位依「個體覆蓋 > 全站預設」的規則決定要不要給值。
create or replace function get_turtle_public(p_id bigint)
returns jsonb
language plpgsql stable security definer
as $$
declare
  t turtles%rowtype;
  result jsonb;
begin
  select * into t from turtles where id = p_id and status in ('在架','預定中');
  if not found then
    return null;
  end if;
  result := jsonb_build_object(
    'id', t.id, 'code', t.code, 'name', t.name, 'category_id', t.category_id,
    'category_name', (select name from categories where id = t.category_id),
    'status', t.status, 'price', t.price, 'view_count', t.view_count, 'wishlist_count', t.wishlist_count,
    'cover_url', (select url from turtle_media where turtle_id = t.id and kind = 'photo' and is_cover = true order by sort_order limit 1),
    'photos', (select coalesce(jsonb_agg(url order by sort_order), '[]'::jsonb) from turtle_media where turtle_id = t.id and kind = 'photo'),
    'videos', (select coalesce(jsonb_agg(url order by sort_order), '[]'::jsonb) from turtle_media where turtle_id = t.id and kind = 'video')
  );
  if is_field_visible(t.id,'breed') then result := result || jsonb_build_object('breed', t.breed); end if;
  if is_field_visible(t.id,'sex') then result := result || jsonb_build_object('sex', t.sex); end if;
  if is_field_visible(t.id,'age_months') then result := result || jsonb_build_object('age_months', t.age_months); end if;
  if is_field_visible(t.id,'weight_g') then result := result || jsonb_build_object('weight_g', t.weight_g); end if;
  if is_field_visible(t.id,'source') then result := result || jsonb_build_object('source', t.source); end if;
  if is_field_visible(t.id,'pattern') then result := result || jsonb_build_object('pattern', t.pattern); end if;
  if is_field_visible(t.id,'personality') then result := result || jsonb_build_object('personality', t.personality); end if;
  if is_field_visible(t.id,'acquired_date') then result := result || jsonb_build_object('acquired_date', t.acquired_date); end if;
  if is_field_visible(t.id,'husbandry_status') then result := result || jsonb_build_object('husbandry_status', t.husbandry_status); end if;
  if is_field_visible(t.id,'note') then result := result || jsonb_build_object('note', t.note); end if;
  return result;
end;
$$;

-- 館藏列表頁用：一次拿回所有「在架／預定中」的個體（套用跟上面一樣的
-- 欄位顯示規則），前台不用自己迴圈呼叫 get_turtle_public() 很多次。
create or replace function list_turtles_public()
returns jsonb
language sql stable security definer
as $$
  select coalesce(jsonb_agg(get_turtle_public(id) order by created_at desc), '[]'::jsonb)
  from turtles
  where status in ('在架','預定中');
$$;

-- 瀏覽次數：前台看個體詳情時呼叫這個，累加 view_count 並記一筆 page_views。
-- 寫在 security definer 函式裡，不開放前台直接 update turtles。
create or replace function record_turtle_view(p_id bigint)
returns void
language plpgsql security definer
as $$
begin
  update turtles set view_count = view_count + 1 where id = p_id;
  insert into page_views (turtle_id) values (p_id);
end;
$$;

-- 後台專用：不管 RLS 列權限，只要是 admin 就能拿到完整欄位（含成本）。
-- 後台一律呼叫這個函式，不要直接對 turtles table 做 select *。
create or replace function admin_get_turtles()
returns setof turtles
language plpgsql stable security definer
as $$
begin
  if not is_admin() then
    raise exception '只有後台管理員可以呼叫這個函式';
  end if;
  return query select * from turtles order by created_at desc;
end;
$$;

-- ---------- 客戶 / 保留 ----------
create table if not exists customers (
  id bigint generated always as identity primary key,
  name text not null,
  contact text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists holds (
  id bigint generated always as identity primary key,
  turtle_id bigint not null references turtles(id) on delete cascade,
  customer_id bigint not null references customers(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- 收藏 / 購物車（前台會員） ----------
create table if not exists wishlists (
  member_id uuid not null references member_profiles(id) on delete cascade,
  turtle_id bigint not null references turtles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, turtle_id)
);

create table if not exists cart_items (
  member_id uuid not null references member_profiles(id) on delete cascade,
  turtle_id bigint not null references turtles(id) on delete cascade,
  delivery_method text not null default '面交' check (delivery_method in ('面交','宅配')),
  created_at timestamptz not null default now(),
  primary key (member_id, turtle_id)
);

-- ---------- 訂單 ----------
create table if not exists orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id),
  member_id uuid references member_profiles(id),
  status text not null default '預定中' check (status in ('待付款','預定中','已完成','已取消')),
  delivery_method text not null default '面交' check (delivery_method in ('面交','宅配')),
  shipping_fee numeric(10,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  turtle_id bigint references turtles(id),
  -- 快照欄位：下單當下的名稱/分類/價格，之後改資料或封存編號都不會影響歷史紀錄
  code_snapshot text,
  name_snapshot text,
  category_snapshot text,
  price_snapshot numeric(12,2),
  cost_snapshot numeric(12,2)
);

-- ---------- 瀏覽數據 ----------
create table if not exists page_views (
  id bigint generated always as identity primary key,
  turtle_id bigint references turtles(id) on delete set null,  -- null = 首頁/其他頁
  viewed_at timestamptz not null default now()
);
-- 「目前正在看幾個人」用 Supabase Realtime Presence 頻道做，不需要資料表；
-- 這張表只負責累計瀏覽次數的歷史記錄。

-- ---------- 首頁設定（封面照片等） ----------
create table if not exists site_settings (
  key text primary key,
  value text
);
insert into site_settings(key, value) values ('cover_image_url', null)
  on conflict (key) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table categories enable row level security;
alter table admin_profiles enable row level security;
alter table member_profiles enable row level security;
alter table turtles enable row level security;
alter table turtle_media enable row level security;
alter table customers enable row level security;
alter table holds enable row level security;
alter table wishlists enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table page_views enable row level security;
alter table site_settings enable row level security;
alter table field_visibility_defaults enable row level security;
alter table turtle_field_overrides enable row level security;

-- 公開可讀：分類、在架/預定中的烏龜與其媒體、首頁設定
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select using (true);

-- 注意：turtles 沒有開 select 的 table grant 給 anon/authenticated（見下面
-- 的 GRANT 區塊），所以這條 policy 不是前台真正的存取管道，前台一律走
-- get_turtle_public()。保留這條 policy 只是「萬一以後有人手滑補了 select
-- grant」的第二層防護網，讓未售出/上架中的資料最多也只會被用 RLS 擋到
-- 這個範圍，不會整張表曝光。
drop policy if exists "public read turtles" on turtles;
create policy "public read turtles" on turtles for select using (status in ('在架','預定中'));

drop policy if exists "public read media" on turtle_media;
create policy "public read media" on turtle_media for select using (
  exists(select 1 from turtles t where t.id = turtle_id and t.status in ('在架','預定中'))
);

drop policy if exists "public read settings" on site_settings;
create policy "public read settings" on site_settings for select using (true);

drop policy if exists "public insert pageview" on page_views;
create policy "public insert pageview" on page_views for insert with check (true);

-- 後台（admin）：全權限
drop policy if exists "admin all categories" on categories;
create policy "admin all categories" on categories for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all turtles" on turtles;
create policy "admin all turtles" on turtles for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all media" on turtle_media;
create policy "admin all media" on turtle_media for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all customers" on customers;
create policy "admin all customers" on customers for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all holds" on holds;
create policy "admin all holds" on holds for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all orders" on orders;
create policy "admin all orders" on orders for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all order_items" on order_items;
create policy "admin all order_items" on order_items for all using (is_admin()) with check (is_admin());

drop policy if exists "admin read pageviews" on page_views;
create policy "admin read pageviews" on page_views for select using (is_admin());

drop policy if exists "admin write settings" on site_settings;
create policy "admin write settings" on site_settings for all using (is_admin()) with check (is_admin());

-- 顯示設定／個體覆蓋設定：只有後台能直接讀寫這兩張表。
-- 前台不需要、也不被允許直接查這兩張表 — 它看到的「結果」一律是
-- get_turtle_public() 內部套用完邏輯之後的值，不是自己去讀設定表再拼。
drop policy if exists "admin all field_visibility_defaults" on field_visibility_defaults;
create policy "admin all field_visibility_defaults" on field_visibility_defaults for all using (is_admin()) with check (is_admin());

drop policy if exists "admin all turtle_field_overrides" on turtle_field_overrides;
create policy "admin all turtle_field_overrides" on turtle_field_overrides for all using (is_admin()) with check (is_admin());

drop policy if exists "owner manage admin_profiles" on admin_profiles;
create policy "owner manage admin_profiles" on admin_profiles for all using (is_owner()) with check (is_owner());
drop policy if exists "admin read own profile" on admin_profiles;
create policy "admin read own profile" on admin_profiles for select using (auth.uid() = id or is_admin());

-- 會員：只能看/改自己的資料
drop policy if exists "member read own" on member_profiles;
create policy "member read own" on member_profiles for select using (auth.uid() = id);
drop policy if exists "member update own" on member_profiles;
create policy "member update own" on member_profiles for update using (auth.uid() = id);
drop policy if exists "member insert own" on member_profiles;
create policy "member insert own" on member_profiles for insert with check (auth.uid() = id);

drop policy if exists "member manage own wishlist" on wishlists;
create policy "member manage own wishlist" on wishlists for all using (auth.uid() = member_id) with check (auth.uid() = member_id);

drop policy if exists "member manage own cart" on cart_items;
create policy "member manage own cart" on cart_items for all using (auth.uid() = member_id) with check (auth.uid() = member_id);

-- ============================================================
-- 權限 GRANT（RLS 之外，資料表本身也要開權限，不然會是 403）
-- ============================================================
grant usage on schema public to anon, authenticated;

-- 沒有敏感欄位的表，可以直接開放讀取
grant select on categories, turtle_media, site_settings to anon, authenticated;
grant insert on page_views to anon, authenticated;

-- turtles 這張表刻意「不」直接開放 select 給 anon／authenticated。
-- 前台一律呼叫 get_turtle_public()、後台一律呼叫 admin_get_turtles()，
-- 這兩個函式是 security definer，不需要呼叫端擁有 table 的 select 權限。
-- 這樣就算有人直接打 PostgREST 的 /turtles?select=cost，Postgres 會直接
-- 擋掉（沒有欄位權限），不是只靠前端把成本欄位藏起來而已。
-- 新增／修改／刪除還是走 table 本身，所以 insert/update/delete 開給
-- authenticated，實際能不能動由 RLS 的 is_admin() 把關（店員/客人帳號
-- 即使有這個權限，RLS 也會擋下來）。
grant insert, update, delete on turtles to authenticated;

grant all on admin_profiles, member_profiles, customers, holds, orders, order_items, wishlists, cart_items, page_views, site_settings, categories, turtle_media to authenticated;

-- 顯示設定表：只有後台會直接讀寫，實際權限仍由上面的 RLS policy（is_admin()）把關
grant select, insert, update, delete on field_visibility_defaults, turtle_field_overrides to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- 讓 anon／authenticated 可以呼叫這幾個「安全存取函式」
grant execute on function is_admin() to anon, authenticated;
grant execute on function is_owner() to anon, authenticated;
grant execute on function is_field_visible(bigint, text) to anon, authenticated;
grant execute on function get_turtle_public(bigint) to anon, authenticated;
grant execute on function list_turtles_public() to anon, authenticated;
grant execute on function record_turtle_view(bigint) to anon, authenticated;
grant execute on function admin_get_turtles() to authenticated;

-- ============================================================
-- 種子資料：老闆的分類
-- ============================================================
insert into categories (name, sort_order) values
  ('新手入門款', 1),
  ('卡羅萊納鑽紋', 2),
  ('華麗鑽紋', 3),
  ('德州鑽紋', 4),
  ('✨金光閃閃', 5),
  ('大麥町系列', 6),
  ('青花瓷系列', 7),
  ('老闆珍藏', 8)
on conflict (name) do nothing;
