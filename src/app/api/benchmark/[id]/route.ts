import { NextResponse } from "next/server";
import { getBenchmarkResultById } from "@/lib/server/result-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getBenchmarkResultById(id);

  if (!result) {
    return NextResponse.json({ error: "Result not found." }, { status: 404 });
  }

  return NextResponse.json({ result });
}
