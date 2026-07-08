import { NextRequest, NextResponse } from "next/server";
import { manualToDocx } from "@/lib/export/docx";
import { TeachingManualSchema } from "@/lib/manual-schema";

export const runtime = "nodejs";

/** POST /api/export/docx — body: TeachingManual JSON → .docx download */
export async function POST(req: NextRequest) {
  const parsed = TeachingManualSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manual payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const buffer = await manualToDocx(parsed.data);
  const { basicInfo } = parsed.data;
  const filename = `teaching-manual-std${basicInfo.standard}-ch${basicInfo.chapterNumber}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
