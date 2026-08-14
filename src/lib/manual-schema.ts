import { z } from "zod";

/**
 * The Teaching Manual schema — the single contract shared by:
 *  1. LLM generation (Claude structured outputs guarantee the response matches this)
 *  2. The interactive editor (client state is exactly this shape)
 *  3. PDF / DOCX export (renderers consume this shape)
 *
 * Sections are an ordered array (not fixed fields) so the teacher can add,
 * remove, and reorder them freely. `type` ties a section back to the standard
 * Kerala teaching-manual template; teacher-added sections use "custom".
 */

export const SECTION_TYPES = [
  "learningOutcomes", // പഠനനേട്ടങ്ങൾ
  "concepts", // ആശയങ്ങൾ
  "materials", // ആവശ്യമായ സാമഗ്രികൾ
  "introduction", // പ്രവേശകം
  "learningActivities", // പഠനപ്രവർത്തനങ്ങൾ
  "consolidation", // ക്രോഡീകരണം
  "assessment", // വിലയിരുത്തൽ
  "followUp", // തുടർപ്രവർത്തനങ്ങൾ
  "custom",
] as const;

export const LINK_TYPES = ["video", "resource", "simulation"] as const;

/**
 * A link attached to a section. URLs in generated manuals are always search
 * URLs or curated portals — never model-invented deep links — so they can't
 * 404. Teachers can also add/edit links by hand.
 */
export const LinkItemSchema = z.object({
  kind: z.literal("link"),
  label: z.string().describe("Short human-readable label for the resource"),
  url: z.string(),
  linkType: z.enum(LINK_TYPES),
});

/**
 * An image attached to a section (Phase 2). `src` is a self-contained data:
 * URI (JPEG), so the manual JSON stays portable end-to-end — editor, export
 * APIs, and (later) storage — with no separate file store. Images come either
 * from the uploaded textbook's own figures or a teacher upload.
 */
export const ImageItemSchema = z.object({
  kind: z.literal("image"),
  src: z.string().describe("Image as a data:image/*;base64 URI"),
  caption: z.string().optional(),
  source: z.string().optional().describe("Provenance, e.g. 'Textbook p.34'"),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** A section media item is either a link or an image (discriminated on `kind`). */
export const MediaItemSchema = z.discriminatedUnion("kind", [
  LinkItemSchema,
  ImageItemSchema,
]);

export const SectionSchema = z.object({
  id: z
    .string()
    .describe("Stable slug for this section, e.g. 'learning-outcomes'"),
  type: z.enum(SECTION_TYPES),
  titleMl: z.string().describe("Section title in Malayalam"),
  titleEn: z.string().describe("Section title in English"),
  content: z
    .string()
    .describe(
      "Section body. Plain text; use '- ' at line start for bullet points and blank lines between paragraphs/steps."
    ),
  media: z.array(MediaItemSchema).optional(),
});

export const BasicInfoSchema = z.object({
  standard: z.string().describe("Class/standard, e.g. 'IV'"),
  subject: z.string().describe("Subject name, e.g. 'പരിസരപഠനം / EVS'"),
  unitName: z.string().describe("Unit/chapter name as printed in the textbook"),
  chapterNumber: z.string(),
  estimatedTime: z
    .string()
    .describe("Estimated teaching time, e.g. '6 periods (40 min each)'"),
});

export const TeachingManualSchema = z.object({
  basicInfo: BasicInfoSchema,
  sections: z.array(SectionSchema),
});

export type Section = z.infer<typeof SectionSchema>;
export type BasicInfo = z.infer<typeof BasicInfoSchema>;
export type TeachingManual = z.infer<typeof TeachingManualSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type LinkItem = z.infer<typeof LinkItemSchema>;
export type ImageItem = z.infer<typeof ImageItemSchema>;
export type LinkType = (typeof LINK_TYPES)[number];

/**
 * The pool of images extracted from the uploaded textbook's chapter pages,
 * returned alongside the manual for the teacher to place into sections. This
 * is NOT part of the manual JSON — it's a candidate gallery. Placing one turns
 * it into an ImageItem in a section's `media`.
 */
export interface TextbookImage {
  src: string;
  page: number;
  width: number;
  height: number;
}

/**
 * Diagnostics returned alongside a generated manual. These explain *why* a
 * result looks the way it does — above all, why a chapter yielded no figures —
 * so a teacher can act (e.g. supply an explicit page range) instead of
 * concluding the feature is broken.
 */
export interface GenerationMeta {
  chapterSliceStrategy:
    | "page-range"
    | "heading-match"
    | "name-match"
    | "fallback-full";
  chapterPageCount: number;
  imagesFound: number;
  workbookUsed: boolean;
  sourceContext?: string;
  timings?: {
    pdfExtractMs: number;
    generatePhaseMs: number;
    imagesMs: number;
    totalMs: number;
  };
}

/** Default bilingual titles for the standard sections (used by the editor's "add section" menu). */
export const SECTION_TITLES: Record<
  (typeof SECTION_TYPES)[number],
  { ml: string; en: string }
> = {
  learningOutcomes: { ml: "പഠനനേട്ടങ്ങൾ", en: "Learning Outcomes" },
  concepts: { ml: "ആശയങ്ങൾ", en: "Concepts / Ideas" },
  materials: { ml: "ആവശ്യമായ സാമഗ്രികൾ", en: "Materials / Resources" },
  introduction: { ml: "പ്രവേശകം", en: "Introduction / Ice-breaker" },
  learningActivities: { ml: "പഠനപ്രവർത്തനങ്ങൾ", en: "Learning Activities" },
  consolidation: { ml: "ക്രോഡീകരണം", en: "Consolidation / Review" },
  assessment: { ml: "വിലയിരുത്തൽ", en: "Assessment / Evaluation" },
  followUp: { ml: "തുടർപ്രവർത്തനങ്ങൾ", en: "Follow-up / Extension" },
  custom: { ml: "പുതിയ ഭാഗം", en: "Custom Section" },
};

export type OutputLanguage = "ml" | "en" | "both";
