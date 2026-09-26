import { emptySentence, newSource, sentenceKey, sentenceWords, startQuestionnaire, type QuestionnaireTemplate, type Sentence, type Source } from "./model";
import { isSource, maximumSourceBytes } from "./validation";

export class ImportError extends Error {
  constructor(readonly code: "format" | "empty" | "tooLarge" | "columns" | "language" | "malformed" | "questionnaireTemplate" | "questionnaireSheets" | "questionnaireRows" | "questionnaireTooLarge") {
    super(code);
  }
}

export const maximumFileBytes = 10 * 1024 * 1024;
export const maximumRows = 5000;
export type ImportRow = { row: Sentence; line: number; issue: "missing" | "duplicate" | null; included: boolean };

/** RFC 4180-style quoting, including escaped quotes and embedded newlines. */
export function parseDelimited(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  const input = text.replace(/^\uFEFF/u, "");
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === delimiter || char === "\n" || char === "\r") {
      row.push(field); field = ""; closed = false;
      if (char !== delimiter) {
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        if (char === "\r" && input[i + 1] === "\n") i++;
      }
    } else {
      if (closed || char === '"') throw new ImportError("malformed");
      field += char;
    }
  }
  if (quoted) throw new ImportError("malformed");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length > maximumRows + 1) throw new ImportError("tooLarge");
  return rows;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ImportError("format");
  return value as Record<string, unknown>;
}
function str(value: unknown): string { return typeof value === "string" ? value : ""; }

function parsePairTable(text: string, filename: string): string[][] {
  let input = text.replace(/^\uFEFF/u, "").replace(/^(?:[ \t]*(?:\r\n|\r|\n))+/u, "");
  const declaration = /^sep=([,;\t])[ \t]*(?:\r\n|\r|\n)/iu.exec(input);
  let delimiter = /\.tsv$/iu.test(filename) ? "\t" : ",";
  if (declaration) {
    delimiter = declaration[1];
    input = input.slice(declaration[0].length);
  } else {
    // Spreadsheet exports may change the separator without changing .csv.
    // Inspect only the header, excluding punctuation inside quoted names.
    const separators = new Set<string>();
    let quoted = false;
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === '"') {
        if (quoted && input[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted) {
        if (char === "\r" || char === "\n") break;
        if (char === "," || char === ";" || char === "\t") separators.add(char);
      }
    }
    delimiter = [delimiter, ",", ";", "\t"].find((candidate) => separators.has(candidate)) ?? delimiter;
  }
  return parseDelimited(input, delimiter);
}

export function parsePairs(text: string, filename: string, referenceColumn = "source", translationColumn = "target"): { columns: string[]; rows: Sentence[]; original: unknown } {
  if (/\.json$/iu.test(filename)) {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new ImportError("malformed"); }
    if (!Array.isArray(parsed) || parsed.length > maximumRows) throw new ImportError("format");
    const rows = parsed.map((value) => {
      const entry = record(value);
      if (typeof entry.source !== "string" || typeof entry.target !== "string") throw new ImportError("columns");
      return { ...emptySentence(), reference: entry.source, translation: entry.target, comments: str(entry.comments), description: str(entry.description), original: entry };
    });
    if (!rows.length) throw new ImportError("empty");
    return { columns: ["source", "target"], rows, original: parsed };
  }
  if (!/\.(csv|tsv)$/iu.test(filename)) throw new ImportError("format");
  const [header, ...body] = parsePairTable(text, filename);
  if (!header || !body.length) throw new ImportError("empty");
  const columnIndexes = header.flatMap((cell, index) => {
    if (cell.trim()) return [index];
    // Ignore unused spreadsheet columns only when every value is empty.
    if (body.some((cells) => cells[index]?.trim())) throw new ImportError("columns");
    return [];
  });
  const columns = columnIndexes.map((index) => header[index].trim());
  if (columns.length < 2 || new Set(columns).size !== columns.length) throw new ImportError("columns");
  const minimumWidth = columnIndexes[columnIndexes.length - 1] + 1;
  if (body.some((cells) => cells.length < minimumWidth || cells.slice(header.length).some((cell) => cell.trim()))) throw new ImportError("malformed");
  if (!columns.includes(referenceColumn) || !columns.includes(translationColumn) || referenceColumn === translationColumn) {
    return { columns, rows: [], original: text };
  }
  const referenceIndex = columnIndexes[columns.indexOf(referenceColumn)], translationIndex = columnIndexes[columns.indexOf(translationColumn)];
  const rows = body.map((cells) => {
    return { ...emptySentence(), reference: cells[referenceIndex], translation: cells[translationIndex], original: cells };
  });
  return { columns, rows, original: text };
}

export function previewRows(rows: Sentence[], existing: Sentence[] = []): ImportRow[] {
  const seen = new Set(existing.map(sentenceKey));
  return rows.map((row, index) => {
    const key = sentenceKey(row);
    const issue = !row.reference.trim() || !row.translation.trim() ? "missing" : seen.has(key) ? "duplicate" : null;
    seen.add(key);
    return { row, line: index + 1, issue, included: issue === null };
  });
}

/** Uses only declared FLEx item types; language variants are explicit user choices. */
export function parseFlextext(text: string, language?: string): { rows: Sentence[]; translationLanguages: string[]; baselineLanguages: string[]; title: string } {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new ImportError("malformed");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror") || !doc.querySelector("interlinear-text")) throw new ImportError("format");
  const phrases = Array.from(doc.querySelectorAll("interlinear-text phrase"));
  if (!phrases.length) throw new ImportError("empty");
  if (phrases.length > maximumRows) throw new ImportError("tooLarge");
  const directItems = (element: Element, type: string) => Array.from(element.children).filter((node) => node.tagName === "item" && node.getAttribute("type") === type);
  const translationLanguages = [...new Set(phrases.flatMap((phrase) => directItems(phrase, "gls").map((item) => item.getAttribute("lang") ?? "")))];
  const baselineLanguages = [...new Set(phrases.flatMap((phrase) => {
    const items = directItems(phrase, "txt");
    return (items.length ? items : Array.from(phrase.querySelectorAll('words > word > item[type="txt"]'))).map((item) => item.getAttribute("lang") ?? "");
  }))];
  const selectedLanguage = language ?? translationLanguages[0];
  const rows = phrases.map((phrase) => {
    const baseline = directItems(phrase, "txt")[0]?.textContent;
    const words = Array.from(phrase.querySelectorAll("words > word"));
    const reconstructed = words.map((word) => (directItems(word, "txt")[0] ?? directItems(word, "punct")[0])?.textContent ?? "").join(" ");
    return {
      ...emptySentence(), translation: baseline ?? reconstructed,
      reference: directItems(phrase, "gls").find((item) => (item.getAttribute("lang") ?? "") === selectedLanguage)?.textContent ?? "",
      speaker: phrase.getAttribute("speaker") ?? "", comments: directItems(phrase, "note").map((item) => item.textContent).join("\n"),
      // Keep every XML annotation and language variant, even when not editable here.
      original: new XMLSerializer().serializeToString(phrase),
    };
  });
  const title = Array.from(doc.querySelector("interlinear-text")?.children ?? []).find((item) => item.tagName === "item" && item.getAttribute("type") === "title")?.textContent ?? "";
  return { rows, translationLanguages, baselineLanguages, title };
}

export function importQuestionnaire(text: string, templates: QuestionnaireTemplate[], language: string): Source {
  return importQuestionnaireRecording(parseQuestionnaireJson(text), templates, language);
}

export function parseQuestionnaireJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/u, "")); } catch { throw new ImportError("malformed"); }
  const data = record(parsed);
  if (!str(data.cq_uid).trim()) throw new ImportError("questionnaireTemplate");
  record(data.data);
  return data;
}

/** v1 labels repeated tokens as word, word_2, etc.; v2 stores whitespace-token positions. */
function legacyWordPositions(translation: string, delimiters: unknown): Map<string, number> {
  const separators = Array.isArray(delimiters) && delimiters.length && delimiters.every((item) => typeof item === "string" && item.length > 0)
    ? delimiters as string[] : [" ", ".", ",", ":", ";", "?", "!", "(", ")", "…"];
  const pattern = new RegExp(separators.map((item) => item.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "u");
  const counts = new Map<string, number>(), positions = new Map<string, number>();
  sentenceWords(translation).forEach((word, position) => {
    for (const part of word.split(pattern)) {
      const normalized = part.replace(/^[.,:;?!()]+|[.,:;?!()]+$/gu, "").trim().normalize("NFC").toLowerCase();
      if (!normalized) continue;
      const count = (counts.get(normalized) ?? 0) + 1;
      counts.set(normalized, count);
      positions.set(count > 1 ? `${normalized}_${count}` : normalized, position);
    }
  });
  return positions;
}

export function importQuestionnaireRecording(data: Record<string, unknown>, templates: QuestionnaireTemplate[], language: string): Source {
  for (const field of ["target language", "pivot language", "interviewer"]) {
    if (data[field] !== undefined && typeof data[field] !== "string") throw new ImportError("malformed");
  }
  const template = templates.find((item) => item.uid === str(data.cq_uid).trim());
  if (!template) throw new ImportError("questionnaireTemplate");
  const targetLanguage = str(data["target language"]).trim();
  if (targetLanguage && targetLanguage.toLowerCase() !== "target language" && targetLanguage.normalize("NFC").toLowerCase() !== language.normalize("NFC").toLowerCase()) throw new ImportError("language");
  const source = startQuestionnaire(template, language);
  const recordings = record(data.data);
  if (!Object.keys(recordings).length) throw new ImportError("empty");
  if (Object.keys(recordings).length > maximumRows) throw new ImportError("questionnaireTooLarge");
  const byId = new Map<string, Record<string, unknown>>();
  const displayedIndices = new Map<string, string[]>();
  for (const [id, entry] of Object.entries(template.dialog)) {
    const index = String(entry["legacy index"] || id).trim();
    displayedIndices.set(index, [...displayedIndices.get(index) ?? [], id]);
  }
  for (const [key, value] of Object.entries(recordings)) {
    const entry = record(value);
    const legacyIndex = entry["legacy index"];
    let id: string | undefined;
    if (legacyIndex !== undefined && legacyIndex !== null && legacyIndex !== "") {
      const candidates = displayedIndices.get(String(legacyIndex).trim()) ?? [];
      // A family album legitimately repeats legacy indices 23 and 29. Its
      // English prompts identify the distinct turns even in reordered files.
      const matching = candidates.filter((candidate) => template.dialog[candidate].text.trim().normalize("NFC") === str(entry.cq).trim().normalize("NFC"));
      id = candidates.length === 1 ? candidates[0] : matching.length === 1 ? matching[0] : !str(entry.cq) && candidates.includes(key) ? key : undefined;
    } else if (Object.hasOwn(template.dialog, key)) id = key;
    if (!id || byId.has(id)) throw new ImportError("questionnaireRows");
    for (const field of ["translation", "comment", "alternate_pivot", "lebt", "cq"]) {
      if (entry[field] !== undefined && typeof entry[field] !== "string") throw new ImportError("malformed");
    }
    byId.set(id, entry);
  }
  source.rows = source.rows.map((row) => {
    const entry = byId.get(row.id);
    if (!entry) return row;
    const translation = str(entry.translation);
    const positions = legacyWordPositions(translation, data.delimiters);
    const concepts = entry.concept_words === undefined ? {} : record(entry.concept_words);
    const links = Object.entries(concepts).map(([concept, value]) => {
      if (typeof value !== "string") throw new ImportError("malformed");
      const words = value.split("...").map((word) => positions.get(word.trim().normalize("NFC").toLowerCase())).filter((position): position is number => position !== undefined);
      return { concept, words: [...new Set(words)].sort((a, b) => a - b) };
    });
    return { ...row, translation, comments: str(entry.comment), alternatePivot: str(entry.alternate_pivot), literalTranslation: str(entry.lebt),
      concepts: [...new Set([...row.concepts, ...Object.keys(concepts)])], links,
      original: { instrument: row.original, recording: entry } };
  });
  source.author = str(data.interviewer);
  source.pivotLanguage = str(data["pivot language"]) || "English";
  source.original = { template, recording: data };
  source.originKind = "upload";
  validateQuestionnaireSource(source);
  return source;
}

export function validateQuestionnaireSource(source: Source) {
  if (!isSource(source)) throw new ImportError("malformed");
  // Leave room for the save request's version and source wrapper.
  if (new Blob([JSON.stringify(source)]).size > maximumSourceBytes - 1024) throw new ImportError("questionnaireTooLarge");
}

export async function readQuestionnaireFile(file: File): Promise<{ recording: Record<string, unknown>; attachment?: Source["attachment"] }> {
  if (!/\.(json|xlsx)$/iu.test(file.name)) throw new ImportError("format");
  if (file.size > (/\.xlsx$/iu.test(file.name) ? maximumFileBytes : maximumSourceBytes)) throw new ImportError("questionnaireTooLarge");
  if (/\.json$/iu.test(file.name)) return { recording: parseQuestionnaireJson(await file.text()) };
  const { readQuestionnaireExcel } = await import("./questionnaire-excel");
  return { recording: await readQuestionnaireExcel(file), attachment: await readAttachment(file) };
}

export async function readAttachment(file: File): Promise<NonNullable<Source["attachment"]>> {
  if (file.size > maximumFileBytes) throw new ImportError("tooLarge");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { name: file.name, mediaType: file.type || "application/octet-stream", base64: btoa(binary) };
}

export async function importDocument(file: File, language: string): Promise<Source> {
  if (!/\.(pdf|docx|txt)$/iu.test(file.name)) throw new ImportError("format");
  const attachment = await readAttachment(file);
  return {
    ...newSource("documents", language, file.name.replace(/\.[^.]+$/u, "")),
    originKind: "upload", attachment,
    textPreview: /\.txt$/iu.test(file.name) ? (await file.text()).slice(0, 100000) : undefined,
  };
}

export function downloadJson(value: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), filename);
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadAttachment(attachment: NonNullable<Source["attachment"]>) {
  const data = Uint8Array.from(atob(attachment.base64), (char) => char.charCodeAt(0));
  downloadBlob(new Blob([data], { type: attachment.mediaType }), attachment.name);
}
