"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/stores/auth";
import { useT } from "@/i18n";

export default function AdminUsersPage() {
  const t = useT();
  const profile = useAuth((s) => s.profile);
  const qc = useQueryClient();

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

  if (profile?.role !== "admin") {
    return <div className="p-8 text-center text-ink-dim">Admin access required.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-xl font-bold">{t("admin")} — {t("users")}</h1>

      <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 text-sm space-y-2">
        <p className="font-semibold text-gold-dark">Setting up gamified login credentials</p>
        <p className="text-ink-dim">Run this SQL in your Supabase dashboard after the user has signed in once:</p>
        <pre className="bg-white border border-line rounded-lg p-3 text-xs overflow-x-auto">
{`update profiles set
  role = 'admin',
  secret_number = '1234',
  login_pattern = '[{"gun":1,"target":5},{"gun":2,"target":3}]'
where id = '<user-uuid>';`}
        </pre>
        <p className="text-ink-dim text-xs">The <code>login_pattern</code> is a JSON array of gun+target pairs matching the shooting range sequence.</p>
      </div>

      {isLoading ? <p className="text-ink-dim text-sm">{t("loading")}</p> : (
        <div className="bg-white rounded-xl border border-line shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-canvas text-xs text-ink-dim border-b border-line">
              <th className="text-left px-4 py-2.5">Name</th>
              <th className="text-left px-3 py-2.5">Role</th>
              <th className="text-left px-3 py-2.5">Language</th>
              <th className="text-left px-3 py-2.5">Game Login</th>
              <th className="text-center px-3 py-2.5">Repairs</th>
              <th className="text-center px-3 py-2.5">Incentive</th>
            </tr></thead>
            <tbody>
              {(profiles as any[])?.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium">{p.display_name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.role === "admin" ? "bg-gold/10 text-gold-dark" : "bg-canvas text-ink-dim"}`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-dim uppercase">{p.language}</td>
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
                        {p.repair_access ? "Enabled" : "Disabled"}
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
                        {p.incentive_access ? "Enabled" : "Disabled"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
