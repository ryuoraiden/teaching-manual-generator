import { Suspense } from "react";
import { notFound } from "next/navigation";
import DemoEditor from "@/components/DemoEditor";

/**
 * Dev-only editor preview.
 *
 * Opens the manual editor pre-filled with a sample manual so the layout can be
 * exercised (especially at phone widths) without uploading PDFs and waiting on
 * a generation round-trip. Returns 404 in production so it never ships to
 * teachers.
 */
export default function DemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  // DemoEditor reads ?notice= via useSearchParams, which needs a boundary here
  // so the route can still be prerendered.
  return (
    <Suspense>
      <DemoEditor />
    </Suspense>
  );
}
