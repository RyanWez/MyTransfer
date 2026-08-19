import { NextResponse } from "next/server";
import { dbApi } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ ok: true, transfers: dbApi.listTransfers(200) });
}
