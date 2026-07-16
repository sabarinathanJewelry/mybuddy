"use client";

import { useState } from "react";
import { useT } from "@/i18n";
import { SignageTabs } from "@/components/signage/signage-tabs";
import {
  useDevices, useFindPendingDevice, useClaimDevice, useUpdateDevice, useDeleteDevice,
  useChannels,
} from "@/modules/signage/api";
import type { Device } from "@/modules/signage/types";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
}

function ClaimDeviceBox() {
  const t = useT();
  const { data: channels = [] } = useChannels();
  const findPending = useFindPendingDevice();
  const claim = useClaimDevice();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<{ id: string } | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [channelId, setChannelId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function handleFind() {
    setErr(null);
    setFound(null);
    try {
      const device = await findPending.mutateAsync(code);
      setFound(device);
    } catch (e: any) {
      setErr(e?.message ?? "Not found.");
    }
  }

  async function handleClaim() {
    if (!found) return;
    setErr(null);
    try {
      await claim.mutateAsync({ id: found.id, name: name.trim() || "Unnamed TV", location: location.trim(), channel_id: channelId || null });
      setCode(""); setFound(null); setName(""); setLocation(""); setChannelId("");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to claim device.");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-line p-4 shadow-soft space-y-3">
      <p className="text-sm font-medium text-ink">Claim a device</p>
      <p className="text-xs text-ink-dim">Enter the 6-digit code currently shown on the TV screen.</p>
      {!found ? (
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="123456" className={inp} />
          <button onClick={handleFind} disabled={findPending.isPending || code.length !== 6} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50 whitespace-nowrap">
            Find device
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name (e.g. Front Window TV)" className={inp} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className={inp} />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={inp}>
            <option value="">— assign channel later —</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleClaim} disabled={claim.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50">
              {t("save")}
            </button>
            <button onClick={() => setFound(null)} className="border border-line text-ink-mid text-sm px-4 py-2 rounded-lg2 hover:bg-canvas">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-err">{err}</p>}
    </div>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const t = useT();
  const { data: channels = [] } = useChannels();
  const update = useUpdateDevice();
  const del = useDeleteDevice();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.name ?? "");
  const [location, setLocation] = useState(device.location ?? "");
  const [channelId, setChannelId] = useState(device.channel_id ?? "");

  async function handleSave() {
    await update.mutateAsync({ id: device.id, name, location, channel_id: channelId || null });
    setEditing(false);
  }

  const channelName = channels.find((c) => c.id === device.channel_id)?.name ?? "— unassigned —";
  const online = isOnline(device.last_seen_at);

  return (
    <div className="bg-white border border-line rounded-xl shadow-soft p-4 space-y-2">
      {!editing ? (
        <>
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink">{device.name || "Unnamed device"}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${online ? "bg-ok/10 text-ok" : "bg-canvas text-ink-dim border border-line"}`}>
              {device.status === "pending" ? "Awaiting pairing" : online ? "Online" : "Offline"}
            </span>
          </div>
          <p className="text-xs text-ink-dim">{device.location || "No location set"}</p>
          <p className="text-xs text-ink-dim">Channel: {channelName}</p>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setEditing(true)} className="text-xs border border-line text-ink-mid px-3 py-1.5 rounded-lg2 hover:bg-canvas">{t("edit")}</button>
            <button
              onClick={() => { if (confirm(`Remove "${device.name || "this device"}"?`)) del.mutate(device.id); }}
              className="text-xs text-err px-3 py-1.5 hover:bg-err/5 rounded-lg2"
            >
              {t("delete")}
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name" className={inp} />
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" className={inp} />
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={inp}>
            <option value="">— unassigned —</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={update.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50">{t("save")}</button>
            <button onClick={() => setEditing(false)} className="border border-line text-ink-mid text-sm px-4 py-2 rounded-lg2 hover:bg-canvas">{t("cancel")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignageDevicesPage() {
  const t = useT();
  const { data: devices = [], isLoading } = useDevices();

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <SignageTabs />
      <h1 className="text-xl font-semibold text-ink">{t("signage_devices")}</h1>

      <ClaimDeviceBox />

      {isLoading ? (
        <p className="text-sm text-ink-dim">{t("loading")}</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-ink-dim">{t("no_data")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {devices.map((d) => <DeviceRow key={d.id} device={d} />)}
        </div>
      )}
    </div>
  );
}
