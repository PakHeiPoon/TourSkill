create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.merchants (
  id bigserial primary key,
  merchant_id text not null unique,
  did text not null unique,
  merchant_type text not null check (merchant_type in ('hotel', 'restaurant', 'attraction', 'shop')),
  name_en text not null,
  name_zh text not null,
  description_en text not null,
  description_zh text not null,
  city text not null,
  country text not null default 'CN',
  address text not null,
  latitude double precision,
  longitude double precision,
  contact_phone text not null,
  contact_email text not null,
  opening_hours text not null,
  website_url text,
  price_level smallint check (price_level between 1 and 5),
  tags text[] not null default '{}',
  languages_supported text[] not null default '{}',
  supported_skills text[] not null default '{}',
  specific_fields jsonb not null default '{}'::jsonb,
  wallet_address text not null,
  profile_hash text,
  profile_uri text,
  skill_endpoint text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_merchants_city on public.merchants (city);
create index if not exists idx_merchants_type on public.merchants (merchant_type);
create index if not exists idx_merchants_status_created on public.merchants (status, created_at desc);
create index if not exists idx_merchants_name_en_trgm on public.merchants using gin (name_en gin_trgm_ops);
create index if not exists idx_merchants_name_zh_trgm on public.merchants using gin (name_zh gin_trgm_ops);

alter table public.merchants enable row level security;

drop policy if exists "public read active merchants" on public.merchants;
create policy "public read active merchants"
on public.merchants
for select
using (status = 'active');

drop policy if exists "service role manage merchants" on public.merchants;
create policy "service role manage merchants"
on public.merchants
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
