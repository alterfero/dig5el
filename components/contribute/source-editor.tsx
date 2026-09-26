"use client";
import { useState } from "react";
import { contributeMessages } from "../../i18n/contribute";
import { changeTranslation, emptySentence, sentenceWords, type Sentence, type Source } from "../../lib/contribute/model";
import { downloadAttachment, downloadJson } from "../../lib/contribute/imports";
import { Icon } from "../icon";
import { useLocale } from "../locale-provider";

export function SourceEditor({ source, onChange, disabled, canReview }: {
  source: Source; onChange: (source: Source) => void; disabled: boolean; canReview: boolean;
}) {
  const { locale } = useLocale(); const c = contributeMessages[locale];
  const [selectedId, setSelectedId] = useState(source.rows[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [concept, setConcept] = useState("");
  const [newConcept, setNewConcept] = useState("");
  const current = source.rows.find((row) => row.id === selectedId) ?? source.rows[0];
  const currentIndex = source.rows.findIndex((row) => row.id === current?.id);
  const concepts = current ? [...new Set([...current.concepts, ...current.links.map((link) => link.concept)])] : [];
  const activeConcept = concepts.includes(concept) ? concept : concepts[0] ?? "";
  const words = sentenceWords(current?.translation ?? "");
  const linkedWords = current?.links.find((link) => link.concept === activeConcept)?.words ?? [];
  const rows = source.rows.filter((row) => `${row.reference} ${row.translation} ${row.speaker}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const recording = source.kind === "questionnaires" && source.original && typeof source.original === "object" && "recording" in source.original ? source.original.recording : undefined;

  function updateRow(row: Sentence) {
    onChange({ ...source, rows: source.rows.map((existing) => existing.id === row.id ? row : existing) });
  }
  function editRow(change: Partial<Sentence>) {
    if (current) updateRow({ ...current, ...change, checked: false });
  }
  function move(id: string) { setSelectedId(id); setConcept(""); setNewConcept(""); }

  return <div className="contribute-source-editor">
    <details className="contribute-details" open={source.kind === "documents" || undefined}>
      <summary>{c.details}</summary>
      <fieldset disabled={disabled} className="contribute-fields">
        <label className="contribute-span"><span>{c.sourceTitle}</span><input maxLength={300} value={source.title} onChange={(event) => onChange({ ...source, title: event.target.value })} /></label>
        <label><span>{c.author}</span><input maxLength={1000} value={source.author} onChange={(event) => onChange({ ...source, author: event.target.value })} /></label>
        <label><span>{c.origin}</span><input maxLength={2000} value={source.origin} onChange={(event) => onChange({ ...source, origin: event.target.value })} /></label>
        {source.kind !== "documents" && <label><span>{c.referenceLanguage}</span><input maxLength={100} value={source.referenceLanguage} onChange={(event) => onChange({ ...source, referenceLanguage: event.target.value })} /></label>}
        {source.kind === "questionnaires" && <label><span>{c.pivotLanguage}</span><input maxLength={100} value={source.pivotLanguage ?? ""} onChange={(event) => onChange({ ...source, pivotLanguage: event.target.value })} /></label>}
        {source.kind !== "documents" && <label><span>{c.targetLanguage}</span><input value={source.targetLanguage} readOnly /></label>}
        <label className="contribute-span"><span>{c.usage}</span><textarea maxLength={4000} value={source.usage} rows={2} onChange={(event) => onChange({ ...source, usage: event.target.value })} /><small>{c.usageHint}</small></label>
      </fieldset>
    </details>

    {source.kind === "documents" ? <section className="contribute-document-preview">
      <div className="contribute-document-icon"><Icon name="book" /></div>
      <h3>{source.attachment?.name ?? source.title}</h3>
      <p>{c.attachmentPreview}</p>
      {source.attachment && <button className="contribute-secondary" onClick={() => downloadAttachment(source.attachment!)}><Icon name="download" />{c.original}</button>}
      {source.textPreview && <details><summary>{c.textPreview}</summary><pre>{source.textPreview}</pre></details>}
      <p className="contribute-muted">{c.noAutoProcessing}</p>
    </section> : <>
      <div className="contribute-progress-line">
        <span><strong>{source.rows.filter((row) => row.translation.trim() && row.reference.trim()).length}/{source.rows.length}</strong> {c.translated}</span>
        <span><strong>{source.rows.filter((row) => row.links.some((link) => link.words.length)).length}/{source.rows.length}</strong> {c.connected}</span>
        <span><strong>{source.rows.filter((row) => row.checked).length}/{source.rows.length}</strong> {c.reviewed.toLocaleLowerCase()}</span>
      </div>
      {source.context && <div className="contribute-context"><span>{c.context}</span><p>{source.context}</p></div>}
      <div className="contribute-example-layout">
        <aside className="contribute-dialogue" aria-label={source.kind === "questionnaires" ? c.fullDialogue : c.pairs}>
          <div className="contribute-dialogue-title">{source.kind === "questionnaires" ? c.fullDialogue : c.pairs}<span>{source.rows.length}</span></div>
          <label className="contribute-search"><Icon name="search" /><input aria-label={c.searchExamples} placeholder={c.searchExamples} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="contribute-utterances">
            {rows.map((row) => <button key={row.id} className={row.id === current?.id ? "contribute-utterance selected" : "contribute-utterance"} aria-current={row.id === current?.id ? "true" : undefined} onClick={() => move(row.id)}>
              <span className="contribute-utterance-number">{source.rows.indexOf(row) + 1}</span>
              <span>{row.speaker && <small>{row.speaker}</small>}<span dir="auto">{row.reference || row.translation || c.newSource}</span></span>
              {row.checked && <Icon name="check" />}
            </button>)}
            {!rows.length && <p className="contribute-muted">{c.noExamples}</p>}
          </div>
          {source.kind === "pairs" && <button disabled={disabled || source.rows.length >= 5000} className="contribute-text-button" onClick={() => { const row = emptySentence(); onChange({ ...source, rows: [...source.rows, row] }); move(row.id); }}><Icon name="plus" />{c.addSentence}</button>}
        </aside>
        {current && <section className="contribute-annotation" aria-label={c.currentUtterance}>
          <div className="contribute-annotation-heading"><span>{source.kind === "questionnaires" ? c.currentUtterance : c.pairs} · {currentIndex + 1} {c.of} {source.rows.length}</span><span className={current.checked ? "contribute-badge reviewed" : "contribute-badge"}>{current.checked ? c.reviewed : c.needsReview}</span></div>
          <fieldset disabled={disabled} className="contribute-annotation-fields">
            {current.speaker && <p className="contribute-speaker">{current.speaker}</p>}
            <label><span>{source.referenceLanguage || c.translation}</span><textarea dir="auto" rows={2} readOnly={source.kind === "questionnaires"} value={current.reference} maxLength={10000} onChange={(event) => editRow({ reference: event.target.value })} /></label>
            <label className="contribute-target"><span>{source.targetLanguage}</span><textarea dir="auto" rows={3} value={current.translation} maxLength={10000} onChange={(event) => updateRow(changeTranslation(current, event.target.value))} /></label>
            {source.kind === "questionnaires" && <>
              <label><span>{c.alternatePivot}{source.pivotLanguage ? ` · ${source.pivotLanguage}` : ""}</span><textarea dir="auto" rows={2} maxLength={10000} value={current.alternatePivot ?? ""} onChange={(event) => editRow({ alternatePivot: event.target.value })} /></label>
              <label><span>{c.literalTranslation}</span><textarea dir="auto" rows={2} maxLength={10000} value={current.literalTranslation ?? ""} onChange={(event) => editRow({ literalTranslation: event.target.value })} /></label>
            </>}
            <section className="contribute-connections">
              <h4>{c.connections}</h4><p>{c.connectionsHint}</p>
              {concepts.length > 0 && <label><span>{c.concept}</span><select value={activeConcept} onChange={(event) => setConcept(event.target.value)}>{concepts.map((name) => <option key={name}>{name}</option>)}</select></label>}
              <div className="contribute-word-tokens" aria-label={c.connections}>
                {!words.length && <span className="contribute-muted">{c.noWords}</span>}
                {words.length > 0 && !activeConcept && <span className="contribute-muted">{c.noConcepts}</span>}
                {words.map((word, index) => <button type="button" key={`${index}-${word}`} disabled={!activeConcept} aria-label={`${word} (${index + 1})`} aria-pressed={linkedWords.includes(index)} onClick={() => {
                  const updated = linkedWords.includes(index) ? linkedWords.filter((position) => position !== index) : [...linkedWords, index].sort((a, b) => a - b);
                  editRow({ links: [...current.links.filter((link) => link.concept !== activeConcept), { concept: activeConcept, words: updated }] });
                }}>{word}</button>)}
              </div>
              <div className="contribute-add-concept"><input aria-label={c.addConcept} placeholder={c.addConcept} maxLength={300} value={newConcept} onChange={(event) => setNewConcept(event.target.value)} /><button type="button" className="contribute-secondary" disabled={!newConcept.trim() || concepts.length >= 200} onClick={() => { const name = newConcept.trim(); editRow({ concepts: [...new Set([...current.concepts, name])] }); setConcept(name); setNewConcept(""); }}>{c.add}</button></div>
              <small className="contribute-muted">{c.linksReset}</small>
            </section>
            <label><span>{c.comments}</span><textarea dir="auto" rows={2} maxLength={10000} value={current.comments} onChange={(event) => editRow({ comments: event.target.value })} /></label>
            <details className="contribute-details"><summary>{c.description}</summary><textarea aria-label={c.description} dir="auto" rows={3} maxLength={10000} value={current.description} onChange={(event) => editRow({ description: event.target.value })} /></details>
          </fieldset>
          <div className="contribute-review-action"><button disabled={disabled || !canReview || !current.reference.trim() || !current.translation.trim()} className="contribute-secondary" onClick={() => updateRow({ ...current, checked: !current.checked })}><Icon name="check" />{current.checked ? c.unmarkReviewed : c.markReviewed}</button><small>{c.reviewHint}</small></div>
          <div className="contribute-pager"><button className="contribute-text-button" disabled={currentIndex <= 0} onClick={() => move(source.rows[currentIndex - 1].id)}><Icon name="arrow-left" />{c.previous}</button><span>{currentIndex + 1} / {source.rows.length}</span><button className="contribute-text-button" disabled={currentIndex >= source.rows.length - 1} onClick={() => move(source.rows[currentIndex + 1].id)}>{c.next}<Icon name="arrow-right" /></button></div>
        </section>}
      </div>
      {source.originKind === "plaid-export" && <p className="contribute-import-note"><Icon name="file" />{c.originalPreserved}{source.attachment && <button className="contribute-text-button" onClick={() => downloadAttachment(source.attachment!)}>{c.original}</button>}</p>}
      {source.kind === "questionnaires" && source.originKind === "upload" && <p className="contribute-import-note"><Icon name="file" />{c.questionnaireOriginalPreserved}{Boolean(source.attachment || recording) && <button className="contribute-text-button" onClick={() => source.attachment ? downloadAttachment(source.attachment) : downloadJson(recording, `${source.title}_original.json`)}>{c.original}</button>}</p>}
    </>}
  </div>;
}
