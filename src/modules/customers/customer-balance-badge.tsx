"use client";

import { useCustomerBalance } from "./api";
import { inr } from "@/lib/format";

export default function CustomerBalanceBadge({ customerId }: { customerId: string | null | undefined }) {
  const { data: balance } = useCustomerBalance(customerId);
  if (!customerId || balance == null || Math.abs(balance) < 0.5) return null;
  if (balance > 0) {
    return <span className="text-xs text-ok">Advance: {inr(balance)}</span>;
  }
  return <span className="text-xs text-warn">Dues: {inr(-balance)}</span>;
}
