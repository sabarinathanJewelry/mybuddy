"use client";

import { useParams } from "next/navigation";
import SaleForm from "@/modules/sales/sale-form";

export default function EditSalePage() {
  const params = useParams();
  const id = params.id as string;
  return (
    <div>
      <h1 className="text-xl font-bold text-ink mb-5">Edit Sale</h1>
      <SaleForm saleId={id} />
    </div>
  );
}
