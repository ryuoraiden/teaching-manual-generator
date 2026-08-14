"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import ManualEditor from "@/components/ManualEditor";
import { DEMO_MANUAL, DEMO_TEXTBOOK_IMAGES } from "@/lib/demo-manual";
import type { GenerationMeta, TeachingManual } from "@/lib/manual-schema";

/** Stand-in diagnostics so the figure notices can be checked without a real
 *  generation. `?notice=` accepts: `fallback` (couldn't locate the chapter),
 *  `empty` (chapter found, no extractable figures), `placed` (Phase 4 placed
 *  some), `unplaced` (figures found but none matched a section). */
function demoMeta(kind: string | null): GenerationMeta | null {
  if (kind === "fallback") {
    return {
      chapterSliceStrategy: "fallback-full",
      chapterPageCount: 0,
      imagesFound: 0,
      workbookUsed: false,
    };
  }
  if (kind === "empty") {
    return {
      chapterSliceStrategy: "heading-match",
      chapterPageCount: 8,
      imagesFound: 0,
      workbookUsed: false,
    };
  }
  if (kind === "placed") {
    return {
      chapterSliceStrategy: "heading-match",
      chapterPageCount: 8,
      imagesFound: 7,
      figuresPlaced: 3,
      workbookUsed: false,
    };
  }
  if (kind === "unplaced") {
    return {
      chapterSliceStrategy: "heading-match",
      chapterPageCount: 8,
      imagesFound: 7,
      figuresPlaced: 0,
      workbookUsed: false,
    };
  }
  return null;
}

/** Client half of the dev-only /demo route: holds editor state. */
export default function DemoEditor() {
  const [manual, setManual] = useState<TeachingManual>(DEMO_MANUAL);
  // The page is prerendered, so this needs the Suspense boundary in demo/page.
  const meta = demoMeta(useSearchParams().get("notice"));

  return (
    <main className="flex-1 px-4 py-6">
      <ManualEditor
        manual={manual}
        textbookImages={DEMO_TEXTBOOK_IMAGES}
        meta={meta}
        onChange={setManual}
        onStartOver={() => setManual(DEMO_MANUAL)}
      />
    </main>
  );
}
