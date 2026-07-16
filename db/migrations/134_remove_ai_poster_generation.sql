-- 134: Remove AI poster generation — not using the OpenAI API for now.
-- Signage stays manual: staff generate images/videos elsewhere and upload them
-- directly as playlist items (see app/(app)/admin/signage/playlists).

drop trigger if exists trg_board_rate_poster_regen on board_rates;
drop function if exists notify_board_rate_poster_regen();

drop table if exists posters;
drop table if exists poster_templates cascade; -- cascades to playlist_items.poster_template_id FK

alter table playlist_items drop constraint if exists playlist_items_item_type_check;
alter table playlist_items drop constraint if exists chk_playlist_item_source;
alter table playlist_items drop column if exists poster_template_id;
alter table playlist_items add constraint playlist_items_item_type_check check (item_type in ('image', 'video'));

-- Resolves a device's full playout in one round trip: channel -> zones -> playlist -> items.
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
            'media_url', pi.media_url
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
