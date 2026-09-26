// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseDelimited, parsePairs, parseFlextext, previewRows, importQuestionnaire } from "../../../lib/contribute/imports";
import { changeTranslation, emptySentence, startQuestionnaire, type QuestionnaireTemplate } from "../../../lib/contribute/model";
import { isSource } from "../../../lib/contribute/validation";
import { contributeEnglish, contributeFrench } from "../../../i18n/contribute";

const template: QuestionnaireTemplate = { uid: "test", title: "Conversation", context: "A dialogue", speakers: { A: { name: "A" } }, dialog: { "1": { speaker: "A", text: "Prompt", intent: ["ASK"], concept: ["water"], graph: { original: true } } } };
const xml = `<?xml version="1.0"?><document><interlinear-text guid="doc-1"><item type="title">Field notes</item><paragraphs><paragraph><phrases><phrase guid="p-1"><item type="txt" lang="tah">E haere au.</item><item type="gls" lang="en">I go.</item><item type="gls" lang="fr">Je vais.</item><words><word><item type="txt" lang="tah">haere</item><morphemes><morph><item type="gls" lang="en">go</item></morph></morphemes></word></words></phrase></phrases></paragraph></paragraphs></interlinear-text></document>`;

describe("Contribute file imports", () => {
  it("handles Unicode, BOMs, quoted commas, CRLF, escaped quotes and multiline cells", () => {
    expect(parseDelimited('\uFEFFsource,target\r\n"a, b","tā\n""h"""\r\n')).toEqual([["source", "target"], ["a, b", 'tā\n"h"']]);
    expect(() => parseDelimited('a,b\n"unterminated,x')).toThrow();
    expect(() => parsePairs("source,target\na,b,c", "test.csv")).toThrow();
  });
  it("requires explicit column mapping when headers differ and flags duplicates without discarding them", () => {
    expect(parsePairs("English,Tahitian\none,hoê", "test.csv").rows).toHaveLength(0);
    const parsed = parsePairs("English,Tahitian\none,hoê\none,hoê\ntwo,", "test.csv", "English", "Tahitian");
    const preview = previewRows(parsed.rows);
    expect(preview.map((item) => item.issue)).toEqual([null, "duplicate", "missing"]);
    expect(preview.map((item) => item.included)).toEqual([true, false, false]);
    expect(preview).toHaveLength(3);
  });
  it.each([
    ["comma", 'source,target\n"Reference, sentence",Target sentence\n'],
    ["semicolon", 'source;target\r\n"Reference, sentence";Target sentence\r\n'],
    ["tab", 'source\ttarget\r\n"Reference, sentence"\tTarget sentence\r\n'],
    ["separator declaration", 'sep=,\r\nsource,target\r\n"Reference, sentence",Target sentence\r\n'],
    ["blank spreadsheet columns", 'source,target,,\r\n"Reference, sentence",Target sentence,,\r\n'],
    ["BOM and semicolon declaration", '\uFEFFsep=;\r\n"source";"target"\r\n"Reference, sentence";Target sentence\r\n'],
    ["blank columns between languages", ',source,,target,\r\n,"Reference, sentence",,Target sentence,\r\n'],
  ])("recognizes the source/target template in a CSV saved with %s", (_, text) => {
    const parsed = parsePairs(text, "dig4el_sentence_pairs.csv");
    expect(parsed.columns).toEqual(["source", "target"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ reference: "Reference, sentence", translation: "Target sentence" });
    expect(parsed.original).toBe(text);
  });
  it("ignores empty spreadsheet padding without discarding nonempty columns or shifting text", () => {
    const padded = parsePairs('source,target,,\nReference,Target\nNext,Translation,,\n', "pairs.csv");
    expect(padded.rows.map(({ reference, translation }) => [reference, translation])).toEqual([["Reference", "Target"], ["Next", "Translation"]]);
    expect(padded.rows[1].original).toEqual(["Next", "Translation", "", ""]);
    expect(parsePairs('source,target\nReference,Target,,', "pairs.csv").rows[0]).toMatchObject({ reference: "Reference", translation: "Target" });
    expect(() => parsePairs('source,target,\nReference,Target,Keep this', "pairs.csv")).toThrow("columns");
    expect(() => parsePairs('source,target\nReference,Target,Keep this', "pairs.csv")).toThrow("malformed");
    expect(() => parsePairs('source,target\nReference', "pairs.csv")).toThrow("malformed");
    expect(() => parsePairs('source,target,target\nReference,First,Second', "pairs.csv")).toThrow("columns");
  });
  it("detects separators from headers without splitting quoted punctuation or multiline sentences", () => {
    const text = '"source";"target"\r\n"Reference, with; punctuation\nand ""quotes""";"ʻIa ora, ora!"\r\n';
    expect(parsePairs(text, "pairs.csv").rows[0]).toMatchObject({ reference: 'Reference, with; punctuation\nand "quotes"', translation: "ʻIa ora, ora!" });
    expect(parsePairs('"English; prompt","Tahitian, text"\nReference,Target', "pairs.csv", "English; prompt", "Tahitian, text").rows[0]).toMatchObject({ reference: "Reference", translation: "Target" });
    expect(() => parsePairs('source;target\n"Unclosed;Target', "pairs.csv")).toThrow("malformed");
  });
  it("maps FLEx baseline to the documented language and chooses the translation language explicitly", () => {
    const parsed = parseFlextext(xml, "fr");
    expect(parsed.translationLanguages).toEqual(["en", "fr"]);
    expect(parsed.baselineLanguages).toEqual(["tah"]);
    expect(parsed.rows[0]).toMatchObject({ translation: "E haere au.", reference: "Je vais.", checked: false });
    expect(parsed.rows[0].original).toContain("morphemes");
    expect(parsed.title).toBe("Field notes");
    expect(() => parseFlextext('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><document/>')).toThrow();
    expect(() => parseFlextext("<document><broken>")).toThrow();
  });
  it("retains the canonical instrument and legacy recording, and rejects the wrong language", () => {
    const source = startQuestionnaire(template, "Tahitian");
    expect(isSource(source)).toBe(true);
    expect(source.rows[0].original).toEqual(template.dialog["1"]);
    const recording = { cq_uid: "test", "target language": "Tahitian", data: { "1": { translation: "test", concept_words: { water: "test" } } } };
    const imported = importQuestionnaire(JSON.stringify(recording), [template], "Tahitian");
    expect(imported.original).toEqual({ template, recording });
    expect(imported.rows[0].translation).toBe("test");
    expect(() => importQuestionnaire(JSON.stringify(recording), [template], "Nafsan")).toThrow();
  });
  it("invalidates word positions and review when the translation changes", () => {
    const row = { ...emptySentence(), translation: "one one", checked: true, links: [{ concept: "second", words: [1] }] };
    expect(changeTranslation(row, "one one")).toBe(row);
    expect(changeTranslation(row, "one")).toMatchObject({ checked: false, links: [] });
  });
  it("keeps both interface translations complete", () => {
    expect(Object.keys(contributeFrench).sort()).toEqual(Object.keys(contributeEnglish).sort());
  });
});
