"use client";

import { useState } from "react";
import { useT } from "@/i18n";
import { supabase } from "@/lib/supabase/client";
import { SignageTabs } from "@/components/signage/signage-tabs";
import {
  usePlaylists, useCreatePlaylist, useDeletePlaylist,
  usePlaylistItems, useAddPlaylistItem, useDeletePlaylistItem, useReorderPlaylistItems,
} from "@/modules/signage/api";
import type { Playlist, PlaylistItem, PlaylistItemType } from "@/modules/signage/types";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const inp = "w-full border border-line rounded-lg2 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gold";

function SortableItemRow({ item, onDelete }: { item: PlaylistItem; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-white border border-line rounded-lg2 px-3 py-2">
      <button {...attributes} {...listeners} className="cursor-grab text-ink-dim px-1" aria-label="Drag to reorder">⠿</button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{item.item_type === "image" ? "Image" : "Video"}</p>
        <p className="text-xs text-ink-dim">{item.duration_seconds}s{!item.active ? " · inactive" : ""}</p>
      </div>
      {item.media_url && (
        item.item_type === "image"
          ? <img src={item.media_url} className="w-12 h-12 object-cover rounded" alt="" />
          : <video src={item.media_url} className="w-12 h-12 object-cover rounded" muted />
      )}
      <button onClick={onDelete} className="text-xs text-err px-2 py-1 hover:bg-err/5 rounded">Remove</button>
    </div>
  );
}

function AddItemForm({ playlistId, nextOrderIndex }: { playlistId: string; nextOrderIndex: number }) {
  const addItem = useAddPlaylistItem();
  const [itemType, setItemType] = useState<PlaylistItemType>("image");
  const [duration, setDuration] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleAdd() {
    setErr(null);
    if (!file) { setErr(`Choose a ${itemType} file to upload.`); return; }
    try {
      setUploading(true);
      const client = supabase();
      const ext = file.name.split(".").pop();
      const path = `${playlistId}/${Date.now()}.${ext}`;
      const { error: upErr } = await client.storage.from("signage-media").upload(path, file, { upsert: true });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}. Ensure the "signage-media" bucket exists and is Public.`);
      const { data: { publicUrl } } = client.storage.from("signage-media").getPublicUrl(path);
      await addItem.mutateAsync({
        playlist_id: playlistId, item_type: itemType, media_url: publicUrl,
        duration_seconds: duration, order_index: nextOrderIndex,
      });
      setFile(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add item.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-canvas border border-line rounded-lg2 p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <select value={itemType} onChange={(e) => setItemType(e.target.value as PlaylistItemType)} className={inp}>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>
        <input
          type="file"
          accept={itemType === "image" ? "image/*" : "video/*"}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <input type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 10)} className={inp} placeholder="Seconds" />
      </div>
      {err && <p className="text-xs text-err">{err}</p>}
      <button onClick={handleAdd} disabled={addItem.isPending || uploading} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 disabled:opacity-50">
        {uploading ? "Uploading…" : "Add item"}
      </button>
    </div>
  );
}

function PlaylistEditor({ playlist }: { playlist: Playlist }) {
  const { data: items = [] } = usePlaylistItems(playlist.id);
  const deleteItem = useDeletePlaylistItem();
  const reorder = useReorderPlaylistItems();
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const newOrder = arrayMove(items, oldIndex, newIndex).map((i) => i.id);
    reorder.mutate({ playlistId: playlist.id, orderedIds: newOrder });
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map((item) => (
              <SortableItemRow
                key={item.id}
                item={item}
                onDelete={() => deleteItem.mutate({ id: item.id, playlistId: playlist.id })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {items.length === 0 && <p className="text-sm text-ink-dim">No items yet.</p>}
      <AddItemForm playlistId={playlist.id} nextOrderIndex={items.length} />
    </div>
  );
}

export default function SignagePlaylistsPage() {
  const t = useT();
  const { data: playlists = [], isLoading } = usePlaylists();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    const p = await createPlaylist.mutateAsync(newName.trim());
    setNewName("");
    setExpanded(p.id);
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <SignageTabs />
      <h1 className="text-xl font-semibold text-ink">{t("signage_playlists")}</h1>

      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New playlist name" className={inp} />
        <button onClick={handleCreate} disabled={createPlaylist.isPending} className="bg-gold hover:bg-gold-dark text-white text-sm font-medium px-4 py-2 rounded-lg2 whitespace-nowrap">
          {t("add")}
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-dim">{t("loading")}</p>
      ) : playlists.length === 0 ? (
        <p className="text-sm text-ink-dim">{t("no_data")}</p>
      ) : (
        <div className="space-y-2">
          {playlists.map((p) => (
            <div key={p.id} className="bg-white border border-line rounded-xl shadow-soft overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                <p className="font-medium text-ink">{p.name}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) deletePlaylist.mutate(p.id); }}
                    className="text-xs text-err px-2 py-1 hover:bg-err/5 rounded"
                  >
                    {t("delete")}
                  </button>
                  <span className="text-ink-dim text-xs">{expanded === p.id ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded === p.id && (
                <div className="border-t border-line p-4">
                  <PlaylistEditor playlist={p} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
