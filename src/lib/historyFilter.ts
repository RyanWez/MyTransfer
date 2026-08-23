import type { NextRequest } from "next/server";
import type { TransfersFilter } from "./db";

const STATUS_VALUES = new Set(["success", "pending", "failed"]);

/**
 * Shared parser for the /api/history endpoints. Validates, clamps and
 * normalises every query param in one place so listing and export always
 * agree on what a "matching row" is.
 */
export function parseTransfersFilter(
  req: NextRequest
): TransfersFilter & { page: number; pageSize: number } {
  const numParam = (name: string): number | undefined => {
    const raw = req.nextUrl.searchParams.get(name);
    if (raw === null || raw.trim() === "") return undefined;
    const v = Number(raw);
    return Number.isFinite(v) ? v : undefined;
  };

  const statusParam = req.nextUrl.searchParams.get("status") ?? "";
  const pageRaw = Number(req.nextUrl.searchParams.get("page"));
  const sizeRaw = Number(req.nextUrl.searchParams.get("pageSize"));

  return {
    fromTs: numParam("from"),
    toTs: numParam("to"),
    status: STATUS_VALUES.has(statusParam) ? statusParam : undefined,
    q: req.nextUrl.searchParams.get("q")?.trim() || undefined,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
    pageSize:
      Number.isFinite(sizeRaw) && sizeRaw > 0 ? Math.min(Math.floor(sizeRaw), 100) : 20,
  };
}
