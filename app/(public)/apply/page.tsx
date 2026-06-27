"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Position = { id: string; name: string; slug: string; description: string | null };

export default function ApplyIndexPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase()
      .from("job_positions")
      .select("id, name, slug, description")
      .eq("is_active", true)
      .order("created_at")
      .then(({ data }) => {
        setPositions((data as Position[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-yellow-100 mb-2">
            <span className="text-2xl">💍</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Sabarinathan Jewellers</h1>
          <p className="text-sm text-gray-500">We are hiring! Select a position to apply.</p>
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">Loading…</div>
        ) : positions.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8">
            No open positions at the moment. Please check back later.
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map(p => (
              <Link key={p.id} href={`/apply/${p.slug}`}
                className="block bg-white border border-gray-200 rounded-2xl p-5 hover:border-yellow-400 hover:shadow-md transition-all group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-800 group-hover:text-yellow-600 transition-colors">{p.name}</p>
                    {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
                  </div>
                  <span className="text-yellow-500 text-xl">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-400">Sabarinathan Jewellers · Confidential</p>
      </div>
    </div>
  );
}
