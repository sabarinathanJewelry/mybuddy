-- 133: Digital signage system — poster templates, posters, playlists, channels, devices
--
-- TV devices never receive a Supabase Auth session (this schema's RLS is permissive
-- "authenticated = full access" on almost every business table, and handle_new_user()
-- auto-creates a staff profile for any new auth.users row, including anonymous
-- sign-ins — so an authenticated TV session would end up with full ERP access).
-- Devices instead authenticate to the /api/signage/* routes with a per-device
-- secret (device_secret), which those routes check server-side with the service
-- role client. All tables below are readable/writable by staff (authenticated)
-- for CMS management; devices never talk to Postgres directly.

create table poster_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  aspect_ratio       text not null check (aspect_ratio in ('9:16','16:9','1:1')),
  width_px           integer not null,
  height_px          integer not null,
  ai_prompt_template text not null,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- Generated posters — at most one 'ready' row per template at a time
create table posters (
  id             uuid primary key default gen_random_uuid(),
  template_id    uuid not null references poster_templates(id) on delete cascade,
  board_rate_id  bigint references board_rates(id) on delete set null,
  image_url      text,
  status         text not null default 'generating' check (status in ('generating','ready','failed')),
  generated_at   timestamptz not null default now(),
  superseded_at  timestamptz
);
create index idx_posters_template_status on posters(template_id, status, generated_at desc);

create table playlists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table playlist_items (
  id                 uuid primary key default gen_random_uuid(),
  playlist_id        uuid not null references playlists(id) on delete cascade,
  order_index        integer not null default 0,
  item_type          text not null check (item_type in ('live_poster','image','video')),
  poster_template_id uuid references poster_templates(id) on delete cascade,
  media_url          text,
  duration_seconds   integer not null default 10,
  active             boolean not null default true,
  constraint chk_playlist_item_source check (
    (item_type = 'live_poster' and poster_template_id is not null and media_url is null)
    or (item_type in ('image','video') and media_url is not null and poster_template_id is null)
  )
);
create index idx_playlist_items_playlist on playlist_items(playlist_id, order_index);

create table channels (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Zones are percentage rectangles of the screen — generalizes every requested
-- layout (full screen, horizontal/vertical splits, 50/50, 20/80, ...) without
-- an enum per shape. The CMS offers layout presets that just insert these rows.
create table channel_zones (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references channels(id) on delete cascade,
  zone_index  integer not null default 0,
  playlist_id uuid references playlists(id) on delete set null,
  x_pct       numeric(5,2) not null default 0,
  y_pct       numeric(5,2) not null default 0,
  w_pct       numeric(5,2) not null default 100,
  h_pct       numeric(5,2) not null default 100
);
create index idx_channel_zones_channel on channel_zones(channel_id, zone_index);

create table devices (
  id            uuid primary key default gen_random_uuid(),
  name          text,
  location      text,
  pairing_code  text unique,
  device_secret text unique,
  channel_id    uuid references channels(id) on delete set null,
  status        text not null default 'pending' check (status in ('pending','paired')),
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

alter table poster_templates enable row level security;
alter table posters           enable row level security;
alter table playlists         enable row level security;
alter table playlist_items    enable row level security;
alter table channels          enable row level security;
alter table channel_zones     enable row level security;
alter table devices           enable row level security;

create policy "auth_all" on poster_templates for all to authenticated using (true) with check (true);
create policy "auth_all" on posters           for all to authenticated using (true) with check (true);
create policy "auth_all" on playlists         for all to authenticated using (true) with check (true);
create policy "auth_all" on playlist_items    for all to authenticated using (true) with check (true);
create policy "auth_all" on channels          for all to authenticated using (true) with check (true);
create policy "auth_all" on channel_zones     for all to authenticated using (true) with check (true);
create policy "auth_all" on devices           for all to authenticated using (true) with check (true);
-- No policy grants devices/anon access — device_secret is never exposed to the
-- authenticated-all policy's callers because /api/signage/* routes use the
-- service-role client and select only the columns each response needs.

-- Resolves a device's full playout in one round trip: channel -> zones -> playlist
-- -> items, with live_poster items resolved to that template's current ready poster.
create or replace function get_device_playout(p_device_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'device_id', d.id,
    'channel_id', d.channel_id,
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'zone_index', z.zone_index,
        'x_pct', z.x_pct, 'y_pct', z.y_pct, 'w_pct', z.w_pct, 'h_pct', z.h_pct,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'order_index', pi.order_index,
            'item_type', pi.item_type,
            'duration_seconds', pi.duration_seconds,
            'media_url', case when pi.item_type = 'live_poster' then
              (select p.image_url from posters p
               where p.template_id = pi.poster_template_id and p.status = 'ready'
               order by p.generated_at desc limit 1)
              else pi.media_url end
          ) order by pi.order_index)
          from playlist_items pi
          where pi.playlist_id = z.playlist_id and pi.active
        ), '[]'::jsonb)
      ) order by z.zone_index)
      from channel_zones z
      where z.channel_id = d.channel_id
    ), '[]'::jsonb)
  )
  from devices d
  where d.id = p_device_id;
$$;

-- Fires after a new board rate is saved so posters regenerate even if the
-- staff member closes the browser right after saving. Mirrors the pg_cron +
-- pg_net pattern already used in 096_weekoff_reminder_cron.sql.
-- Replace YOUR_APP_URL and YOUR_POSTER_GEN_SECRET before running.
create or replace function notify_board_rate_poster_regen()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url     := 'https://YOUR_APP_URL/api/posters/generate',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_POSTER_GEN_SECRET',
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object('board_rate_id', new.id)
  );
  return new;
end;
$$;

create trigger trg_board_rate_poster_regen
  after insert on board_rates
  for each row execute procedure notify_board_rate_poster_regen();
