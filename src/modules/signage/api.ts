"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type {
  Playlist, PlaylistItem, PlaylistItemType, Channel, ChannelZone, Device, LayoutPreset,
} from "./types";

// TV devices have no Supabase session (see migration 133's note on why), so they
// can't watch postgres_changes on RLS-protected tables. Instead every content
// mutation pings this shared, unauthenticated Realtime Broadcast channel (anon
// key only, empty payload — no business data crosses it), and every paired TV
// listens on it and refetches its own playout via device_secret when it fires.
export async function broadcastSignageRefresh() {
  const channel = supabase().channel("signage-updates");
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.send({ type: "broadcast", event: "refresh", payload: {} }).finally(() => resolve());
      }
    });
  });
  supabase().removeChannel(channel);
}

// ---------- Playlists ----------

export function usePlaylists() {
  return useQuery<Playlist[]>({
    queryKey: ["playlists"],
    queryFn: async () => {
      const { data, error } = await supabase().from("playlists").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase().from("playlists").insert({ name }).select().single();
      if (error) throw error;
      return data as Playlist;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlists"] }),
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playlists"] }),
  });
}

export function usePlaylistItems(playlistId: string | null) {
  return useQuery<PlaylistItem[]>({
    queryKey: ["playlist-items", playlistId],
    enabled: !!playlistId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("playlist_items")
        .select("*")
        .eq("playlist_id", playlistId!)
        .order("order_index");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddPlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      playlist_id: string;
      item_type: PlaylistItemType;
      media_url: string;
      duration_seconds: number;
      order_index: number;
    }) => {
      const { data, error } = await supabase().from("playlist_items").insert(payload).select().single();
      if (error) throw error;
      return data as PlaylistItem;
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ["playlist-items", item.playlist_id] });
      broadcastSignageRefresh();
    },
  });
}

export function useDeletePlaylistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, playlistId }: { id: string; playlistId: string }) => {
      const { error } = await supabase().from("playlist_items").delete().eq("id", id);
      if (error) throw error;
      return playlistId;
    },
    onSuccess: (playlistId) => {
      qc.invalidateQueries({ queryKey: ["playlist-items", playlistId] });
      broadcastSignageRefresh();
    },
  });
}

export function useReorderPlaylistItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ playlistId, orderedIds }: { playlistId: string; orderedIds: string[] }) => {
      const client = supabase();
      await Promise.all(
        orderedIds.map((id, index) => client.from("playlist_items").update({ order_index: index }).eq("id", id))
      );
      return playlistId;
    },
    onSuccess: (playlistId) => {
      qc.invalidateQueries({ queryKey: ["playlist-items", playlistId] });
      broadcastSignageRefresh();
    },
  });
}

// ---------- Channels ----------

const LAYOUT_PRESETS: Record<LayoutPreset, Omit<ChannelZone, "id" | "channel_id" | "playlist_id">[]> = {
  full: [{ zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }],
  h_50_50: [
    { zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 50 },
    { zone_index: 1, x_pct: 0, y_pct: 50, w_pct: 100, h_pct: 50 },
  ],
  h_70_30: [
    { zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 70 },
    { zone_index: 1, x_pct: 0, y_pct: 70, w_pct: 100, h_pct: 30 },
  ],
  v_50_50: [
    { zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 100 },
    { zone_index: 1, x_pct: 50, y_pct: 0, w_pct: 50, h_pct: 100 },
  ],
  v_20_80: [
    { zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 20, h_pct: 100 },
    { zone_index: 1, x_pct: 20, y_pct: 0, w_pct: 80, h_pct: 100 },
  ],
  v_80_20: [
    { zone_index: 0, x_pct: 0, y_pct: 0, w_pct: 80, h_pct: 100 },
    { zone_index: 1, x_pct: 80, y_pct: 0, w_pct: 20, h_pct: 100 },
  ],
};

export const LAYOUT_PRESET_LABELS: Record<LayoutPreset, string> = {
  full: "Full screen",
  h_50_50: "Horizontal 50 / 50",
  h_70_30: "Horizontal 70 / 30",
  v_50_50: "Vertical 50 / 50",
  v_20_80: "Vertical 20 / 80",
  v_80_20: "Vertical 80 / 20",
};

export function useChannels() {
  return useQuery<Channel[]>({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase().from("channels").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useChannelZones(channelId: string | null) {
  return useQuery<ChannelZone[]>({
    queryKey: ["channel-zones", channelId],
    enabled: !!channelId,
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("channel_zones")
        .select("*")
        .eq("channel_id", channelId!)
        .order("zone_index");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, preset }: { name: string; preset: LayoutPreset }) => {
      const client = supabase();
      const { data: channel, error } = await client.from("channels").insert({ name }).select().single();
      if (error) throw error;
      const zones = LAYOUT_PRESETS[preset].map((z) => ({ ...z, channel_id: channel.id }));
      const { error: zoneErr } = await client.from("channel_zones").insert(zones);
      if (zoneErr) throw zoneErr;
      return channel as Channel;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

export function useSetChannelLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, preset }: { channelId: string; preset: LayoutPreset }) => {
      const client = supabase();
      const { error: delErr } = await client.from("channel_zones").delete().eq("channel_id", channelId);
      if (delErr) throw delErr;
      const zones = LAYOUT_PRESETS[preset].map((z) => ({ ...z, channel_id: channelId }));
      const { error: insErr } = await client.from("channel_zones").insert(zones);
      if (insErr) throw insErr;
      return channelId;
    },
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: ["channel-zones", channelId] });
      broadcastSignageRefresh();
    },
  });
}

export function useAssignZonePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ zoneId, channelId, playlistId }: { zoneId: string; channelId: string; playlistId: string | null }) => {
      const { error } = await supabase().from("channel_zones").update({ playlist_id: playlistId }).eq("id", zoneId);
      if (error) throw error;
      return channelId;
    },
    onSuccess: (channelId) => {
      qc.invalidateQueries({ queryKey: ["channel-zones", channelId] });
      broadcastSignageRefresh();
    },
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
}

// ---------- Devices ----------

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("devices")
        .select("id, name, location, pairing_code, channel_id, status, last_seen_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFindPendingDevice() {
  return useMutation({
    mutationFn: async (pairingCode: string) => {
      const { data, error } = await supabase()
        .from("devices")
        .select("id, pairing_code, status")
        .eq("pairing_code", pairingCode.trim())
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No pending device found with that code — make sure the TV is showing it right now.");
      return data;
    },
  });
}

export function useClaimDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; name: string; location: string; channel_id: string | null }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase().from("devices").update({ ...rest, status: "paired" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      broadcastSignageRefresh();
    },
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; name?: string; location?: string; channel_id?: string | null }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase().from("devices").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devices"] });
      broadcastSignageRefresh();
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase().from("devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}
