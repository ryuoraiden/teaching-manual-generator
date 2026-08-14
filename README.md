# Teaching Manual Generator

Generate structured **teaching manuals (അധ്യാപന സഹായി)** for the Kerala state
syllabus (Standards I–VII), grounded in the official government teacher
handbook and the student textbook — then edit section-by-section and export as
**PDF** and **Word (.docx)** with correct Malayalam rendering.

## Quick start

```bash
npm install
npx playwright install chromium   # one-time; used for Malayalam-correct PDF export
node scripts/download-fonts.mjs   # fetches Noto Sans Malayalam (embedded in exported PDFs)
copy .env.example .env.local      # then paste your free GEMINI_API_KEY
npm run dev
```

**Get a free API key** (no credit card): https://aistudio.google.com/apikey →
paste into `.env.local` as `GEMINI_API_KEY`.

Open http://localhost:3000, upload a textbook PDF + teacher handbook PDF,
enter the chapter, and generate.

> **Cost:** $0. Generation runs on **Google Gemini's free tier**. Everything
> else runs locally.
>
> ⚠️ **Free-tier quota is metered per model, per day, and it is small.** As of
> 2026-08-15 `gemini-2.5-flash` returns HTTP 429 after **20 requests/day**
> (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`) — a ceiling on how many
> manuals the whole site can produce, not a per-user limit. Set `GEMINI_MODEL`
> in `.env.local` (or `~/manual.env` on the VM) to point generation at a
> different model, which gets its own daily bucket. Figure placement
> deliberately runs on a *different* model (`gemini-3.5-flash-lite`) so it
> doesn't consume the generation budget.

## How it works (data flow)

```
Upload (textbook.pdf, handbook.pdf, chapter, language)
   │
   ▼
POST /api/generate-manual
   1. extract   src/lib/pdf-extract.ts   pdf-parse → per-page Unicode text
   2. retrieve  src/lib/retrieval.ts     textbook: chapter slicing (heading heuristics)
                                         handbook: lexical top-k chunk selection
   3. generate  src/lib/llm.ts           Gemini (gemini-2.5-flash) + responseSchema JSON,
   │                                     re-validated with Zod → schema-valid TeachingManual
   ▼
Editor (client state only — src/components/ManualEditor.tsx)
   edit / add / remove / reorder sections; the LLM is not involved here
   │
   ▼
POST /api/export/pdf   src/lib/export/pdf.ts   pdfmake + embedded Noto Sans Malayalam
POST /api/export/docx  src/lib/export/docx.ts  docx + font declaration (Word shapes at render)
```

The **generation layer** and the **editing/export layer** share exactly one
contract: `TeachingManualSchema` in `src/lib/manual-schema.ts` (zod). The same
schema shapes the Gemini structured-output response, is typed into the React
editor state, and is validated again by the export routes.

## Teaching manual schema

`basicInfo` (standard, subject, unit, chapter, estimated time) plus an ordered
`sections[]` array. Standard section types, generated in this order:

| type | Malayalam | English |
|---|---|---|
| learningOutcomes | പഠനനേട്ടങ്ങൾ | Learning Outcomes |
| concepts | ആശയങ്ങൾ | Concepts / Ideas |
| materials | ആവശ്യമായ സാമഗ്രികൾ | Materials / Resources |
| introduction | പ്രവേശകം | Introduction / Ice-breaker |
| learningActivities | പഠനപ്രവർത്തനങ്ങൾ | Learning Activities |
| consolidation | ക്രോഡീകരണം | Consolidation / Review |
| assessment | വിലയിരുത്തൽ | Assessment / Evaluation |
| followUp | തുടർപ്രവർത്തനങ്ങൾ | Follow-up / Extension |

Sections are an *array*, not fixed fields, so teachers can add (`custom`),
remove, and reorder freely — the export renderers just walk the array.

## Malayalam text: the three places it can break

1. **Extraction** — recent SCERT PDFs are Unicode and extract cleanly.
   Scanned PDFs need OCR; pre-Unicode DTP fonts extract as mojibake.
   `pdf-extract.ts` detects near-empty extraction and reports it instead of
   sending garbage to the model.
2. **PDF export** — PDFs embed glyphs, so Malayalam needs full OpenType shaping
   (conjuncts, chillu, reph). We render the manual as HTML with Noto Sans
   Malayalam inlined as a data-URI `@font-face` and let **headless Chromium
   (Playwright)** print it — browser text shaping (HarfBuzz) is flawless.
   (JS PDF libs fall short here: pdfmake/pdfkit's fontkit crashes on Noto's
   GPOS tables, and `@react-pdf/renderer` skips complex-script shaping
   entirely.) Run `npx playwright install chromium` once.
3. **DOCX export** — .docx references fonts by name; Word shapes at render
   time. We declare "Noto Sans Malayalam"; stock Windows falls back to
   Nirmala UI automatically.

## Project structure

```
src/
├── app/
│   ├── page.tsx                     # upload → edit phases
│   ├── layout.tsx                   # Noto Sans + Noto Sans Malayalam UI fonts
│   └── api/
│       ├── generate-manual/route.ts # extract → retrieve → generate
│       └── export/{pdf,docx}/route.ts
├── components/
│   ├── UploadForm.tsx
│   ├── ManualEditor.tsx             # basic info + section list + export buttons
│   └── SectionCard.tsx              # inline-editable section (move/remove)
└── lib/
    ├── manual-schema.ts             # THE shared contract (zod)
    ├── pdf-extract.ts
    ├── retrieval.ts                 # chapter slicing + handbook chunk ranking
    ├── llm.ts                       # Gemini client, responseSchema JSON, Zod re-validation
    └── export/{pdf.ts, docx.ts}     # pdf.ts = HTML + Playwright; docx.ts = docx lib
fonts/                               # Noto Sans Malayalam TTFs (embedded in PDFs)
scripts/download-fonts.mjs
```

## Design decisions (and deviations from the original spec)

- **Free LLM: Google Gemini, not the paid Claude API.** The project has zero
  budget; Gemini's free tier needs no credit card and is strong at Malayalam. We
  use its **structured output** (`responseSchema` +
  `responseMimeType: application/json`) and then re-validate with the same Zod
  schema, so a schema-valid manual is guaranteed. Swapping the provider touches
  only `src/lib/llm.ts` — the seam is the `generateManual()` signature. The
  model itself is `GEMINI_MODEL` (default `gemini-2.5-flash`) — see the quota
  warning above before changing it.
- **Figure placement runs on a second, smaller model** (`gemini-3.5-flash-lite`,
  in `src/lib/figure-placement.ts`). Measured against `gemini-2.5-flash` on the
  same figures: **1.9s vs 22.3s**, with equal-or-better placements. It also
  keeps placement out of the generation model's daily quota.
  - *Offline alternative (documented, not default):* Ollama (`gemma3` /
    `qwen2.5`) via its local OpenAI-compatible endpoint — no key, fully offline,
    but noticeably weaker Malayalam. Point `src/lib/llm.ts` at it if you ever
    need zero-internet.
  - *If budget appears later:* Anthropic Claude gives the best quality — restore
    a `claude-opus-4-8` implementation behind the same `generateManual()`.
- **PDF export via HTML + Playwright (headless Chromium)** — the only reliable
  way to get correct Malayalam shaping in a PDF (see Malayalam notes).
- **No database yet.** The minimal loop doesn't need one; manual state lives in
  the client and round-trips through export. See roadmap.

## Roadmap / next steps

- [ ] **Persistence**: Prisma + SQLite locally (`provider = "sqlite"`), swap the
      datasource to PostgreSQL when hosting. Save/load manuals per teacher.
- [ ] **Reference corpus ingestion**: pre-ingest handbooks/textbooks/sample
      manuals once (instead of per-request parsing), with embeddings
      (e.g. Voyage AI multilingual) + a vector index replacing the lexical
      scorer in `retrieval.ts`. The two function signatures there are the
      seam — nothing else changes.
- [ ] **Real few-shot exemplars**: load 1–2 digitised sample manuals into the
      system prompt (see TODO in `llm.ts`) — as style reference only.
- [ ] **OCR fallback** for scanned PDFs (Tesseract `mal`).
- [ ] shadcn/ui polish, auth, hosting.
