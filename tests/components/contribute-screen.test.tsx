// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { ContributeScreen, type TemplateSummary } from "../../components/contribute/contribute-screen";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";
import { newSource, emptySentence, summarizeSource, type ContributionProject, type Source } from "../../lib/contribute/model";
import { questionnaireTemplates } from "../../server/contribute/templates";

const project: ContributionProject = { id: "00000000-0000-4000-8000-000000000101", name: "Tahitian", role: "writer", caretaker: false };
let source: Source;
let failSave = false;
const fetchMock = vi.fn();
const result = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } });
function renderWorkspace(projects = [project], templates: TemplateSummary[] = []) { return render(<LocaleProvider><ContributeScreen projects={projects} csrfToken={"a".repeat(43)} templates={templates} /></LocaleProvider>); }
const dcq = questionnaireTemplates.find((item) => item.uid === "1716852912")!;
const templateSummaries = [{ uid: dcq.uid, title: dcq.title, context: dcq.context, count: Object.keys(dcq.dialog).length }];
function uploadFile(name: string, content: string | Uint8Array) {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : Uint8Array.from(content);
  const file = new File([bytes.buffer], name);
  Object.defineProperties(file, { text: { value: async () => new TextDecoder().decode(bytes) }, arrayBuffer: { value: async () => bytes.buffer } });
  return file;
}
beforeEach(() => {
  localStorage.clear(); localStorage.setItem(localeStorageKey, "en");
  source = { ...newSource("pairs", "Tahitian", "Fieldwork notes"), rows: [{ ...emptySentence(), reference: "Reference example", translation: "Original example" }] };
  failSave = false;
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session") return result({ session: { csrfToken: "a".repeat(43), user: { systemAdministrator: false } } });
    if (url === `/api/contribute/questionnaires/${dcq.uid}`) return result({ template: dcq });
    if (url.endsWith("/sources")) return result({ sources: [summarizeSource({ source, version: 1, updatedAt: new Date().toISOString() })], persistent: true });
    if (init?.method === "PUT") {
      if (failSave) return result({}, 409);
      source = JSON.parse(String(init.body)).source;
      return result({ source, version: 2, updatedAt: new Date().toISOString() });
    }
    return result({ source, version: 1, updatedAt: new Date().toISOString() });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); fetchMock.mockReset(); vi.unstubAllGlobals(); });

async function openPairs() {
  fireEvent.click(screen.getByRole("tab", { name: /Sentence pairs/ }));
  fireEvent.click(await screen.findByRole("button", { name: /Fieldwork notes/ }));
  return await screen.findByRole("textbox", { name: "Tahitian" });
}
describe("Contribute workspace", () => {
  it("imports and saves a source/target CSV with empty spreadsheet columns", async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole("tab", { name: /Sentence pairs/ }));
    await screen.findByRole("button", { name: /Fieldwork notes/ });
    fireEvent.click(screen.getAllByRole("button", { name: "Add sentence pairs" })[0]);
    const content = 'source,target,,\r\n"Reference, sentence","ʻIa ora, ora!",,\r\n';
    fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [uploadFile("dig4el_sentence_pairs.csv", content)] } });
    await screen.findByRole("cell", { name: "ʻIa ora, ora!" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to workspace" }));
    expect(await screen.findByRole("textbox", { name: "Tahitian" })).toHaveValue("ʻIa ora, ora!");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save to language space" }));
    await screen.findByText("Saved in DIG4EL");
    expect(source.rows).toHaveLength(1);
    expect(source.rows[0]).toMatchObject({ reference: "Reference, sentence", translation: "ʻIa ora, ora!" });
    expect(source.attachment?.name).toBe("dig4el_sentence_pairs.csv");
    expect(Buffer.from(source.attachment!.base64, "base64").toString("utf8")).toBe(content);
  });

  it("keeps editing, search and selection when switching tabs, and only reports saved after a successful request", async () => {
    renderWorkspace();
    const translation = await openPairs();
    fireEvent.change(translation, { target: { value: "Changed example" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Find a source…" }), { target: { value: "Field" } });
    fireEvent.click(screen.getByRole("tab", { name: /PLAID/ }));
    expect(screen.getByText("Bring your existing annotations")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: /Sentence pairs/ }));
    expect(screen.getByRole("textbox", { name: "Tahitian" })).toHaveValue("Changed example");
    expect(screen.getByRole("textbox", { name: "Find a source…" })).toHaveValue("Field");
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved in DIG4EL")).toBeVisible());
    expect(source.rows[0].translation).toBe("Changed example");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT" && init.headers["x-dig4el-csrf"])).toBe(true);
    expect(localStorage.length).toBe(2); // locale and active tab; no corpus in browser storage
  });
  it("preserves edits and offers recovery on a version conflict", async () => {
    failSave = true; renderWorkspace();
    fireEvent.change(await openPairs(), { target: { value: "Keep my changes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Someone changed this source/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Tahitian" })).toHaveValue("Keep my changes");
    expect(screen.getByRole("button", { name: "Download a copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reload saved version" })).toBeEnabled();
  });
  it("supports keyboard tabs and read-only project access", async () => {
    renderWorkspace([{ ...project, role: "reader" }]);
    await screen.findByText("Start with a conversation");
    expect(screen.queryByLabelText("Import a DCQ translation")).not.toBeInTheDocument();
    const firstTab = screen.getByRole("tab", { name: /Questionnaires/ }); firstTab.focus();
    fireEvent.keyDown(firstTab, { key: "End" });
    expect(screen.getByRole("tab", { name: /PLAID/ })).toHaveFocus();
    expect(screen.getByRole("tab", { name: /PLAID/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("button", { name: /Import a PLAID export/ }).every((button) => button.hasAttribute("disabled"))).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /Sentence pairs/ }));
    fireEvent.click(screen.getByRole("button", { name: /Fieldwork notes/ }));
    expect(await screen.findByRole("textbox", { name: "Tahitian" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });
  it("preserves work on session expiry and retries with refreshed session credentials", async () => {
    renderWorkspace();
    fireEvent.change(await openPairs(), { target: { value: "Keep this after expiry" } });
    fetchMock.mockResolvedValueOnce(result({}, 401));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("link", { name: "Sign in again" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("textbox", { name: "Tahitian" })).toHaveValue("Keep this after expiry");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Saved in DIG4EL")).toBeVisible());
    expect(screen.queryByRole("link", { name: "Sign in again" })).not.toBeInTheDocument();
  });
  it("clears the contribution view on sign-out and localizes the workspace", async () => {
    localStorage.setItem(localeStorageKey, "fr"); renderWorkspace();
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1, name: "Contribuer" })).toBeVisible();
    await screen.findByText("Commencer par une conversation");
    fireEvent(window, new Event("dig4el:signed-out"));
    expect(await screen.findByRole("link", { name: "Se reconnecter" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it.each(["json", "xlsx"])("imports a DCQ %s from the tab, opens an editable draft and saves only on request", async (format) => {
    renderWorkspace([project], templateSummaries);
    const input = await screen.findByLabelText("Import a DCQ translation");
    expect(input).toHaveAttribute("accept", ".json,.xlsx");
    const recording = { cq_uid: dcq.uid, "target language": "Tahitian", "pivot language": "French", data: { "1": { translation: "ʻIa ora, ora!", alternate_pivot: "As-tu vu ma famille ?", lebt: "Hello again", comment: "First note", concept_words: { "Intent: ASK": "ora_2" }, checked: true } } };
    const content = format === "json" ? JSON.stringify(recording) : await readFile("tests/fixtures/contribute/family-album-completed.xlsx");
    fireEvent.change(input, { target: { files: [uploadFile(`dcq.${format}`, content)] } });
    expect(await screen.findByRole("textbox", { name: "Tahitian" })).toHaveValue("ʻIa ora, ora!");
    expect(screen.getByRole("textbox", { name: "Pivot translation · French" })).toHaveValue("As-tu vu ma famille ?");
    expect(screen.getByRole("textbox", { name: "Literal English back-translation" })).toHaveValue("Hello again");
    expect(screen.getByRole("button", { name: "Download original file" })).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    fireEvent.change(screen.getByRole("textbox", { name: "Notes and observations" }), { target: { value: "Checked the import" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to language space" }));
    await screen.findByText("Saved in DIG4EL");
    expect(source.rows[0]).toMatchObject({ comments: "Checked the import", checked: false });
    expect(source.rows[0].links).toContainEqual({ concept: "Intent: ASK", words: [2] });
    expect(source.attachment?.name).toBe(format === "xlsx" ? "dcq.xlsx" : undefined);
    const save = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect(JSON.parse(save[1].body).version).toBe(0);
  });

  it("offers the Excel templates and reports an invalid import without replacing the current draft", async () => {
    renderWorkspace([project], templateSummaries);
    await screen.findByLabelText("Import a DCQ translation");
    fireEvent.click(screen.getAllByRole("button", { name: "Start a questionnaire" })[0]);
    expect(screen.getByRole("link", { name: "Download Excel templates (ZIP)" })).toHaveAttribute("href", "/contribute/dcq-excel-templates.zip");
    fireEvent.click(screen.getByRole("button", { name: /A family album/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Tahitian" }), { target: { value: "Keep this draft" } });
    const input = screen.getByLabelText("Import a DCQ translation");
    fireEvent.change(input, { target: { files: [uploadFile("wrong.json", JSON.stringify({ cq_uid: dcq.uid, "target language": "Nafsan", data: { "1": { translation: "Wrong language" } } }))] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("This recording belongs to a different language");
    expect(screen.getByRole("textbox", { name: "Tahitian" })).toHaveValue("Keep this draft");
    fireEvent.change(input, { target: { files: [uploadFile("invalid.json", "{")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t read this file"));
    expect(screen.getByRole("textbox", { name: "Tahitian" })).toHaveValue("Keep this draft");
  });
});
