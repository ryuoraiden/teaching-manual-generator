import { GoogleGenAI, Type, type Part, type Schema } from "@google/genai";
import { z } from "zod";
import type {
  ImageItem,
  OutputLanguage,
  TeachingManual,
  TextbookImage,
} from "./manual-schema";

/**
 * Phase 4 — let the model place the textbook's own figures into the sections
 * they actually support.
 *
 * The figures are extracted from the chapter's pages (see pdf-images.ts) but,
 * until now, arrived as an unsorted gallery the teacher had to place by hand.
 * Gemini is multimodal, so it can *look* at each figure rather than guess from
 * page numbers — it can tell a water-cycle diagram from a photo of children
 * planting, and match it to the right activity.
 *
 * Cost/risk notes:
 *  - This needs both the manual and the figures, so unlike extraction it can't
 *    run alongside generation; it's a second model call on the wall clock. That
 *    is affordable because generation is now a background job.
 *  - Strictly best-effort: any failure returns the manual untouched. A missing
 *    placement is a small loss; a failed generation is a big one.
 *  - Placements are suggestions. Every figure stays in the gallery, and the
 *    teacher can remove or move any of them before export.
 */

/**
 * A small, fast model — placement is image classification, not deep reasoning.
 *
 * Measured against gemini-2.5-flash on the same figures: 1.9s vs 22.3s (12x
 * faster), and it placed *more* figures correctly (it matched a photo of
 * children planting to the introduction activity, which 2.5-flash skipped),
 * while still refusing to place a decorative logo.
 *
 * It also matters for quota: the Gemini free tier is metered per project *per
 * model*, so running placement on a different model than generation means
 * Phase 4 doesn't halve how many manuals can be produced in a day.
 *
 * Note: this model rejects `thinkingConfig.thinkingBudget: 0` with a 400, and
 * doesn't need it — the default is already fast.
 */
const MODEL = "gemini-3.5-flash-lite";

/** Sections rarely need more than a couple of figures to stay printable. */
const MAX_PER_SECTION = 2;
/** Keep the prompt cheap: enough section text to judge relevance, no more. */
const CONTENT_EXCERPT_CHARS = 400;

let ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  ai ??= new GoogleGenAI({ apiKey });
  return ai;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    placements: {
      type: Type.ARRAY,
      description:
        "One entry per figure worth placing. Omit figures that don't clearly belong anywhere.",
      items: {
        type: Type.OBJECT,
        properties: {
          figureIndex: {
            type: Type.INTEGER,
            description: "The FIGURE number shown with the image, starting at 0",
          },
          sectionId: {
            type: Type.STRING,
            description: "id of the section this figure supports",
          },
          caption: {
            type: Type.STRING,
            description:
              "Short caption describing what the figure shows, in the manual's language",
          },
        },
        required: ["figureIndex", "sectionId", "caption"],
        propertyOrdering: ["figureIndex", "sectionId", "caption"],
      },
    },
  },
  required: ["placements"],
};

const PlacementsSchema = z.object({
  placements: z.array(
    z.object({
      figureIndex: z.number().int(),
      sectionId: z.string(),
      caption: z.string(),
    })
  ),
});

const SYSTEM_PROMPT = `You place figures from a Kerala SCERT school textbook into the right sections of a teaching manual.

You will see numbered figures (actual images from the chapter) and the manual's sections.

For each figure, decide which single section it best supports — or leave it out entirely.

Rules:
- Look at what the figure actually shows. Do not assume from page order.
- Place a figure ONLY where it genuinely helps teach that section. Leaving a figure unplaced is correct and expected; the teacher still sees it in the gallery.
- Typical fits: a diagram or process illustration supports concepts or learningActivities; a photo of an activity/experiment supports introduction or learningActivities; a table or exercise image supports assessment or followUp.
- Do NOT place decorative art, page borders, logos, mastheads, or cover images. Skip them.
- Never place the same figure in more than one section.
- Prefer few, well-matched placements over many weak ones. Most chapters need 2-5 placed figures.
- caption: one short line saying what the figure shows, written in the manual's language. Do not write "Figure 1" — describe the content.
- sectionId must be copied exactly from the section list.`;

export interface PlaceFiguresInput {
  manual: TeachingManual;
  images: TextbookImage[];
  language: OutputLanguage;
}

export interface PlaceFiguresResult {
  manual: TeachingManual;
  placed: number;
}

/** Strip the `data:image/...;base64,` prefix the SDK doesn't want. */
function toBase64(src: string): string | null {
  const comma = src.indexOf(",");
  return comma === -1 ? null : src.slice(comma + 1);
}

export async function placeFigures({
  manual,
  images,
  language,
}: PlaceFiguresInput): Promise<PlaceFiguresResult> {
  if (images.length === 0 || manual.sections.length === 0) {
    return { manual, placed: 0 };
  }

  const languageNote =
    language === "en"
      ? "Write captions in English."
      : language === "ml"
        ? "Write captions in Malayalam."
        : "Write captions in Malayalam.";

  const sectionList = manual.sections
    .map(
      (s) =>
        `- id: ${s.id} (${s.type})\n  title: ${s.titleEn}\n  content: ${s.content
          .replace(/\s+/g, " ")
          .slice(0, CONTENT_EXCERPT_CHARS)}`
    )
    .join("\n");

  // Interleave a label with each image so the model can refer to figures by
  // index; images alone carry no identity.
  const parts: Part[] = [];
  const usableIndexes: number[] = [];
  images.forEach((img, i) => {
    const data = toBase64(img.src);
    if (!data) return;
    parts.push({ text: `FIGURE ${i} (textbook page ${img.page}):` });
    parts.push({ inlineData: { mimeType: "image/jpeg", data } });
    usableIndexes.push(i);
  });

  if (usableIndexes.length === 0) return { manual, placed: 0 };

  parts.push({
    text: [
      "",
      `Manual: ${manual.basicInfo.subject}, Standard ${manual.basicInfo.standard}, ${manual.basicInfo.unitName}`,
      languageNote,
      "",
      "Sections:",
      sectionList,
      "",
      "Place the figures now.",
    ].join("\n"),
  });

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) return { manual, placed: 0 };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { manual, placed: 0 };
  }

  const parsed = PlacementsSchema.safeParse(json);
  if (!parsed.success) return { manual, placed: 0 };

  // Validate hard: the model can hallucinate a section id or reuse a figure,
  // and a bad placement would corrupt the manual the teacher exports.
  const byId = new Map(manual.sections.map((s) => [s.id, s]));
  const perSection = new Map<string, number>();
  const usedFigures = new Set<number>();
  const additions = new Map<string, ImageItem[]>();
  let placed = 0;

  for (const p of parsed.data.placements) {
    const img = images[p.figureIndex];
    if (!img) continue;
    if (usedFigures.has(p.figureIndex)) continue;
    if (!byId.has(p.sectionId)) continue;

    const count = perSection.get(p.sectionId) ?? 0;
    if (count >= MAX_PER_SECTION) continue;

    usedFigures.add(p.figureIndex);
    perSection.set(p.sectionId, count + 1);
    placed++;

    const item: ImageItem = {
      kind: "image",
      src: img.src,
      caption: p.caption?.trim() || undefined,
      source: `Textbook p.${img.page}`,
      width: img.width,
      height: img.height,
    };
    additions.set(p.sectionId, [...(additions.get(p.sectionId) ?? []), item]);
  }

  if (placed === 0) return { manual, placed: 0 };

  return {
    manual: {
      ...manual,
      sections: manual.sections.map((s) => {
        const extra = additions.get(s.id);
        if (!extra) return s;
        return { ...s, media: [...(s.media ?? []), ...extra] };
      }),
    },
    placed,
  };
}
