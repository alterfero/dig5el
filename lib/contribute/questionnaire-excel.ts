import readExcelFile, { type Sheet } from "read-excel-file/browser";
import { ImportError, maximumRows } from "./imports";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  throw new ImportError("malformed");
}

/** The v1 transcription sheet has one indexed row per turn, followed by concept rows. */
export function parseQuestionnaireSheets(sheets: Sheet[]): Record<string, unknown> {
  const info = sheets.find((sheet) => sheet.sheet === "Info")?.data;
  const transcription = sheets.find((sheet) => sheet.sheet === "Transcription")?.data;
  if (!info || !transcription) throw new ImportError("questionnaireSheets");
  const uid = cell(info[2]?.[0]).match(/^[“"']?UID\s*:\s*([^”"']+)[”"']?$/iu)?.[1].trim();
  if (!uid) throw new ImportError("questionnaireTemplate");
  const metadata = new Map(info.map((row) => [cell(row[0]), cell(row[1])]));
  const header = transcription[0]?.map(cell) ?? [];
  if (header[0] !== "Index" || header[1] !== "English" || header[2] !== "Pivot (if not English)" || !header[3]?.startsWith("Sentence in ") || header[4] !== "Literal English Back-Translation" || header[5] !== "Concept item" || !header[6]?.startsWith("Word(s) contributing") || header[7] !== "Notes") throw new ImportError("questionnaireSheets");
  const entries: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | undefined;
  let concepts: Record<string, string> = Object.create(null);
  for (const row of transcription.slice(1)) {
    const [index, english, pivot, translation, literal, concept, words, notes] = Array.from({ length: 8 }, (_, i) => cell(row[i]));
    if (![index, english, pivot, translation, literal, concept, words, notes].some(Boolean)) continue;
    if (index) {
      concepts = Object.create(null);
      current = { "legacy index": index, cq: "", alternate_pivot: "", translation: "", lebt: "", comment: "", concept_words: concepts };
      entries.push(current);
      if (entries.length > maximumRows) throw new ImportError("questionnaireTooLarge");
    }
    if (!current) throw new ImportError("questionnaireRows");
    // Preserve fields entered on continuation rows, as the v1 reader does.
    for (const [key, value] of Object.entries({ cq: english, alternate_pivot: pivot, translation, lebt: literal })) {
      if (value) {
        if (current[key] && current[key] !== value) throw new ImportError("questionnaireRows");
        current[key] = value;
      }
    }
    if (notes) current.comment = [current.comment, notes].filter(Boolean).join("\n");
    if (concept) concepts[concept] = [concepts[concept], words].filter(Boolean).join("...");
    else if (words) throw new ImportError("questionnaireRows");
  }
  if (!entries.length) throw new ImportError("empty");
  return {
    cq_uid: uid,
    "target language": metadata.get("Target language") || metadata.get("Language under study") || "",
    "pivot language": metadata.get("Pivot language (if any)") || "English",
    interviewer: metadata.get("Transcription made by") || "",
    interviewee: metadata.get("Content provided by") || "",
    location: metadata.get("Recording location") || "",
    date: metadata.get("Recording date") || "",
    data: Object.fromEntries(entries.map((entry, index) => [String(index + 1), entry])),
  };
}

export async function readQuestionnaireExcel(file: File): Promise<Record<string, unknown>> {
  try { return parseQuestionnaireSheets(await readExcelFile(await file.arrayBuffer())); }
  catch (error) { throw error instanceof ImportError ? error : new ImportError("malformed"); }
}
