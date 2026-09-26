// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportPanel } from "../../components/contribute/import-panel";
import { LocaleProvider } from "../../components/locale-provider";
import { localeStorageKey } from "../../i18n/messages";

function uploadFile(name: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  const file = new File([bytes.buffer], name);
  Object.defineProperties(file, { text: { value: async () => content }, arrayBuffer: { value: async () => bytes.buffer } });
  fireEvent.change(screen.getByLabelText("Choose a file"), { target: { files: [file] } });
}
function renderPanel() {
  const onAdd = vi.fn();
  render(<LocaleProvider><ImportPanel kind="pairs" language="Tahitian" onAdd={onAdd} onCancel={vi.fn()} /></LocaleProvider>);
  return onAdd;
}
beforeEach(() => { localStorage.clear(); localStorage.setItem(localeStorageKey, "en"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Sentence-pair imports", () => {
  it("imports the completed CSV downloaded from the page without remapping its columns", async () => {
    const onAdd = renderPanel();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:sentence-pair-template");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    let filename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV template" }));
    expect(filename).toBe("dig4el_sentence_pairs.csv");
    const template = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(template.trim()).toBe("source,target");
    uploadFile(filename, `${template}"Reference, sentence","ʻIa ora, ora!"\r\n`);
    await screen.findByRole("cell", { name: "ʻIa ora, ora!" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Column with the language being documented" })).toHaveValue("target");
    expect(screen.getByRole("combobox", { name: "Column with the translation" })).toHaveValue("source");
    fireEvent.click(screen.getByRole("button", { name: "Add to workspace" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ attachment: { name: filename }, rows: [{ reference: "Reference, sentence", translation: "ʻIa ora, ora!" }] });
  });

  it.each([
    ["separator declaration", "sep=,\r\nsource,target\r\nReference sentence,Target sentence\r\n"],
    ["empty spreadsheet columns", "source,target,,\r\nReference sentence,Target sentence,,\r\n"],
  ])("automatically previews the source/target CSV with %s", async (_, content) => {
    const onAdd = renderPanel();
    uploadFile("dig4el_sentence_pairs.csv", content);
    await screen.findByRole("cell", { name: "Target sentence" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to workspace" }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ rows: [{ reference: "Reference sentence", translation: "Target sentence" }] });
  });

  it.each([
    ["csv", "English,Tahitian\nReference sentence,Target sentence"],
    ["tsv", "English\tTahitian\nReference sentence\tTarget sentence"],
  ])("previews and imports mapped language columns in %s", async (extension, content) => {
    const onAdd = renderPanel();
    uploadFile(`pairs.${extension}`, content);
    const target = await screen.findByRole("combobox", { name: "Column with the language being documented" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Add to workspace" });
    expect(add).toBeDisabled();
    fireEvent.change(target, { target: { value: "Tahitian" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Column with the translation" }), { target: { value: "English" } });
    expect(screen.getByRole("cell", { name: "Target sentence" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Reference sentence" })).toBeVisible();
    expect(add).toBeEnabled();
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(add);
    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(onAdd.mock.calls[0][0][0]).toMatchObject({ referenceLanguage: "English", targetLanguage: "Tahitian", attachment: { name: `pairs.${extension}`, base64: btoa(content) }, rows: [{ reference: "Reference sentence", translation: "Target sentence" }] });
  });

  it("clears a previous preview when both selections use the same column, and lets the user recover", async () => {
    const onAdd = renderPanel();
    uploadFile("pairs.csv", "source,target\nReference sentence,Target sentence\n");
    await screen.findByRole("cell", { name: "Target sentence" });
    const target = screen.getByRole("combobox", { name: "Column with the language being documented" });
    const add = screen.getByRole("button", { name: "Add to workspace" });
    fireEvent.change(target, { target: { value: "source" } });
    expect(screen.queryByRole("cell", { name: "Target sentence" })).not.toBeInTheDocument();
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.change(target, { target: { value: "target" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Target sentence" })).toBeVisible();
    expect(add).toBeEnabled();
  });
});
