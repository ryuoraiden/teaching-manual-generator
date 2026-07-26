"use client";

import { useState } from "react";
import ManualEditor from "@/components/ManualEditor";
import UploadForm from "@/components/UploadForm";
import type { TeachingManual, TextbookImage } from "@/lib/manual-schema";

/**
 * The whole loop lives on one page with two phases:
 *  1. "upload" — teacher picks textbook + handbook PDFs, chapter, language →
 *     POST /api/generate-manual (the LLM layer).
 *  2. "edit" — the generated TeachingManual JSON becomes plain client state;
 *     every edit is local. Export sends the *current edited state* to
 *     /api/export/{pdf,docx} — the LLM is never involved after generation.
 */
export default function Home() {
  const [manual, setManual] = useState<TeachingManual | null>(null);
  const [textbookImages, setTextbookImages] = useState<TextbookImage[]>([]);

  return (
    <main className="flex-1 px-4 py-10">
      <header className="mx-auto mb-8 max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Teaching Manual Generator
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Kerala State Syllabus · Standards I–VII · അധ്യാപന സഹായി
        </p>
      </header>

      {manual === null ? (
        <UploadForm
          onGenerated={(m, images) => {
            setManual(m);
            setTextbookImages(images);
          }}
        />
      ) : (
        <ManualEditor
          manual={manual}
          textbookImages={textbookImages}
          onChange={setManual}
          onStartOver={() => {
            setManual(null);
            setTextbookImages([]);
          }}
        />
      )}
    </main>
  );
}
