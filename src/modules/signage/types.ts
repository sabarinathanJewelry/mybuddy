export interface Playlist {
  id: string;
  name: string;
  created_at: string;
}

export type PlaylistItemType = "image" | "video";

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  order_index: number;
  item_type: PlaylistItemType;
  media_url: string | null;
  duration_seconds: number;
  active: boolean;
}

export interface Channel {
  id: string;
  name: string;
  created_at: string;
}

export interface ChannelZone {
  id: string;
  channel_id: string;
  zone_index: number;
  playlist_id: string | null;
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

export type LayoutPreset = "full" | "h_50_50" | "h_70_30" | "v_50_50" | "v_20_80" | "v_80_20";

export interface Device {
  id: string;
  name: string | null;
  location: string | null;
  pairing_code: string | null;
  channel_id: string | null;
  status: "pending" | "paired";
  last_seen_at: string | null;
  created_at: string;
}
