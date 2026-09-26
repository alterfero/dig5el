"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { contributeMessages, type ContributeCopy } from "../../i18n/contribute";
import { sourceTabs, isSourceTab, startQuestionnaire, summarizeSource, type ContributionProject, type QuestionnaireTemplate, type SavedSource, type Source, type SourceSummary, type SourceTab } from "../../lib/contribute/model";
import { downloadJson, ImportError, importQuestionnaireRecording, readQuestionnaireFile, validateQuestionnaireSource, maximumFileBytes } from "../../lib/contribute/imports";
import { isSource } from "../../lib/contribute/validation";
import { AuthStatusControl } from "../auth-status-control";
import { Icon, type IconName } from "../icon";
import { LanguageSwitcher } from "../language-switcher";
import { useLocale } from "../locale-provider";
import { ImportPanel, importErrorMessage } from "./import-panel";
import { SourceEditor } from "./source-editor";

export type TemplateSummary = { uid: string; title: string; context: string; count: number };
type Draft = SavedSource & { dirty: boolean; saving?: boolean; error?: "save" | "conflict" };
const tabIcons: Record<SourceTab, IconName> = { questionnaires: "story", pairs: "word", documents: "book", plaid: "link" };
function actionLabel(tab: SourceTab, c: ContributeCopy) { return ({ questionnaires: c.addQuestionnaires, pairs: c.addPairs, documents: c.addDocuments, plaid: c.addPlaid })[tab]; }
function belongsTo(summary: SourceSummary, tab: SourceTab) { return tab === "plaid" ? summary.originKind === "plaid-export" : summary.kind === tab; }

class RequestError extends Error { constructor(readonly status: number) { super(String(status)); } }
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...options });
  if (!response.ok) throw new RequestError(response.status);
  const body = await response.json();
  if (!body.data) throw new RequestError(500);
  return body.data as T;
}

export function ContributeScreen({ projects, csrfToken, templates }: { projects: ContributionProject[]; csrfToken: string; templates: TemplateSummary[] }) {
  const { t, locale } = useLocale(); const c = contributeMessages[locale];
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [visited, setVisited] = useState<string[]>(projects[0] ? [projects[0].id] : []);
  const [signedOut, setSignedOut] = useState(false);
  const [expired, setExpired] = useState(false);
  const onExpired = useCallback(() => setExpired(true), []);
  useEffect(() => {
    const onLogout = () => setSignedOut(true);
    const onRestored = () => setExpired(false);
    window.addEventListener("dig4el:signed-out", onLogout);
    window.addEventListener("dig4el:session-restored", onRestored);
    return () => { window.removeEventListener("dig4el:signed-out", onLogout); window.removeEventListener("dig4el:session-restored", onRestored); };
  }, []);
  const project = projects.find((item) => item.id === projectId);
  return <div className="contribute-page">
    <a className="skip-link" href="#main-content">{t("a11y.skipToMain")}</a>
    <header className="landing-header"><div className="landing-header-inner contribute-header-inner">
      <Link className="brand" aria-label={t("a11y.home")} href="/"><span className="brand-mark" aria-hidden="true">D</span><span>DIG4EL</span></Link>
      <nav className="landing-navigation" aria-label={t("a11y.primaryNavigation")}><Link href="/contribute" aria-current="page">{c.title}</Link><span role="link" aria-disabled="true">{t("nav.generate")}</span></nav>
      <div className="topbar-actions"><AuthStatusControl /><LanguageSwitcher /></div>
    </div></header>
    <main className="contribute-main" id="main-content" tabIndex={-1}>
      <div className="contribute-page-heading"><div><p className="contribute-eyebrow">DIG4EL · {c.sourceList}</p><h1>{c.title}</h1><p>{project ? <>{c.subtitle} <strong>{project.name}</strong>.</> : c.emptyBody}</p></div>
        {projects.length > 0 && !signedOut && <label className="contribute-project-picker"><span><Icon name="globe" />{c.language}</span><select value={projectId} onChange={(event) => { const id = event.target.value; setProjectId(id); setVisited((current) => current.includes(id) ? current : [...current, id]); }}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      {expired && !signedOut && <p className="contribute-notice" role="alert">{c.sessionEnded}. {c.preserveDraft} <Link href="/login" target="_blank">{c.signIn}<Icon name="external" /></Link></p>}
      {signedOut ? <section className="contribute-empty"><Icon name="lock" /><h2>{c.sessionEnded}</h2><Link className="contribute-primary" href="/login">{c.signIn}</Link></section> : projects.length === 0 ? <section className="contribute-empty"><Icon name="globe" /><h2>{c.noProjects}</h2><p>{c.noProjectsBody}</p><Link className="contribute-primary" href="/admin">{c.manageAccess}<Icon name="arrow-right" /></Link></section> : visited.map((id) => <div key={id} hidden={id !== projectId}><ProjectWorkspace project={projects.find((item) => item.id === id)!} csrfToken={csrfToken} templates={templates} onExpired={onExpired} /></div>)}
    </main>
  </div>;
}

function ProjectWorkspace({ project, csrfToken, templates, onExpired }: { project: ContributionProject; csrfToken: string; templates: TemplateSummary[]; onExpired: () => void }) {
  const { locale } = useLocale(); const c = contributeMessages[locale];
  const [tab, setTab] = useState<SourceTab>("questionnaires");
  const [summaries, setSummaries] = useState<SourceSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [reload, setReload] = useState(0);
  const draftsRef = useRef(drafts);
  const canEdit = project.role === "writer" || project.role === "maintainer";
  const endpoint = `/api/contribute/projects/${encodeURIComponent(project.id)}/sources`;

  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem("dig4el.contribute.active-tab"); if (isSourceTab(saved)) setTab(saved); } catch { /* Preference is optional. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void request<{ sources: SourceSummary[]; persistent: boolean }>(endpoint, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setSummaries(data.sources); setPersistent(data.persistent); setLoading(false); setLoadError(false);
    }).catch((error) => { if (!controller.signal.aborted) { setLoadError(true); setLoading(false); if (error instanceof RequestError && error.status === 401) onExpired(); } });
    return () => controller.abort();
  }, [endpoint, reload, onExpired]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (Object.values(draftsRef.current).some((item) => item.dirty)) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    const preventNavigation = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.getAttribute("href")?.startsWith("#")) return;
      if (Object.values(draftsRef.current).some((item) => item.dirty) && !window.confirm(c.preserveDraft)) event.preventDefault();
    };
    document.addEventListener("click", preventNavigation, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", preventNavigation, true); };
  }, [c.preserveDraft]);

  const allSummaries = [...summaries.map((item) => drafts[item.id] ? summarizeSource(drafts[item.id]) : item), ...Object.values(drafts).filter((item) => !summaries.some((summary) => summary.id === item.source.id)).map(summarizeSource)];
  function changeTab(next: SourceTab) { setTab(next); try { localStorage.setItem("dig4el.contribute.active-tab", next); } catch { /* Memory still preserves the active tab. */ } }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: SourceTab) {
    const index = sourceTabs.indexOf(current);
    const target = event.key === "ArrowRight" ? (index + 1) % sourceTabs.length : event.key === "ArrowLeft" ? (index + sourceTabs.length - 1) % sourceTabs.length : event.key === "Home" ? 0 : event.key === "End" ? sourceTabs.length - 1 : -1;
    if (target < 0) return; event.preventDefault(); changeTab(sourceTabs[target]);
    document.getElementById(`tab-${project.id}-${sourceTabs[target]}`)?.focus();
  }
  async function loadSource(id: string, force = false) {
    if (draftsRef.current[id] && !force) return;
    try {
      const saved = await request<SavedSource>(`${endpoint}/${id}`);
      setDrafts((current) => current[id]?.dirty && !force ? current : ({ ...current, [id]: { ...saved, dirty: false } }));
    } catch (error) { if (error instanceof RequestError && error.status === 401) onExpired(); throw error; }
  }
  function addSources(sources: Source[]) {
    setDrafts((current) => ({ ...current, ...Object.fromEntries(sources.map((source) => [source.id, { source, version: 0, updatedAt: new Date().toISOString(), dirty: true }])) }));
  }
  async function save(id: string) {
    const draft = draftsRef.current[id]; if (!draft || draft.saving || !draft.source.title.trim()) return;
    setDrafts((current) => ({ ...current, [id]: { ...current[id], saving: true, error: undefined } }));
    try {
      const session = await request<{ session: { csrfToken: string } }>("/api/auth/session");
      const saved = await request<SavedSource>(`${endpoint}/${id}`, { method: "PUT", headers: { "content-type": "application/json", "x-dig4el-csrf": session.session.csrfToken || csrfToken }, body: JSON.stringify({ source: draft.source, version: draft.version }) });
      setDrafts((current) => ({ ...current, [id]: { ...saved, dirty: false } }));
      window.dispatchEvent(new Event("dig4el:session-restored"));
    } catch (error) {
      setDrafts((current) => ({ ...current, [id]: { ...current[id], saving: false, error: error instanceof RequestError && error.status === 409 ? "conflict" : "save" } }));
      if (error instanceof RequestError && error.status === 401) onExpired();
    }
  }

  return <>
    <div className="contribute-tabs" role="tablist" aria-label={c.tabLabel}>{sourceTabs.map((key) => <button key={key} id={`tab-${project.id}-${key}`} aria-controls={`panel-${project.id}-${key}`} role="tab" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => changeTab(key)} onKeyDown={(event) => navigateTabs(event, key)}><Icon name={tabIcons[key]} /><span>{c[key]}{key === "questionnaires" && <small>DCQ</small>}</span><span className="contribute-tab-count">{allSummaries.filter((item) => belongsTo(item, key)).length}</span></button>)}</div>
    {!canEdit && <p className="contribute-notice"><Icon name="lock" />{c.readOnly}</p>}
    {!persistent && <p className="contribute-notice">{c.ephemeral}</p>}
    {loading ? <div className="contribute-loading" role="status"><span className="auth-spinner" />{c.loading}</div> : loadError ? <div className="contribute-empty" role="alert"><h2>{c.loadError}</h2><p>{c.retryHint}</p><button className="contribute-primary" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>{c.retry}</button></div> : sourceTabs.map((key) => <section key={key} role="tabpanel" tabIndex={0} id={`panel-${project.id}-${key}`} aria-labelledby={`tab-${project.id}-${key}`} hidden={tab !== key}>
      <SourcePanel tab={key} project={project} summaries={allSummaries.filter((item) => belongsTo(item, key))} drafts={drafts} templates={templates} canEdit={canEdit} onOpen={loadSource} onAdd={addSources} onSave={save} onChange={(source) => setDrafts((current) => ({ ...current, [source.id]: { ...current[source.id], source, dirty: true, error: undefined } }))} />
    </section>)}
    <footer className="contribute-analysis"><div className="contribute-analysis-icon"><Icon name="spark" /></div><div><strong>{c.analysisTitle}</strong><p>{c.analysisBody}</p></div><span className="contribute-badge">{c.analysisUnavailable}</span></footer>
  </>;
}

function SourcePanel({ tab, project, summaries, drafts, templates, canEdit, onOpen, onAdd, onSave, onChange }: {
  tab: SourceTab; project: ContributionProject; summaries: SourceSummary[]; drafts: Record<string, Draft>; templates: TemplateSummary[]; canEdit: boolean;
  onOpen: (id: string, force?: boolean) => Promise<void>; onAdd: (sources: Source[]) => void; onSave: (id: string) => Promise<void>; onChange: (source: Source) => void;
}) {
  const { locale } = useLocale(); const c = contributeMessages[locale];
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const draft = drafts[selected];
  const list = summaries.filter((item) => `${item.title} ${item.author}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (filter === "all" || (filter === "reviewed" ? item.rowCount > 0 && item.checkedCount === item.rowCount : item.checkedCount < item.rowCount)));
  const emptyTitle = ({ questionnaires: c.emptyQuestionnaires, pairs: c.emptyPairs, documents: c.emptyDocuments, plaid: c.emptyPlaid })[tab];
  const emptyBody = ({ questionnaires: c.emptyQuestionnairesBody, pairs: c.emptyPairsBody, documents: c.emptyDocumentsBody, plaid: c.emptyPlaidBody })[tab];
  async function open(id: string, force = false) { setSelected(id); setAdding(false); setError(""); setBusy(true); try { await onOpen(id, force); } catch { setError(c.loadError); } finally { setBusy(false); } }
  function add(sources: Source[]) { onAdd(sources); setSelected(sources[0]?.id ?? ""); setAdding(false); setAnnouncement(c.includedDraft); }
  async function start(uid: string) { setBusy(true); setError(""); try { const { template } = await request<{ template: QuestionnaireTemplate }>(`/api/contribute/questionnaires/${encodeURIComponent(uid)}`); add([startQuestionnaire(template, project.name)]); } catch { setError(c.loadError); } finally { setBusy(false); } }
  async function restore(file: File, legacy = false) {
    setBusy(true); setError("");
    try {
      if (legacy) {
        const { recording, attachment } = await readQuestionnaireFile(file);
        const uid = String(recording.cq_uid ?? "").trim();
        if (!templates.some((item) => item.uid === uid)) throw new ImportError("questionnaireTemplate");
        const { template } = await request<{ template: QuestionnaireTemplate }>(`/api/contribute/questionnaires/${encodeURIComponent(uid)}`);
        const source = importQuestionnaireRecording(recording, [template], project.name);
        if (attachment) source.attachment = attachment;
        validateQuestionnaireSource(source);
        add([source]);
      } else {
        if (file.size > maximumFileBytes * 2) throw new ImportError("questionnaireTooLarge");
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.format !== "dig4el-source-v1" || !isSource(parsed.source)) throw new ImportError("format");
        if (parsed.source.targetLanguage !== project.name) throw new ImportError("language");
        if (tab === "plaid" ? parsed.source.originKind !== "plaid-export" : parsed.source.kind !== tab) throw new ImportError("format");
        const source: Source = parsed.source;
        add([{ ...source, id: crypto.randomUUID(), rows: source.rows.map((row) => ({ ...row, checked: false })) }]);
      }
    } catch (cause) { setError(importErrorMessage(cause, c)); }
    finally { setBusy(false); }
  }

  return <div className={`contribute-workbench${expanded ? " expanded" : ""}${selected || adding || busy || error ? " has-selection" : ""}`}>
    <aside className="contribute-source-list" aria-label={c.sourceList}>
      <div className="contribute-list-heading"><h2>{c[tab]}</h2><span>{summaries.length} {tab === "documents" ? c.files : c.sourceCount}</span></div>
      <button className="contribute-primary contribute-add" disabled={!canEdit} onClick={() => { setAdding(true); setError(""); }}><Icon name="plus" />{actionLabel(tab, c)}</button>
      {tab === "questionnaires" && canEdit && <label className="contribute-file-action contribute-dcq-upload"><Icon name="upload" />{c.importQuestionnaire}<input type="file" accept=".json,.xlsx" aria-label={c.importQuestionnaire} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file, true); event.target.value = ""; }} /></label>}
      <label className="contribute-search"><Icon name="search" /><input aria-label={c.search} placeholder={c.search} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {tab !== "documents" && <select className="contribute-filter" aria-label={c.filter} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">{c.all}</option><option value="needs-review">{c.needsReview}</option><option value="reviewed">{c.reviewed}</option></select>}
      <div className="contribute-source-items">{list.map((item) => <button key={item.id} aria-current={selected === item.id && !adding ? "true" : undefined} className={`contribute-source-item${selected === item.id && !adding ? " selected" : ""}`} onClick={() => void open(item.id)}><div><Icon name={tabIcons[item.kind]} /><strong>{item.title || c.newSource}</strong></div><p>{item.kind === "documents" ? item.author || c.documents : `${item.rowCount} ${item.kind === "questionnaires" ? c.utterances : c.sentences}`}</p><span className={`contribute-badge${item.rowCount > 0 && item.checkedCount === item.rowCount ? " reviewed" : ""}`}>{drafts[item.id]?.dirty ? c.draft : item.kind === "documents" ? c.saved : item.rowCount > 0 && item.checkedCount === item.rowCount ? c.reviewed : c.needsReview}</span>{item.originKind === "plaid-export" && <span className="contribute-origin-tag">PLAID</span>}</button>)}
        {!list.length && <div className="contribute-list-empty"><Icon name="file" /><p>{summaries.length ? c.noResults : c.emptySources}</p>{summaries.length > 0 && <button className="contribute-text-button" onClick={() => { setQuery(""); setFilter("all"); }}>{c.clearFilter}</button>}</div>}
      </div>
      <div className="contribute-list-bottom"><p>{c.tabsHint}</p>{canEdit && <label className="contribute-file-action"><Icon name="upload" />{c.restore}<input type="file" accept=".json" aria-label={c.restore} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file); event.target.value = ""; }} /></label>}</div>
    </aside>
    <div className="contribute-working-area">
      <button className="contribute-text-button contribute-mobile-back" onClick={() => { setSelected(""); setAdding(false); }}><Icon name="arrow-left" />{c.backList}</button>
      {error && <div className="contribute-error" role="alert">{error}{selected && <button className="contribute-text-button" onClick={() => void open(selected)}>{c.retry}</button>}</div>}
      <span className="sr-only" role="status">{announcement}</span>
      {busy && <p className="contribute-loading" role="status"><span className="auth-spinner" />{c.loading}</p>}
      {adding && tab !== "questionnaires" ? <ImportPanel kind={tab} language={project.name} onAdd={add} onCancel={() => setAdding(false)} /> : adding ? <section className="contribute-template-picker">
        <div className="contribute-panel-heading"><div><span className="contribute-eyebrow">DIG4EL · DCQ</span><h2>{c.addQuestionnaires}</h2></div><button className="contribute-icon-button" aria-label={c.close} onClick={() => setAdding(false)}><Icon name="close" /></button></div><p>{c.questionnaireIntro}</p><small className="contribute-muted">{c.templateLanguage}</small>
        <div className="contribute-template-grid">{templates.map((item) => <button disabled={busy} key={item.uid} onClick={() => void start(item.uid)}><span className="contribute-template-icon"><Icon name="story" /></span><h3>{item.title}</h3><p>{item.context}</p><span>{item.count} {c.utterances}<Icon name="arrow-right" /></span></button>)}</div>
        <p>{c.questionnaireImportHint}</p>
        <label className="contribute-dropzone"><Icon name="upload" /><strong>{busy ? c.processing : c.importQuestionnaire}</strong><span>{c.questionnaireFormats}</span><input type="file" accept=".json,.xlsx" aria-label={c.chooseFile} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void restore(file, true); event.target.value = ""; }} /></label>
        <div className="contribute-import-alternatives"><a className="contribute-text-button" href="/contribute/dcq-excel-templates.zip" download><Icon name="download" />{c.questionnaireTemplates}</a></div>
      </section> : draft ? <>
        <div className="contribute-editor-heading"><div><span className="contribute-eyebrow">{draft.source.originKind === "plaid-export" ? c.imported : draft.source.originKind === "upload" ? c.uploaded : c.created}</span><h2>{draft.source.title || c.newSource}</h2><span className="contribute-save-status" role="status"><span className={draft.dirty ? "status-dot draft" : "status-dot"} />{draft.saving ? c.saving : draft.dirty ? c.unsaved : c.saved}</span></div><button className="contribute-icon-button" aria-label={expanded ? c.collapse : c.expand} onClick={() => setExpanded((value) => !value)}><Icon name="expand" /></button></div>
        {draft.error && <div className="contribute-error" role="alert"><p>{draft.error === "conflict" ? c.conflict : c.saveError}</p>{draft.error === "conflict" && <button className="contribute-text-button" onClick={() => { if (window.confirm(c.reloadConfirm)) void open(selected, true); }}>{c.reload}</button>}</div>}
        <SourceEditor key={draft.source.id} source={draft.source} onChange={onChange} disabled={!canEdit || Boolean(draft.saving)} canReview={project.caretaker} />
        <div className="contribute-save-bar"><div><span>{draft.version ? c.savedHelp : c.visibility}</span>{draft.source.kind === "documents" && <small>{c.documentPending}</small>}</div><button className="contribute-secondary" aria-label={c.download} onClick={() => downloadJson({ format: "dig4el-source-v1", source: draft.source }, `${draft.source.title || "dig4el"}.json`)}><Icon name="download" /><span>{c.download}</span></button>{canEdit && <button className="contribute-primary" disabled={!draft.dirty || draft.saving || !draft.source.title.trim()} onClick={() => void onSave(selected)}><Icon name="check" />{draft.saving ? c.saving : draft.version ? c.save : c.saveFirst}</button>}</div>
      </> : !busy && !error && <section className="contribute-empty"><div className="contribute-empty-illustration"><Icon name={tabIcons[tab]} /><span className="contribute-illustration-dot" /></div><span className="contribute-eyebrow">{c[tab]}</span><h2>{summaries.length ? c.chooseSource : emptyTitle}</h2><p>{summaries.length ? c.chooseSourceBody : emptyBody}</p>{!summaries.length && <button disabled={!canEdit} className="contribute-primary" onClick={() => setAdding(true)}><Icon name="plus" />{actionLabel(tab, c)}</button>}{tab === "plaid" && <small>{c.plaidIndependent}</small>}</section>}
    </div>
  </div>;
}
