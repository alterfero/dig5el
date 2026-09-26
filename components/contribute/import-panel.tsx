"use client";
import { useState } from "react";
import type { ContributeCopy } from "../../i18n/contribute";
import { contributeMessages } from "../../i18n/contribute";
import { downloadBlob, ImportError, importDocument, maximumFileBytes, parseFlextext, parsePairs, previewRows, readAttachment, type ImportRow } from "../../lib/contribute/imports";
import { emptySentence, newSource, type Source } from "../../lib/contribute/model";
import { Icon } from "../icon";
import { useLocale } from "../locale-provider";

export function importErrorMessage(error: unknown, c: ContributeCopy): string {
  if (!(error instanceof ImportError)) return c.importErrorMalformed;
  return ({ format: c.importErrorFormat, empty: c.importErrorEmpty, tooLarge: c.importErrorTooLarge, columns: c.importErrorColumns, language: c.importErrorLanguage, malformed: c.importErrorMalformed,
    questionnaireTemplate: c.importErrorQuestionnaireTemplate, questionnaireSheets: c.importErrorQuestionnaireSheets, questionnaireRows: c.importErrorQuestionnaireRows, questionnaireTooLarge: c.importErrorQuestionnaireTooLarge })[error.code];
}

export function ImportPanel({ kind, language, onAdd, onCancel }: { kind: "pairs" | "documents" | "plaid"; language: string; onAdd: (sources: Source[]) => void; onCancel: () => void }) {
  const { locale } = useLocale(); const c = contributeMessages[locale];
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [referenceColumn, setReferenceColumn] = useState("source");
  const [targetColumn, setTargetColumn] = useState("target");
  const [translationLanguages, setTranslationLanguages] = useState<string[]>([]);
  const [translationLanguage, setTranslationLanguage] = useState("");
  const [referenceLanguage, setReferenceLanguage] = useState("English");
  const [title, setTitle] = useState("");
  const [documents, setDocuments] = useState<Source[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [keepMissing, setKeepMissing] = useState(false);
  const included = rows.filter((item) => item.included);

  async function readFiles(files: File[]) {
    setError(""); setFileErrors([]); setBusy(true); setReviewing(false); setRows([]); setPage(0); setKeepMissing(false);
    try {
      if (kind === "documents") {
        const results = await Promise.allSettled(files.slice(0, 20).map((item) => importDocument(item, language)));
        setDocuments(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []));
        setFileErrors(results.flatMap((result, index) => result.status === "rejected" ? [`${files[index].name}: ${importErrorMessage(result.reason, c)}`] : []));
        if (files.length > 20) setFileErrors((current) => [...current, c.importErrorTooLarge]);
        setReviewing(true);
      } else {
        const input = files[0]; if (!input) return;
        if (input.size > maximumFileBytes) throw new ImportError("tooLarge");
        setFile(input); const raw = await input.text(); setText(raw); setTitle(input.name.replace(/\.[^.]+$/u, ""));
        if (kind === "plaid") {
          if (!/\.flextext$/iu.test(input.name)) throw new ImportError("format");
          const parsed = parseFlextext(raw);
          if (parsed.baselineLanguages.length > 1) { setError(c.unsupportedBaseline); return; }
          setTranslationLanguages(parsed.translationLanguages); setTranslationLanguage(parsed.translationLanguages[0] ?? "");
          setReferenceLanguage(parsed.translationLanguages[0] || "");
          setRows(previewRows(parsed.rows)); setTitle(parsed.title || input.name.replace(/\.[^.]+$/u, ""));
        } else {
          const parsed = parsePairs(raw, input.name); setColumns(parsed.columns); setReferenceColumn("source"); setTargetColumn("target"); setRows(previewRows(parsed.rows));
        }
        setReviewing(true);
      }
    } catch (cause) { setError(importErrorMessage(cause, c)); }
    finally { setBusy(false); }
  }
  function mapColumns(reference: string, target: string) {
    setReferenceColumn(reference); setTargetColumn(target); setError(""); setKeepMissing(false); setRows([]); setPage(0);
    try { setRows(previewRows(parsePairs(text, file!.name, reference, target).rows)); }
    catch (cause) { setError(importErrorMessage(cause, c)); }
  }
  async function finish() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (kind === "documents") { onAdd(documents); return; }
      if (!file || !included.length || !title.trim()) return;
      const attachment = await readAttachment(file);
      const source: Source = {
        ...newSource("pairs", language, title.trim()), originKind: kind === "plaid" ? "plaid-export" : "upload",
        origin: kind === "plaid" ? `PLAID · ${file.name}` : file.name,
        referenceLanguage, attachment, rows: included.map((item) => item.row),
      };
      onAdd([source]);
    } catch (cause) { setError(importErrorMessage(cause, c)); }
    finally { setBusy(false); }
  }

  return <section className="contribute-import-panel" aria-label={kind === "plaid" ? c.addPlaid : kind === "documents" ? c.addDocuments : c.addPairs}>
    <div className="contribute-panel-heading"><div><span className="contribute-eyebrow">{c.newSource}</span><h2>{kind === "plaid" ? c.addPlaid : kind === "documents" ? c.addDocuments : c.addPairs}</h2></div><button className="contribute-icon-button" aria-label={c.close} onClick={onCancel}><Icon name="close" /></button></div>
    <ol className="contribute-import-steps"><li className={!reviewing ? "active" : ""}><span>1</span>{c.choose}</li><li className={reviewing ? "active" : ""}><span>2</span>{c.preview}</li><li><span>3</span>{c.finish}</li></ol>
    <p>{kind === "plaid" ? c.plaidInstructions : kind === "documents" ? c.documentIntro : c.pairsIntro}</p>
    {kind === "plaid" && <p className="contribute-import-guidance">{c.plaidIndependent} <a href="https://larc-iu.github.io/plaid/igt-guide.html" rel="noreferrer" target="_blank">{c.importGuide}<Icon name="external" /></a></p>}
    <label className="contribute-dropzone"><Icon name="upload" /><strong>{busy ? c.processing : kind === "documents" ? c.addFiles : c.chooseFile}</strong><span>{kind === "plaid" ? c.plaidFormat : kind === "pairs" ? c.pairsFormats : "PDF · DOCX · TXT"}</span><input aria-label={c.chooseFile} type="file" disabled={busy} multiple={kind === "documents"} accept={kind === "plaid" ? ".flextext" : kind === "documents" ? ".pdf,.docx,.txt" : ".csv,.tsv,.json"} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void readFiles(files); event.target.value = ""; }} /></label>
    {kind === "pairs" && !reviewing && <div className="contribute-import-alternatives"><button className="contribute-text-button" onClick={() => downloadBlob(new Blob(["source,target\n"], { type: "text/csv" }), "dig4el_sentence_pairs.csv")}><Icon name="download" />{c.template}</button><button className="contribute-secondary" onClick={() => onAdd([{ ...newSource("pairs", language, c.blankCollection), rows: [emptySentence()] }])}><Icon name="plus" />{c.manualPairs}</button></div>}
    {error && <p className="contribute-error" role="alert">{error}</p>}
    {fileErrors.map((message) => <p className="contribute-error" key={message} role="alert">{message}</p>)}
    {reviewing && kind === "documents" && <><p>{c.documentReady}</p><div className="contribute-document-imports">{documents.map((doc) => <label key={doc.id}><Icon name="file" /><span>{doc.attachment?.name}</span><input aria-label={`${c.sourceTitle}: ${doc.attachment?.name}`} maxLength={300} value={doc.title} onChange={(event) => setDocuments((current) => current.map((item) => item.id === doc.id ? { ...item, title: event.target.value } : item))} /></label>)}</div></>}
    {reviewing && kind !== "documents" && <>
      <p className="contribute-muted">{file?.name} · {c.previewHint}</p>
      <div className="contribute-fields"><label className="contribute-span"><span>{c.sourceTitle}</span><input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>{c.targetLanguage}</span><input value={language} readOnly /></label>
        <label><span>{c.referenceLanguage}</span><input value={referenceLanguage} maxLength={100} onChange={(event) => setReferenceLanguage(event.target.value)} /></label>
        {kind === "pairs" && !/\.json$/iu.test(file?.name ?? "") && <><label><span>{c.targetColumn}</span><select value={columns.includes(targetColumn) ? targetColumn : ""} onChange={(event) => mapColumns(referenceColumn, event.target.value)}><option value="">{c.selectColumn}</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label><label><span>{c.referenceColumn}</span><select value={columns.includes(referenceColumn) ? referenceColumn : ""} onChange={(event) => mapColumns(event.target.value, targetColumn)}><option value="">{c.selectColumn}</option>{columns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label></>}
        {kind === "plaid" && translationLanguages.length > 1 && <label className="contribute-span"><span>{c.plaidTranslations}</span><select value={translationLanguage} onChange={(event) => { setTranslationLanguage(event.target.value); setReferenceLanguage(event.target.value); setRows(previewRows(parseFlextext(text, event.target.value).rows)); setPage(0); }}>{translationLanguages.map((item) => <option key={item} value={item}>{item || c.unknownLanguage}</option>)}</select></label>}
      </div>
      {kind === "plaid" && <p className="contribute-import-guidance">{c.plaidPreserve}</p>}
      {rows.some((item) => item.issue === "missing") && <label className="contribute-check"><input type="checkbox" checked={keepMissing} onChange={(event) => { const checked = event.target.checked; setKeepMissing(checked); setRows((current) => current.map((item) => item.issue === "missing" ? { ...item, included: checked } : item)); }} />{c.keepMissing}</label>}
      {rows.length > 0 && <div className="contribute-preview-table"><table><thead><tr><th>{c.include}</th><th>{language}</th><th>{referenceLanguage || c.translation}</th><th>{c.preview}</th></tr></thead><tbody>{rows.slice(page * 10, (page + 1) * 10).map((item) => <tr key={item.row.id}><td><input aria-label={`${c.include} ${item.line}`} type="checkbox" checked={item.included} onChange={(event) => setRows((current) => current.map((other) => other.row.id === item.row.id ? { ...other, included: event.target.checked } : other))} /></td><td dir="auto">{item.row.translation || "—"}</td><td dir="auto">{item.row.reference || "—"}</td><td><span className={item.issue ? "contribute-badge attention" : "contribute-badge"}>{item.issue === "missing" ? c.missing : item.issue === "duplicate" ? c.duplicate : c.ready}</span></td></tr>)}</tbody></table></div>}
      {rows.length > 10 && <div className="contribute-pager"><button className="contribute-text-button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>{c.previous}</button><span>{c.previewPage} {page + 1} / {Math.ceil(rows.length / 10)}</span><button className="contribute-text-button" disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage((current) => current + 1)}>{c.next}</button></div>}
    </>}
    {reviewing && <div className="contribute-import-footer"><span>{kind === "documents" ? `${documents.length} ${c.pendingFiles}` : `${included.length} / ${rows.length} ${c.importSelection}`}</span><button className="contribute-primary" disabled={busy || (kind === "documents" ? !documents.length || documents.some((doc) => !doc.title.trim()) : !included.length || !title.trim() || !referenceLanguage.trim())} onClick={() => void finish()}>{c.finish}<Icon name="arrow-right" /></button></div>}
  </section>;
}
