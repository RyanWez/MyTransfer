import { NextRequest, NextResponse } from "next/server";
import { dbApi } from "@/lib/db";

/**
 * Successful transfers in a range, already grouped by receiver.
 *
 * Replaces the Receivers page walking the whole history log over HTTP one page at
 * a time and grouping it in the browser — which cost a round trip per 100 rows,
 * ran again from scratch on every live push, and quietly truncated the aggregate
 * once the log outgrew the client's page ceiling.
 *
 * `sender` filters here because it comes from a dropdown, so it changes rarely;
 * the receiver search and the volume/count thresholds stay client-side where they
 * can respond to every keystroke without a request.
 *
 * `from`/`to` are optional: the date picker's "All Time" sends neither, and the
 * row cap in lib/db bounds the query rather than the caller.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const parseTs = (name: string): number | undefined => {
    const raw = Number(params.get(name));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : undefined;
  };

  const sender = params.get("sender")?.trim() || undefined;
  const { groups, senders, transferCount } = dbApi.receiversInRange(
    parseTs("from"),
    parseTs("to"),
    sender
  );

  return NextResponse.json({ ok: true, groups, senders, transferCount });
}
