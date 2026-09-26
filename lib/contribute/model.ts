export const sourceTabs = ["questionnaires", "pairs", "documents", "plaid"] as const;
export type SourceTab = (typeof sourceTabs)[number];
export type SourceKind = Exclude<SourceTab, "plaid">;

export type ContributionProject = {
  id: string;
  name: string;
  role: "reader" | "writer" | "maintainer" | null;
  caretaker: boolean;
};

export type WordLink = { concept: string; words: number[] };
export type Sentence = {
  id: string;
  reference: string;
  translation: string;
  speaker: string;
  comments: string;
  description: string;
  alternatePivot?: string;
  literalTranslation?: string;
  concepts: string[];
  links: WordLink[];
  /** Locally checked only; never a claim of authoritative PLAID review. */
  checked: boolean;
  original?: unknown;
};

export type Source = {
  id: string;
  kind: SourceKind;
  title: string;
  author: string;
  origin: string;
  usage: string;
  referenceLanguage: string;
  pivotLanguage?: string;
  targetLanguage: string;
  context: string;
  rows: Sentence[];
  originKind: "manual" | "upload" | "plaid-export";
  attachment?: { name: string; mediaType: string; base64: string };
  textPreview?: string;
  /** Lossless source payload, including semantic graphs and legacy fields. */
  original?: unknown;
};

export type QuestionnaireTemplate = {
  uid: string;
  title: string;
  context: string;
  speakers: Record<string, { name?: string }>;
  dialog: Record<string, {
    speaker: string;
    text: string;
    intent?: string[] | string;
    concept?: string[] | string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export function isSourceTab(value: unknown): value is SourceTab {
  return sourceTabs.some((tab) => tab === value);
}

export function emptySentence(): Sentence {
  return { id: crypto.randomUUID(), reference: "", translation: "", speaker: "", comments: "", description: "", concepts: [], links: [], checked: false };
}

export function newSource(kind: SourceKind, language: string, title: string): Source {
  return {
    id: crypto.randomUUID(), kind, title, author: "", origin: "", usage: "",
    referenceLanguage: "English", targetLanguage: language, context: "", rows: [], originKind: "manual",
  };
}

export type SavedSource = { source: Source; version: number; updatedAt: string };
export type SourceSummary = Pick<Source, "id" | "kind" | "title" | "author" | "originKind"> & {
  rowCount: number;
  translatedCount: number;
  linkedCount: number;
  checkedCount: number;
  version: number;
  updatedAt: string;
};

export function summarizeSource({ source, version, updatedAt }: SavedSource): SourceSummary {
  return {
    id: source.id, kind: source.kind, title: source.title, author: source.author, originKind: source.originKind,
    rowCount: source.rows.length, translatedCount: source.rows.filter((r) => r.translation.trim() && r.reference.trim()).length,
    linkedCount: source.rows.filter((r) => r.links.some((link) => link.words.length)).length,
    checkedCount: source.rows.filter((r) => r.checked).length, version, updatedAt,
  };
}

export function startQuestionnaire(template: QuestionnaireTemplate, language: string): Source {
  const terms = (value: string[] | string | undefined) => Array.isArray(value) ? value : value?.trim() ? [value] : [];
  return {
    ...newSource("questionnaires", language, template.title),
    origin: "DIG4EL · DCQ", context: template.context, original: template,
    rows: Object.entries(template.dialog).map(([id, utterance]) => ({
      ...emptySentence(), id, reference: utterance.text,
      speaker: template.speakers[utterance.speaker]?.name ?? utterance.speaker,
      concepts: [...new Set([...terms(utterance.intent), ...terms(utterance.concept)])],
      original: utterance,
    })),
  };
}

/** Positions distinguish repeated words. Punctuation and apostrophes remain intact. */
export function sentenceWords(text: string): string[] {
  return text.trim().split(/\s+/u).filter(Boolean);
}

export function changeTranslation(row: Sentence, translation: string): Sentence {
  if (row.translation === translation) return row;
  // Positional annotations must be revisited if the underlying text changes.
  return { ...row, translation, links: [], checked: false };
}

export function sentenceKey(row: Pick<Sentence, "reference" | "translation">): string {
  return JSON.stringify([row.reference.trim().normalize("NFC"), row.translation.trim().normalize("NFC")]);
}
