// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importQuestionnaire, importQuestionnaireRecording, maximumFileBytes, readQuestionnaireFile, validateQuestionnaireSource } from "../../../lib/contribute/imports";
import { parseQuestionnaireSheets } from "../../../lib/contribute/questionnaire-excel";
import { isSource } from "../../../lib/contribute/validation";
import { questionnaireTemplates } from "../../../server/contribute/templates";
import type { QuestionnaireTemplate } from "../../../lib/contribute/model";

const template: QuestionnaireTemplate = { uid: "test", title: "Test", context: "", speakers: {}, dialog: {
  "1": { speaker: "A", text: "First", "legacy index": "6a" },
  "2": { speaker: "B", text: "Second", "legacy index": "6b" },
} };
const header = ["Index", "English", "Pivot (if not English)", "Sentence in Tahitian", "Literal English Back-Translation", "Concept item", "Word(s) contributing to this concept item", "Notes"];
const info = { sheet: "Info", data: [["Conversational Questionnaire"], ["Test"], ["UID:test"], ["Target language", "Tahitian"]] };

async function fixture(name: string) {
  const buffer = await readFile(`tests/fixtures/contribute/${name}`);
  const bytes = Uint8Array.from(buffer);
  return { name, size: bytes.length, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", arrayBuffer: async () => bytes.buffer } as File;
}

describe("v1 DCQ import", () => {
  it("reads a real completed v1 workbook and retains all editable fields, original bytes and review state", async () => {
    const file = await fixture("family-album-completed.xlsx");
    const { recording, attachment } = await readQuestionnaireFile(file);
    expect(recording).toMatchObject({ cq_uid: "1716852912", "target language": "Tahitian", interviewee: "Test speaker", location: "Tahiti", date: "2026-09-25" });
    const source = importQuestionnaireRecording(recording, questionnaireTemplates, "Tahitian");
    source.attachment = attachment;
    expect(source).toMatchObject({ referenceLanguage: "English", pivotLanguage: "French", author: "Test interviewer", originKind: "upload" });
    expect(source.rows[0]).toMatchObject({ translation: "ʻIa ora, ora!", alternatePivot: "As-tu vu ma famille ?", literalTranslation: "Hello again", comments: "First note\nSecond note", checked: false });
    expect(source.rows[0].links).toContainEqual({ concept: "Intent: ASK", words: [2] });
    expect(source.rows[0].links).toContainEqual({ concept: "Ref_addressee", words: [0, 1] });
    expect(Buffer.from(attachment!.base64, "base64")).toEqual(Buffer.from(await file.arrayBuffer()));
    expect(source.rows.every((row) => !row.checked)).toBe(true);
    expect(isSource(source)).toBe(true);
    expect(() => validateQuestionnaireSource(source)).not.toThrow();
    expect(() => importQuestionnaireRecording(recording, questionnaireTemplates, "Nafsan")).toThrow("language");
  });

  it("accepts an unfilled v1 workbook in the selected language space", async () => {
    const { recording } = await readQuestionnaireFile(await fixture("family-album-v1.xlsx"));
    const source = importQuestionnaireRecording(recording, questionnaireTemplates, "Tahitian");
    expect(source.rows).toHaveLength(Object.keys(questionnaireTemplates.find((item) => item.uid === "1716852912")!.dialog).length);
    expect(source.rows.every((row) => row.translation === "")).toBe(true);
  });

  it("matches reordered and partial Excel rows by legacy index, including numeric indices and continuation rows", () => {
    const recording = parseQuestionnaireSheets([info, { sheet: "Transcription", data: [header,
      ["6b", "Second", "", "Piti piti!", "Two two", "number", "piti_2", "note"],
      [null, null, null, null, null, "first", "piti", "another note"],
    ] }]);
    const source = importQuestionnaireRecording(recording, [template], "Tahitian");
    expect(source.rows[0].translation).toBe("");
    expect(source.rows[1]).toMatchObject({ translation: "Piti piti!", literalTranslation: "Two two", comments: "note\nanother note", links: [{ concept: "number", words: [1] }, { concept: "first", words: [0] }] });
    const numeric = parseQuestionnaireSheets([info, { sheet: "Transcription", data: [header, [1, "First", null, "One"]] }]);
    expect((numeric.data as Record<string, unknown>)["1"]).toMatchObject({ "legacy index": "1" });
  });

  it("imports JSON BOMs, annotations and metadata without trusting imported review flags", () => {
    const recording = { cq_uid: "test", "target language": " tahitian ", "pivot language": "French", data: { "2": { translation: "E e!", alternate_pivot: "Oui", lebt: "Yes", comment: "Note", concept_words: { second: "e_2", missing: "absent" }, checked: true } } };
    const source = importQuestionnaire(`\uFEFF${JSON.stringify(recording)}`, [template], "Tahitian");
    expect(source.rows[1]).toMatchObject({ translation: "E e!", alternatePivot: "Oui", literalTranslation: "Yes", comments: "Note", checked: false, links: [{ concept: "second", words: [1] }, { concept: "missing", words: [] }] });
    expect(source.original).toEqual({ template, recording });
    expect(source.referenceLanguage).toBe("English");
  });

  it("rejects unknown UIDs, unknown/duplicate indices and malformed JSON without silently discarding entries", () => {
    expect(() => importQuestionnaire("{", [template], "Tahitian")).toThrow("malformed");
    expect(() => importQuestionnaire(JSON.stringify({ cq_uid: "unknown", data: {} }), [template], "Tahitian")).toThrow("questionnaireTemplate");
    for (const data of [{ "99": { translation: "Lost" } }, { "1": { "legacy index": "6a" }, "2": { "legacy index": "6a" } }]) {
      expect(() => importQuestionnaireRecording({ cq_uid: "test", data }, [template], "Tahitian")).toThrow("questionnaireRows");
    }
    for (const data of [[], { "1": { translation: 3 } }, { "1": { concept_words: [] } }]) {
      expect(() => importQuestionnaireRecording({ cq_uid: "test", data }, [template], "Tahitian")).toThrow();
    }
    expect(() => importQuestionnaireRecording({ cq_uid: "test", data: {} }, [template], "Tahitian")).toThrow("empty");
  });

  it("rejects malformed workbook layouts, orphaned concept rows and conflicting translations", () => {
    expect(() => parseQuestionnaireSheets([info])).toThrow("questionnaireSheets");
    expect(() => parseQuestionnaireSheets([info, { sheet: "Transcription", data: [["wrong header"]] }])).toThrow("questionnaireSheets");
    for (const rows of [[[null, null, null, null, null, "concept"]], [["6a", "", "", "One"], [null, null, null, "Different"]]]) {
      expect(() => parseQuestionnaireSheets([info, { sheet: "Transcription", data: [header, ...rows] }])).toThrow("questionnaireRows");
    }
    expect(() => parseQuestionnaireSheets([info, { sheet: "Transcription", data: [header] }])).toThrow("empty");
  });

  it("enforces formats and size limits before reading files, and rejects corrupt workbooks", async () => {
    await expect(readQuestionnaireFile({ name: "test.xls", size: 1 } as File)).rejects.toThrow("format");
    for (const name of ["test.xlsx", "test.json"]) await expect(readQuestionnaireFile({ name, size: maximumFileBytes * 2 + 1 } as File)).rejects.toThrow("questionnaireTooLarge");
    await expect(readQuestionnaireFile({ name: "broken.xlsx", size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as File)).rejects.toThrow("malformed");
  });
});
