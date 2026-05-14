"use client";

import { useState } from "react";
import { useCustomers, useUpsertCustomer } from "./api";
import type { Customer } from "./types";
import { useT } from "@/i18n";

interface Props {
  value: Customer | null;
  onChange: (c: Customer) => void;
}

export default function CustomerPicker({ value, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const { data: customers } = useCustomers(search);
  const upsert = useUpsertCustomer();

  async function handleAdd() {
    if (!newName.trim()) return;
    const c = await upsert.mutateAsync({ name: newName.trim(), phone: newPhone.trim(), opening_balance: 0, gold_balance_g: 0, silver_balance_g: 0, address: "", notes: "" });
    onChange(c);
    setOpen(false);
    setAddMode(false);
    setNewName("");
    setNewPhone("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left border border-line rounded-lg2 px-3 py-2 text-sm hover:border-gold focus:outline-none focus:ring-2 focus:ring-gold bg-white"
      >
        {value ? (
          <span className="text-ink">{value.name} {value.phone ? `· ${value.phone}` : ""}</span>
        ) : (
          <span className="text-ink-dim">{t("search")} customer…</span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-card border border-line w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-line">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`${t("search")}…`}
                className="w-full text-sm focus:outline-none"
              />
            </div>
            <ul className="max-h-60 overflow-y-auto divide-y divide-line">
              {customers?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-canvas"
                    onClick={() => { onChange(c); setOpen(false); setSearch(""); }}
                  >
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="text-ink-dim ml-2">{c.phone}</span>}
                  </button>
                </li>
              ))}
              {!customers?.length && !addMode && (
                <li className="px-4 py-3 text-sm text-ink-dim">{t("no_customers")}</li>
              )}
            </ul>
            <div className="p-3 border-t border-line">
              {addMode ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    placeholder="Customer name *"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                  <input
                    placeholder="Phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full border border-line rounded-lg2 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gold"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAdd} disabled={!newName.trim()} className="flex-1 bg-gold text-white text-sm py-1.5 rounded-lg2 disabled:opacity-50">
                      {t("add")}
                    </button>
                    <button onClick={() => setAddMode(false)} className="flex-1 border border-line text-sm py-1.5 rounded-lg2">
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddMode(true)}
                  className="text-sm text-gold hover:underline"
                >
                  + {t("add_customer")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
