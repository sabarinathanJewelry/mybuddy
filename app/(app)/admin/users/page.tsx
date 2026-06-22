"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useT } from "@/i18n";
import { MODULE_GROUPS } from "@/lib/modules";

export default function AdminUsersPage() {
  const t = useT();
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();
  const [expandedModules, setExpandedModules] = useState<string | null>(null);

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase().from("profiles").select("*").order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleRepairAccess = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase().from("profiles").update({ repair_access: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const toggleIncentiveAccess = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase().from("profiles").update({ incentive_access: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const toggleKolusuAccess = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase().from("profiles").update({ kolusu_access: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "staff" | "subadmin" }) => {
      const client = supabase();
      const { data: { session } } = await client.auth.getSession();
      const res = await fetch("/api/admin/set-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to update role");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const updateModules = useMutation({
    mutationFn: async ({ id, modules }: { id: string; modules: string[] }) => {
      const { error } = await supabase().from("profiles").update({ allowed_modules: modules }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  function toggleModule(userId: string, currentModules: string[], slug: string) {
    const next = currentModules.includes(slug)
      ? currentModules.filter((m) => m !== slug)
      : [...currentModules, slug];
    updateModules.mutate({ id: userId, modules: next });
  }

  const toggleActive = useMutation({
    mutationFn: async ({ userId, reactivate }: { userId: string; reactivate: boolean }) => {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch("/api/admin/deactivate-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ userId, reactivate }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("admin")} — {t("users")}</h1>

      <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 text-sm space-y-2">
        <p className="font-semibold text-gold-dark">Setting up game login (kiosk combination)</p>
        <p className="text-ink-dim">Run this SQL in your Supabase dashboard after the user has signed in once:</p>
        <pre className="bg-white border border-line rounded-lg p-3 text-xs overflow-x-auto">
{`-- For admin:
update profiles set role = 'admin',
  secret_number = '1234',
  login_pattern = '[{"gun":1,"target":5},{"gun":2,"target":3}]'
where id = '<user-uuid>';

-- For sub-admin (set role here + use "Promote" button in the table below):
update profiles set
  secret_number = '5678',
  login_pattern = '[{"gun":3,"target":1}]'
where id = '<user-uuid>';`}
        </pre>
        <p className="text-ink-dim text-xs">
          Each user's <code>login_pattern</code> is a JSON array of gun+target pairs — the kiosk shooting sequence.
          Use a unique combination per sub-admin.
        </p>
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-xs text-ink-dim border-b border-line">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Role</th>
                <th className="text-left px-3 py-2.5">Game Login</th>
                <th className="text-center px-3 py-2.5">Repairs</th>
                <th className="text-center px-3 py-2.5">Incentive</th>
                <th className="text-center px-3 py-2.5">Kolusu</th>
                <th className="text-center px-3 py-2.5">Sub-Admin</th>
                <th className="text-center px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {(profiles as any[])?.map((p) => {
                const isSubadmin = p.role === "subadmin";
                const isModulesOpen = expandedModules === p.id;
                const mods: string[] = p.allowed_modules ?? [];

                return (
                  <>
                    <tr key={p.id} className={`border-b border-line last:border-0 hover:bg-canvas/50 ${p.is_active === false ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{p.display_name}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          p.role === "admin"
                            ? "bg-gold/10 text-gold-dark"
                            : isSubadmin
                            ? "bg-info/15 text-info"
                            : "bg-canvas text-ink-dim"
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.secret_number && p.login_pattern ? (
                          <span className="text-xs text-ok">✓ Configured</span>
                        ) : (
                          <span className="text-xs text-ink-dim">Not set</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.role === "admin" ? (
                          <span className="text-xs text-gold">Always</span>
                        ) : (
                          <button
                            onClick={() => toggleRepairAccess.mutate({ id: p.id, value: !p.repair_access })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              p.repair_access
                                ? "bg-ok/10 border-ok/30 text-ok"
                                : "border-line text-ink-dim hover:border-gold hover:text-gold"
                            }`}
                          >
                            {p.repair_access ? "On" : "Off"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.role === "admin" ? (
                          <span className="text-xs text-gold">Always</span>
                        ) : (
                          <button
                            onClick={() => toggleIncentiveAccess.mutate({ id: p.id, value: !p.incentive_access })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              p.incentive_access
                                ? "bg-ok/10 border-ok/30 text-ok"
                                : "border-line text-ink-dim hover:border-gold hover:text-gold"
                            }`}
                          >
                            {p.incentive_access ? "On" : "Off"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.role === "admin" ? (
                          <span className="text-xs text-gold">Always</span>
                        ) : (
                          <button
                            onClick={() => toggleKolusuAccess.mutate({ id: p.id, value: !p.kolusu_access })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              p.kolusu_access
                                ? "bg-ok/10 border-ok/30 text-ok"
                                : "border-line text-ink-dim hover:border-gold hover:text-gold"
                            }`}
                          >
                            {p.kolusu_access ? "On" : "Off"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {p.role === "admin" ? (
                          <span className="text-xs text-gold">—</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                if (confirm(isSubadmin
                                  ? `Demote ${p.display_name} back to staff?`
                                  : `Promote ${p.display_name} to sub-admin?`
                                )) {
                                  setRole.mutate({ userId: p.id, role: isSubadmin ? "staff" : "subadmin" });
                                }
                              }}
                              disabled={setRole.isPending}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 ${
                                isSubadmin
                                  ? "bg-info/15 border-info/30 text-info hover:bg-err/10 hover:border-err/30 hover:text-err"
                                  : "border-line text-ink-dim hover:border-info hover:text-info"
                              }`}
                            >
                              {isSubadmin ? "Sub-Admin" : "Promote"}
                            </button>
                            {isSubadmin && (
                              <button
                                onClick={() => setExpandedModules(isModulesOpen ? null : p.id)}
                                className="text-xs px-2 py-1 rounded-full border border-line text-ink-dim hover:border-gold hover:text-gold transition-colors"
                              >
                                {isModulesOpen ? "▲" : "Modules"}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Deactivate / Reactivate */}
                      <td className="px-3 py-2.5 text-center">
                        {p.role === "admin" ? (
                          <span className="text-xs text-gold">—</span>
                        ) : (
                          <button
                            onClick={() => {
                              const isActive = p.is_active !== false;
                              const msg = isActive
                                ? `Deactivate ${p.display_name}? They will be logged out and cannot log in again.`
                                : `Reactivate ${p.display_name}?`;
                              if (confirm(msg)) {
                                toggleActive.mutate({ userId: p.id, reactivate: !isActive });
                              }
                            }}
                            disabled={toggleActive.isPending}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 ${
                              p.is_active !== false
                                ? "border-err/30 text-err hover:bg-err/10"
                                : "border-ok/30 text-ok hover:bg-ok/10"
                            }`}
                          >
                            {p.is_active !== false ? "Deactivate" : "Reactivate"}
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Module permission grid */}
                    {isSubadmin && isModulesOpen && (
                      <tr key={`${p.id}-modules`} className="border-b border-line bg-canvas/60">
                        <td colSpan={6} className="px-4 py-4">
                          <p className="text-xs font-semibold text-ink mb-3">
                            Module access for <span className="text-info">{p.display_name}</span>
                            <span className="ml-2 text-ink-dim font-normal">({mods.length} module{mods.length !== 1 ? "s" : ""} enabled)</span>
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {MODULE_GROUPS.map((group) => (
                              <div key={group.group}>
                                <p className="text-[10px] font-bold text-ink-dim uppercase tracking-wide mb-1.5">
                                  {group.group}
                                </p>
                                <div className="space-y-1">
                                  {group.items.map((item) => {
                                    const checked = mods.includes(item.slug);
                                    return (
                                      <label
                                        key={item.slug}
                                        className="flex items-center gap-1.5 cursor-pointer group"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleModule(p.id, mods, item.slug)}
                                          className="accent-gold w-3.5 h-3.5"
                                        />
                                        <span className={`text-xs ${checked ? "text-ink font-medium" : "text-ink-dim"}`}>
                                          {item.label}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-ink-dim mt-3">
                            Dashboard is always accessible. Changes take effect on the sub-admin's next page load.
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
