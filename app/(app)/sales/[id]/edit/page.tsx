"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import SaleForm from "@/modules/sales/sale-form";

export default function EditSalePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const backUrl = searchParams.get("back");

  return (
    <div>
      {backUrl && (
        <Link href={backUrl} className="inline-flex items-center gap-1 text-sm text-ink-dim hover:text-gold mb-4">
          ← Back
        </Link>
      )}
      <h1 className="text-xl font-bold text-ink mb-5">Edit Sale</h1>
      <SaleForm saleId={id} />
    </div>
  );
}
