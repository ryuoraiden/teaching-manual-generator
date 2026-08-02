import type { TeachingManual, TextbookImage } from "./manual-schema";

/**
 * Sample manual used by the dev-only /demo route so the editor can be opened
 * (and its layout measured on phone widths) without uploading two PDFs and
 * waiting for a generation round-trip.
 *
 * Content mirrors what Gemini actually produces: bilingual text, numbered
 * activities, bullets, a couple of images and a couple of links.
 */

// Tiny inline SVG-as-data-URI stand-ins for extracted textbook figures.
// URI-encoded (not base64) so this module works in both the server and the
// client bundle — `Buffer` does not exist in the browser.
function placeholder(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="${bg}"/><text x="120" y="86" font-family="sans-serif" font-size="18" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const DEMO_TEXTBOOK_IMAGES: TextbookImage[] = [
  { src: placeholder("Fig 3.1", "#0f766e"), page: 34, width: 240, height: 160 },
  { src: placeholder("Fig 3.2", "#7c2d12"), page: 35, width: 240, height: 160 },
  { src: placeholder("Fig 3.3", "#1e3a8a"), page: 36, width: 240, height: 160 },
  { src: placeholder("Fig 3.4", "#4c1d95"), page: 38, width: 240, height: 160 },
];

export const DEMO_MANUAL: TeachingManual = {
  basicInfo: {
    standard: "IV",
    subject: "പരിസരപഠനം / EVS",
    unitName: "നമ്മുടെ ചുറ്റുപാട്",
    chapterNumber: "3",
    estimatedTime: "6 periods (40 min each)",
  },
  sections: [
    {
      id: "learning-outcomes",
      type: "learningOutcomes",
      titleMl: "പഠനനേട്ടങ്ങൾ",
      titleEn: "Learning Outcomes",
      content: [
        "- കുട്ടികൾ ചുറ്റുപാടിലെ സസ്യങ്ങളെയും ജന്തുക്കളെയും നിരീക്ഷിച്ച് സവിശേഷതകൾ തിരിച്ചറിയുന്നു.",
        "- Children observe plants and animals around them and identify their characteristics.",
        "- ജീവീയ, അജീവീയ ഘടകങ്ങൾ വേർതിരിച്ച് മനസ്സിലാക്കുന്നു.",
      ].join("\n"),
    },
    {
      id: "learning-activities",
      type: "learningActivities",
      titleMl: "പഠനപ്രവർത്തനങ്ങൾ",
      titleEn: "Learning Activities",
      content: [
        "പ്രവർത്തനം 1: സ്കൂൾ പരിസര നിരീക്ഷണം",
        "",
        "1. കുട്ടികളെ നാലോ അഞ്ചോ അംഗങ്ങളുള്ള ഗ്രൂപ്പുകളായി തിരിക്കുന്നു. ഓരോ ഗ്രൂപ്പിനും ചാർട്ട് പേപ്പറും മാർക്കറും നൽകുന്നു.",
        "",
        "2. സ്കൂൾ പരിസരത്തുള്ള അഞ്ച് സസ്യങ്ങളെ നിരീക്ഷിക്കാൻ നിർദ്ദേശിക്കുന്നു. ഇലകളുടെ ആകൃതി, നിറം, വലുപ്പം എന്നിവ ശ്രദ്ധിക്കാൻ ആവശ്യപ്പെടുന്നു.",
        "",
        "3. നിരീക്ഷണങ്ങൾ ചാർട്ടിൽ പട്ടികപ്പെടുത്തി ക്ലാസിൽ അവതരിപ്പിക്കുന്നു. TB പേജ് 34 ലെ ചിത്രവുമായി താരതമ്യം ചെയ്യുന്നു.",
      ].join("\n"),
      media: [
        {
          kind: "image",
          src: placeholder("Fig 3.1", "#0f766e"),
          caption: "സസ്യ നിരീക്ഷണം",
          source: "Textbook p.34",
          width: 240,
          height: 160,
        },
        {
          kind: "link",
          label: "Plants around us (classroom video)",
          url: "https://www.youtube.com/results?search_query=plants+around+us+malayalam+class+4",
          linkType: "video",
        },
        {
          kind: "link",
          label: "Samagra (KITE Kerala) resource portal",
          url: "https://samagra.kite.kerala.gov.in",
          linkType: "resource",
        },
      ],
    },
    {
      id: "assessment",
      type: "assessment",
      titleMl: "വിലയിരുത്തൽ",
      titleEn: "Assessment / Evaluation",
      content: [
        "- നിരീക്ഷണ ചാർട്ട് പൂർത്തിയാക്കിയോ എന്ന് പരിശോധിക്കുന്നു.",
        "- ഗ്രൂപ്പ് അവതരണത്തിൽ പങ്കാളിത്തം വിലയിരുത്തുന്നു.",
      ].join("\n"),
      media: [
        {
          kind: "link",
          label: "Ecosystem basics",
          url: "https://ml.wikipedia.org/w/index.php?search=%E0%B4%86%E0%B4%B5%E0%B4%BE%E0%B4%B8%E0%B4%B5%E0%B5%8D%E0%B4%AF%E0%B4%B5%E0%B4%B8%E0%B5%8D%E0%B4%A5",
          linkType: "resource",
        },
      ],
    },
  ],
};
