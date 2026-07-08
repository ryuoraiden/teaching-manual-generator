import { NextRequest, NextResponse } from "next/server";
import { manualToPdf } from "@/lib/export/pdf";
import { TeachingManualSchema } from "@/lib/manual-schema";

export const runtime = "nodejs";

/** POST /api/export/pdf — body: TeachingManual JSON → .pdf download */
export async function POST(req: NextRequest) {
  const parsed = TeachingManualSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manual payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const buffer = await manualToPdf(parsed.data);
  const { basicInfo } = parsed.data;
  const filename = `teaching-manual-std${basicInfo.standard}-ch${basicInfo.chapterNumber}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
