export interface SourceContextInput {
  standard: string;
  subject: string;
  chapterNumber: string;
  chapterName?: string;
}

type SourceLink = {
  label: string;
  url: string;
};

const TEXTBOOKS_ALL_ROOT =
  "https://textbooksall.blogspot.com/2024/05/std-1-3-5-7-9-2024-24-textbooks-for.html";

const STD_VII_LINKS: SourceLink[] = [
  {
    label: "Std VII textbook index",
    url: "https://textbooksall.blogspot.com/2016/11/text-books-for-scert-kerala-std-vii.html",
  },
  {
    label: "Std VII teacher handbook index",
    url: "https://textbooksall.blogspot.com/2020/05/scert-kerala-teacher-text-std-vii.html",
  },
  {
    label: "Std VII teaching manual index",
    url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-all-subjects-new.html",
  },
  {
    label: "Samagra portal",
    url: "https://samagra.kite.kerala.gov.in/#/home/page",
  },
];

const STD_VII_SUBJECT_LINKS: Record<string, SourceLink[]> = {
  "basic science": [
    {
      label: "Std VII Basic Science teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-basic-science-new.html",
    },
    {
      label: "Std VII Science teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii.html",
    },
    {
      label: "Std VII Basic Science Malayalam textbook, Samagra",
      url: "https://samagra.kite.kerala.gov.in/files/samagra-resource/uploads/tbookscmq/Class_VII/Basic%20Science_M_Vol_II/BasicScienceMalayalam.pdf",
    },
  ],
  science: [
    {
      label: "Std VII Basic Science teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-basic-science-new.html",
    },
    {
      label: "Std VII Science teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii.html",
    },
  ],
  "social science": [
    {
      label: "Std VII Social Science teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-social-science-new.html",
    },
    {
      label: "Std VII Social Science teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_20.html",
    },
  ],
  maths: [
    {
      label: "Std VII Mathematics teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-mathematics-new.html",
    },
    {
      label: "Std VII Maths teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_62.html",
    },
  ],
  mathematics: [
    {
      label: "Std VII Mathematics teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-mathematics-new.html",
    },
    {
      label: "Std VII Maths teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_62.html",
    },
  ],
  english: [
    {
      label: "Std VII English teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-english-new.html",
    },
    {
      label: "Std VII English teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_14.html",
    },
  ],
  hindi: [
    {
      label: "Std VII Hindi teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/06/scert-kerala-std-vii-hindi-new-teaching.html",
    },
    {
      label: "Std VII Hindi teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_18.html",
    },
  ],
  malayalam: [
    {
      label: "Std VII Malayalam AT teaching manuals",
      url: "https://textbooksall.blogspot.com/2024/07/scert-kerala-std-vii-malayalam-new.html",
    },
    {
      label: "Std VII Malayalam BT teaching manuals",
      url: "https://textbooksall.blogspot.com/2025/06/scert-kerala-std-vii-malayalam-bt-new.html",
    },
    {
      label: "Std VII Malayalam teacher text",
      url: "https://textbooksall.blogspot.com/2020/07/scert-kerala-teacher-text-std-vii_10.html",
    },
  ],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
}

function romanToNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  const romans: Record<string, string> = {
    I: "1",
    II: "2",
    III: "3",
    IV: "4",
    V: "5",
    VI: "6",
    VII: "7",
    VIII: "8",
    IX: "9",
    X: "10",
  };
  return romans[normalized] ?? normalized;
}

export function getSourceContext(input: SourceContextInput): string {
  const standardNumber = romanToNumber(input.standard);
  const subjectKey = normalize(input.subject);
  const isStdVII = standardNumber === "7";
  const subjectLinks = isStdVII
    ? Object.entries(STD_VII_SUBJECT_LINKS).find(([key]) => subjectKey.includes(key))?.[1] ??
      []
    : [];

  const links = [
    {
      label: "TextbooksAll Kerala syllabus resource index",
      url: TEXTBOOKS_ALL_ROOT,
    },
    ...(isStdVII ? STD_VII_LINKS : []),
    ...subjectLinks,
  ];

  const linkText = links
    .map((link) => `- ${link.label}: ${link.url}`)
    .join("\n");

  return [
    "Source index context from TextbooksAll and linked SCERT/Samagra resources:",
    linkText,
    "",
    "What this source index implies for generation:",
    "- Kerala SCERT resources are organized separately as student textbooks, teacher handbooks/teacher texts, teaching manuals, study notes, worksheets and question papers.",
    "- Teaching manuals are subject-wise and standard-wise. They should read like a practical teacher lesson plan, not a textbook summary.",
    "- Use the uploaded textbook and handbook excerpts as the factual source of the chapter. Use this index only as style/source-family context and for naming the relevant resource family.",
    "- Follow the teaching-manual pattern: learning outcomes, concepts, materials, entry activity, detailed numbered learning activities, consolidation, continuous assessment and follow-up.",
    "- When the lesson depends on a textbook image, QR code, table or worksheet, describe the exact classroom use of that resource instead of inserting fake placeholder art.",
    "- Prefer concrete teacher actions: grouping, questions to ask, expected student responses, blackboard/chart notes, ICT use, textbook-page references, observation, discussion and presentation.",
    `Requested lesson: Standard ${input.standard}, ${input.subject}, chapter ${input.chapterNumber}${
      input.chapterName ? `, ${input.chapterName}` : ""
    }.`,
  ].join("\n");
}
