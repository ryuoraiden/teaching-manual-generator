import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import {
  BasicInfoSchema,
  SECTION_TYPES,
  SectionSchema,
  type OutputLanguage,
  type TeachingManual,
} from "./manual-schema";
import {
  RESOURCE_PLATFORMS,
  suggestionToLink,
} from "./resource-links";

/**
 * Generation layer - Google Gemini (free tier).
 *
 * The route passes extracted textbook text, teacher-handbook text, and optional
 * source-index context. The uploaded PDFs remain the factual source; the index
 * context only teaches the model what Kerala SCERT resource family/style it is
 * writing for.
 */

const MODEL = "gemini-2.5-flash";

let ai: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to .env.local."
    );
  }
  ai ??= new GoogleGenAI({ apiKey });
  return ai;
}

export interface GenerateManualInput {
  standard: string;
  subject: string;
  chapterNumber: string;
  chapterName?: string;
  language: OutputLanguage;
  textbookExcerpt: string;
  handbookExcerpt: string;
  sourceContext?: string;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    basicInfo: {
      type: Type.OBJECT,
      properties: {
        standard: { type: Type.STRING },
        subject: { type: Type.STRING },
        unitName: {
          type: Type.STRING,
          description: "Unit/chapter name as printed in the textbook",
        },
        chapterNumber: { type: Type.STRING },
        estimatedTime: {
          type: Type.STRING,
          description: "e.g. '6 periods (40 min each)'",
        },
      },
      required: ["standard", "subject", "unitName", "chapterNumber", "estimatedTime"],
      propertyOrdering: [
        "standard",
        "subject",
        "unitName",
        "chapterNumber",
        "estimatedTime",
      ],
    },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: "kebab-case slug, e.g. 'learning-outcomes'" },
          type: { type: Type.STRING, enum: [...SECTION_TYPES] },
          titleMl: { type: Type.STRING, description: "Section title in Malayalam" },
          titleEn: { type: Type.STRING, description: "Section title in English" },
          content: {
            type: Type.STRING,
            description:
              "Section body. Plain text; '- ' at line start for bullets; blank line between steps.",
          },
          resources: {
            type: Type.ARRAY,
            description:
              "0-3 digital resource SEARCH suggestions for this section (empty array when none add real value). Never URLs — only search queries.",
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description:
                    "Short display label for the resource, in the manual's language",
                },
                searchQuery: {
                  type: Type.STRING,
                  description:
                    "The exact search text a teacher would type to find this resource",
                },
                platform: { type: Type.STRING, enum: [...RESOURCE_PLATFORMS] },
              },
              required: ["label", "searchQuery", "platform"],
              propertyOrdering: ["label", "searchQuery", "platform"],
            },
          },
        },
        required: ["id", "type", "titleMl", "titleEn", "content", "resources"],
        propertyOrdering: [
          "id",
          "type",
          "titleMl",
          "titleEn",
          "content",
          "resources",
        ],
      },
    },
  },
  required: ["basicInfo", "sections"],
  propertyOrdering: ["basicInfo", "sections"],
};

/**
 * What Gemini actually returns: TeachingManual sections plus raw resource
 * suggestions. We validate this shape, then convert suggestions into
 * guaranteed-valid search links (media[]) — the model never writes URLs.
 */
const ResourceSuggestionSchema = z.object({
  label: z.string(),
  searchQuery: z.string(),
  platform: z.enum(RESOURCE_PLATFORMS),
});

const GeneratedManualSchema = z.object({
  basicInfo: BasicInfoSchema,
  sections: z.array(
    SectionSchema.omit({ media: true }).extend({
      resources: z.array(ResourceSuggestionSchema).optional(),
    })
  ),
});

const SYSTEM_PROMPT = `You are an expert teacher-educator for the Kerala state syllabus (SCERT Kerala, Standards I-VII). You write teaching manuals - practical lesson plans Kerala teachers can use directly in class.

You will be given:
- <textbook_excerpt>: chapter content from the student textbook
- <handbook_excerpt>: relevant guidance from the teacher handbook
- <source_index_context>: optional public index context from TextbooksAll / SCERT / Samagra links

Ground every part of the manual in the textbook and handbook excerpts. Use <source_index_context> only as source-family and style context: it tells you that Kerala resources are organized as textbooks, teacher handbooks, teaching manuals, worksheets, study notes and question papers. Do not copy web-page text, and do not invent claims from links alone.

Follow Kerala's constructivist, activity-based pedagogy: children construct knowledge through group activity, observation, discussion, presentation and reflection. Avoid lecture-heavy plans.

Produce ALL standard sections, in this order, using exactly these type values:
1. learningOutcomes - specific, observable outcomes
2. concepts - core ideas of the chapter
3. materials - textbook, charts, ICT tools and local materials
4. introduction - an entry activity rooted in children's experience
5. learningActivities - detailed numbered activities with teacher role, student task, questions, expected responses and consolidation notes
6. consolidation - how the teacher summarizes and formalizes concepts
7. assessment - continuous evaluation tasks/questions
8. followUp - homework, extension and remedial tasks

Set each section id to the kebab-case form of its type. Use Malayalam section titles in titleMl and English titles in titleEn.

Quality rules:
- Write like a teacher can walk into class and follow the manual immediately.
- Do not summarize the textbook chapter; convert it into classroom transaction steps.
- Mention textbook page/image/table/QR-code use when the excerpts refer to them, but never create fake image placeholders.
- Materials must name specific resources from the chapter/handbook where possible.
- Learning activities should include grouping, prompt questions, expected student responses, board/chart work, ICT use, textbook references, discussion and presentation.
- Keep content printable: clear bullets, numbered activity steps, concise paragraphs, no decorative labels.
- Do not copy sentences verbatim from textbook, handbook, or web pages.

Formatting for section content: plain text; '- ' at line start for bullets; blank lines between steps; number activity steps.

Digital resource suggestions (the per-section "resources" array):
- Suggest 0-3 per section, and ONLY where a video, article or simulation genuinely helps teach that section — typically introduction, learningActivities and followUp. Most sections should have an empty array.
- NEVER invent URLs. Provide only a search query a teacher would type. The system converts it into a safe search link.
- platform "youtube" for classroom videos (add "KITE VICTERS" to the query when a Kerala school broadcast likely exists), "wikipedia" for reference articles (query in Malayalam for Malayalam-medium topics, English otherwise), "google" for anything else (worksheets, PhET simulations, DIKSHA content).
- label: short and in the manual's language, e.g. "ജലചക്രം - വീഡിയോ" or "Water cycle simulation".`;

export async function generateManual(
  input: GenerateManualInput
): Promise<TeachingManual> {
  const languageInstruction =
    input.language === "both"
      ? "Write section content bilingually: Malayalam first, then English."
      : input.language === "ml"
        ? "Write section content in Malayalam."
        : "Write section content in English.";

  const userPrompt = [
    `Standard: ${input.standard}`,
    `Subject: ${input.subject}`,
    `Chapter number: ${input.chapterNumber}`,
    input.chapterName ? `Chapter name: ${input.chapterName}` : "",
    languageInstruction,
    "",
    `<textbook_excerpt>\n${input.textbookExcerpt}\n</textbook_excerpt>`,
    "",
    `<handbook_excerpt>\n${input.handbookExcerpt}\n</handbook_excerpt>`,
    input.sourceContext
      ? `\n<source_index_context>\n${input.sourceContext}\n</source_index_context>`
      : "",
    "",
    "Generate the complete teaching manual for this chapter now.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.35,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(
      "The model returned no output. This can happen when the free-tier rate limit is hit or the response was blocked - try again in a moment."
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The model did not return valid JSON.");
  }

  const parsed = GeneratedManualSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Model output did not match the teaching-manual schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`
    );
  }

  // Convert search suggestions into guaranteed-valid links (max 3/section).
  return {
    basicInfo: parsed.data.basicInfo,
    sections: parsed.data.sections.map(({ resources, ...section }) => ({
      ...section,
      media: (resources ?? []).slice(0, 3).map(suggestionToLink),
    })),
  };
}
