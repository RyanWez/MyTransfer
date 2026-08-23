import type { NextRequest } from "next/server";
import { dbApi } from "@/lib/db";
import { parseTransfersFilter } from "@/lib/historyFilter";

// Hard ceiling so a pathological query can't pin the server; still far beyond
// any realistic filter result.
const EXPORT_CAP = 100_000;

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Full CSV of every transfer matching the current filters — not just one page.
 * The History page's export button points here, so an archive download stays
 * complete regardless of pagination.
 */
export async function GET(req: NextRequest) {
  const { fromTs, toTs, status, q } = parseTransfersFilter(req);

  const { rows } = dbApi.listTransfersFiltered(
    { fromTs, toTs, status, q: q || undefined },
    EXPORT_CAP,
    0
  );

  const header = ["id", "datetime", "sender", "receiver", "amount", "fee", "status", "error_code", "message"];
  const lines = rows.map((r) =>
    [
      r.id,
      new Date(r.created_at * 1000).toISOString(),
      r.sender_phone,
      r.receiver_phone,
      r.amount,
      r.fee,
      r.status,
      r.error_code ?? "",
      r.message ?? "",
    ]
      .map(csvCell)
      .join(",")
  );

  // BOM so Excel opens the file as UTF-8 without an import wizard.
  const csv = "\uFEFF" + [header.join(","), ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="myshare-history-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
