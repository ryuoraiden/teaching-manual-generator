export interface ManualLine {
  text: string;
  kind:
    | "blank"
    | "activity"
    | "reference"
    | "consolidation"
    | "worksheet"
    | "bullet"
    | "numbered"
    | "normal";
}

const activityRe = /^(activity|പ്രവർത്തനം|പ്രവര്‍ത്തനം)\s*\d*/iu;
const referenceRe = /\b(TB|HB|textbook|handbook|page)\b|പേജ്|ചിത്ര|നിരീക്ഷ/iu;
const consolidationRe = /^(consolidation|ക്രോഡീകരണം|വിലയിരുത്തൽ|നിഗമനം)/iu;
const worksheetRe = /(worksheet|work\s*sheet|വർക്ക്\s*ഷീറ്റ്|പട്ടിക|table)/iu;
const bulletRe = /^[-*•●]\s*/u;
const numberedRe = /^\d+[\).]\s*/u;

export function classifyManualLines(content: string): ManualLine[] {
  return content.split(/\r?\n/).map((raw) => {
    const text = raw.trim();
    if (!text) return { text: "", kind: "blank" };
    if (activityRe.test(text)) return { text, kind: "activity" };
    if (worksheetRe.test(text)) return { text, kind: "worksheet" };
    if (consolidationRe.test(text)) return { text, kind: "consolidation" };
    if (referenceRe.test(text)) return { text, kind: "reference" };
    if (bulletRe.test(text)) return { text: text.replace(bulletRe, ""), kind: "bullet" };
    if (numberedRe.test(text)) return { text, kind: "numbered" };
    return { text, kind: "normal" };
  });
}

export function sectionNumberLabel(index: number): string {
  return `Module ${Math.floor(index / 3) + 1}.${(index % 3) + 1}`;
}
