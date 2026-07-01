create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  bio_user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  unique(bio_user_id, endpoint)
);

alter table push_subscriptions enable row level security;
create policy "service role only" on push_subscriptions using (false);
