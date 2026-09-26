import { type Source, type Sentence, sentenceWords } from "./model";

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const maximumSourceBytes = 20 * 1024 * 1024;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max = 10000): value is string {
  return typeof value === "string" && value.length <= max;
}
function isSentence(value: unknown): value is Sentence {
  if (!object(value) || !text(value.id, 100) || !value.id || !text(value.reference) || !text(value.translation) || !text(value.speaker, 300) || !text(value.comments) || !text(value.description)) return false;
  const count = sentenceWords(value.translation).length;
  if (value.alternatePivot !== undefined && !text(value.alternatePivot) || value.literalTranslation !== undefined && !text(value.literalTranslation)) return false;
  if (value.checked && (!value.reference.trim() || !value.translation.trim())) return false;
  return typeof value.checked === "boolean" && Array.isArray(value.concepts) && value.concepts.length <= 200 && value.concepts.every((c) => text(c, 300)) &&
    Array.isArray(value.links) && value.links.length <= 200 && value.links.every((link) => object(link) && text(link.concept, 300) && Array.isArray(link.words) && link.words.length <= count && link.words.every((index) => Number.isInteger(index) && index >= 0 && index < count));
}

export function isSource(value: unknown): value is Source {
  if (!object(value) || !text(value.id, 36) || !uuidPattern.test(value.id)) return false;
  if (!["questionnaires", "pairs", "documents"].includes(String(value.kind)) || !["manual", "upload", "plaid-export"].includes(String(value.originKind))) return false;
  if (!text(value.title, 300) || !value.title.trim() || !text(value.author, 1000) || !text(value.origin, 2000) || !text(value.usage, 4000) || !text(value.referenceLanguage, 100) || !text(value.targetLanguage, 160) || !text(value.context, 20000)) return false;
  if (value.pivotLanguage !== undefined && !text(value.pivotLanguage, 100)) return false;
  if (!Array.isArray(value.rows) || value.rows.length > 5000 || !value.rows.every(isSentence) || new Set(value.rows.map((r) => r.id)).size !== value.rows.length) return false;
  if (value.textPreview !== undefined && !text(value.textPreview, 100000)) return false;
  if (value.attachment !== undefined) {
    const file = value.attachment;
    if (!object(file) || !text(file.name, 300) || !text(file.mediaType, 150) || !text(file.base64, 14 * 1024 * 1024) || file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(file.base64)) return false;
  }
  return true;
}
