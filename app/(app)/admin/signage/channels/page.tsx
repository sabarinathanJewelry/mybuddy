"use client";

import { useState } from "react";
import { useT } from "@/i18n";
import { SignageTabs } from "@/components/signage/signage-tabs";
import {
  useChannels, useCreateChannel, useDeleteChannel,
  useChannelZones, useSetChannelLayout, useAssignZonePlaylist,
  usePlaylists, LAYOUT_PRESET_LABELS,
} from "@/modules/signage/api";
import type { Channel, LayoutPreset } from "@/modules/signage/types";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";
const PRESETS = Object.keys(LAYOUT_PRESET_LABELS) as LayoutPreset[];

function ZonePreview({ zones }: { zones: { x_pct: number; y_pct: number; w_pct: number; h_pct: number; playlist_id: string | null }[]; }) {
  const { data: playlists = [] } = usePlaylists();
  const name = (id: string | null) => playlists.find((p) => p.id === id)?.name ?? "— empty —";
  return (
    <div className="relative w-full aspect-video bg-canvas border border-line rounded-lg2 overflow-hidden">
      {zones.map((z, i) => (
        <div
          key={i}
          className="absolute border border-white/60 bg-gold/10 flex items-center justify-center text-[10px] text-ink-dim px-1 text-center"
          style={{ left: `${z.x_pct}%`, top: `${z.y_pct}%`, width: `${z.w_pct}%`, height: `${z.h_pct}%` }}
        >
          {name(z.playlist_id)}
        </div>
      ))}
    </div>
  );
}

function ChannelEditor({ channel }: { channel: Channel }) {
  const { data: zones = [] } = useChannelZones(channel.id);
  const { data: playlists = [] } = usePlaylists();
  const setLayout = useSetChannelLayout();
  const assignPlaylist = useAssignZonePlaylist();

  async function handleLayoutChange(preset: LayoutPreset) {
    if (zones.length > 0 && !confirm("Changing the layout resets zone playlist assignments. Continue?")) return;
    await setLayout.mutateAsync({ channelId: channel.id, preset });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-ink-dim mb-1">Layout</label>
        <select onChange={(e) => handleLayoutChange(e.target.value as LayoutPreset)} defaultValue="" className={inp}>
          <option value="" disabled>Change layout…</option>
          {PRESETS.map((p) => <option key={p} value={p}>{LAYOUT_PRESET_LABELS[p]}</option>)}
        </select>
      </div>

      <ZonePreview zones={zones} />

      <div className="space-y-2">
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center gap-3">
            <span className="text-xs text-ink-dim w-20 shrink-0">Zone {zone.zone_index + 1}</span>
            <select
              value={zone.playlist_id ?? ""}
              onChange={(e) => assignPlaylist.mutate({ zoneId: zone.id, channelId: channel.id, playlistId: e.target.value || null })}
              className={inp}
            >
              <option value="">— no playlist —</option>
              {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-ink-dim">Pick a layout above to create zones.</p>}
      </div>
    </div>
  );
}

export default function SignageChannelsPage() {
  const t = useT();
  const { data: channels = [], isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState<LayoutPreset>("full");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    const c = await createChannel.mutateAsync({ name: newName.trim(), preset: newPreset });
    setNewName("");
    setExpanded(c.id);
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <SignageTabs />
      <h1 className="text-xl font-semibold text-ink">{t("signage_channels")}</h1>

      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New channel name" className={inp} />
        <select value={newPreset} onChange={(e) => setNewPreset(e.target.value as LayoutPreset)} className={inp}>
          {PRESETS.map((p) => <option key={p} value={p}>{LAYOUT_PRESET_LABELS[p]}</option>)}
        </select>
        <button onClick={handleCreate} disabled={createChannel.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 whitespace-nowrap">
          {t("add")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-dim">{t("loading")}</p>
      ) : channels.length === 0 ? (
        <p className="text-sm text-ink-dim">{t("no_data")}</p>
      ) : (
        <div className="space-y-2">
          {channels.map((c) => (
            <div key={c.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                <p className="font-medium text-ink">{c.name}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${c.name}"? Devices assigned to it will show nothing.`)) deleteChannel.mutate(c.id); }}
                    className="text-xs text-err px-2 py-1 hover:bg-err/5 rounded"
                  >
                    {t("delete")}
                  </button>
                  <span className="text-ink-dim text-xs">{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded === c.id && (
                <div className="border-t border-line p-4">
                  <ChannelEditor channel={c} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
