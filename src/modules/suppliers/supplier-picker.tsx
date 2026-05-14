"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface Supplier { id: string; name: string; phone: string | null }

interface Props {
  value: Supplier | null;
  onChange: (s: Supplier) => void;
}

function useSuppliers(search: string) {
  return useQuery<Supplier[]>({
    queryKey: ["suppliers-picker", search],
    queryFn: async () => {
      let q = supabase().from("suppliers").select("id, name, phone").order("name").limit(50);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function SupplierPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: suppliers } = useSuppliers(search);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left border border-line rounded-lg2 px-3 py-2 text-sm hover:border-gold bg-white"
      >
        {value ? value.name : <span className="text-ink-dim">Select supplier…</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-card border border-line w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-line">
              <input autoFocus type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search suppliers…" className="w-full text-sm focus:outline-none" />
            </div>
            <ul className="max-h-60 overflow-y-auto divide-y divide-line">
              {suppliers?.map((s) => (
                <li key={s.id}>
                  <button type="button" className="w-full text-left px-4 py-2.5 text-sm hover:bg-canvas"
                    onClick={() => { onChange(s); setOpen(false); setSearch(""); }}>
                    <span className="font-medium">{s.name}</span>
                    {s.phone && <span className="text-ink-dim ml-2">{s.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
