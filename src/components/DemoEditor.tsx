"use client";

import { useState } from "react";
import ManualEditor from "@/components/ManualEditor";
import { DEMO_MANUAL, DEMO_TEXTBOOK_IMAGES } from "@/lib/demo-manual";
import type { TeachingManual } from "@/lib/manual-schema";

/** Client half of the dev-only /demo route: holds editor state. */
export default function DemoEditor() {
  const [manual, setManual] = useState<TeachingManual>(DEMO_MANUAL);

  return (
    <main className="flex-1 px-4 py-6">
      <ManualEditor
        manual={manual}
        textbookImages={DEMO_TEXTBOOK_IMAGES}
        onChange={setManual}
        onStartOver={() => setManual(DEMO_MANUAL)}
      />
    </main>
  );
}
