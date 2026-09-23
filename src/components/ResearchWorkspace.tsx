import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, WorkNote } from '../types';
import { api } from '../lib/api';
import { newWorkNote, searchArchive, type SearchHit } from '../lib/research';
import { errorMessage } from '../lib/util';

export type ResearchView = 'archive' | 'search' | 'compare' | 'notes';
export type PictureRef = { projectId: string; artworkId: string };
export type NoteSelection = { projectId: string; noteId: string } | null;
const field = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-40';
const primary = 'rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';
const labels = { draft: 'Vorläufige Notiz', note: 'Notiz', task: 'Aufgabe' };

export function ResearchWorkspace({ projects, view, setView, pair, setPair, selectedNote, setSelectedNote, onOpen, onSave, onDelete, onMove, aiAvailable }: {
  projects: Project[]; view: ResearchView; setView: (v: ResearchView) => void;
  pair: PictureRef[]; setPair: (p: PictureRef[]) => void;
  selectedNote: NoteSelection; setSelectedNote: (n: NoteSelection) => void;
  onOpen: (hit: SearchHit) => void;
  onSave: (projectId: string | null, note: WorkNote) => string | null;
  onMove: (projectId: string, noteId: string, destination: string | null) => void;
  onDelete: (projectId: string, noteId: string) => void;
  aiAvailable: boolean;
}) {
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [artist, setArtist] = useState('');
  const [style, setStyle] = useState('');
  const [tag, setTag] = useState('');
  const [type, setType] = useState('');
  const [noteKind, setNoteKind] = useState('');
  const [noteStatus, setNoteStatus] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const [noteScope, setNoteScope] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const visibleProjects = projects.filter(p => p.kind !== 'notebook');
  const pictures = visibleProjects.flatMap(p => p.artworks.filter(a => !a.deletedAt).map(a => ({ project: p, artwork: a, key: JSON.stringify([p.id, a.id]) })));
  const selectedPictures = pair.map(r => pictures.find(p => p.project.id === r.projectId && p.artwork.id === r.artworkId));
  const hits = useMemo(() => searchArchive(projects, { query, project: projectFilter, artist, style, tag, type }), [projects, query, projectFilter, artist, style, tag, type]);
  const allNotes = projects.flatMap(p => (p.workNotes ?? []).map(n => ({ project: p, note: n })));
  const selected = allNotes.find(n => n.project.id === selectedNote?.projectId && n.note.id === selectedNote.noteId);
  const noteList = allNotes.filter(({ project, note }) => (!noteKind || note.kind === noteKind) &&
    (!noteScope || (noteScope === 'app' ? project.kind === 'notebook' : project.id === noteScope)) &&
    (!noteStatus || (noteStatus === 'done' ? note.kind === 'task' && note.done : note.kind === 'task' && !note.done)) &&
    `${note.title} ${note.content}`.toLocaleLowerCase().includes(noteQuery.toLocaleLowerCase())).sort((a,b) => b.note.updatedAt - a.note.updatedAt);
  const edit = (patch: Partial<WorkNote>) => { if (selected) onSave(selected.project.id, { ...selected.note, ...patch, updatedAt: Date.now() }); };
  const add = (owner: string | null, patch: Partial<WorkNote> = {}) => {
    const n = newWorkNote(patch); const id = onSave(owner, n);
    if (id) { setSelectedNote({ projectId: id, noteId: n.id }); setView('notes'); }
  };
  const addToPair = (r: PictureRef) => {
    if (pair.some(p => p.projectId === r.projectId && p.artworkId === r.artworkId)) { setNotice('Dieses Bild ist bereits ausgewählt.'); return; }
    if (pair.length === 2) { setNotice('Schon zwei Bilder ausgewählt. Entferne im Bildvergleich zuerst eines.'); return; }
    setPair([...pair, r]); setNotice('Bild zum Vergleich hinzugefügt.');
  };
  const compare = async () => {
    if (busy || selectedPictures.length !== 2 || selectedPictures.some(p => !p)) return;
    const chosen = selectedPictures.map(p => p!);
    const references = chosen.map(p => ({ projectId: p.project.id, artworkId: p.artwork.id, title: p.artwork.title }));
    controller.current = new AbortController(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.compare({ images: chosen.map(p => p.artwork.imageUrl), question }, controller.current.signal);
      // App scope survives deletion of a source project while the AI is running.
      const n = newWorkNote({ title: `Vergleich: ${references.map(r => r.title).join(' / ')}`, content: result.content, kind: 'note', source: 'ai', model: result.mock ? 'Demo-Modus' : result.model, comparison: references });
      const id = onSave(null, n);
      if (id) { setSelectedNote({ projectId: id, noteId: n.id }); setNotice('KI-Vergleich unter Notizen gespeichert.'); }
    } catch (e) { setError(errorMessage(e, 'Vergleich fehlgeschlagen.')); }
    finally { setBusy(false); controller.current = null; }
  };
  return <div hidden={view === 'archive'} className="min-h-screen bg-slate-50 px-3 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-5">
      {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Meldung schließen">✕</button></div>}
      {view === 'search' && <>
        <div><h1 className="text-2xl font-bold">Sammlung durchsuchen</h1><p className="mt-1 text-sm text-slate-600">Suche in Bildern, Analysen, Projekten, Wiki und Notizen. Mehrere Suchwörter werden gemeinsam berücksichtigt.</p></div>
        <label className="block text-sm">Suchbegriffe<input className={field} value={query} onChange={e => setQuery(e.target.value)} placeholder="Zum Beispiel: Vermeer Licht" /></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">Projekt<select aria-label="Projekt" className={field} value={projectFilter} onChange={e => setProjectFilter(e.target.value)}><option value="">Alle Bereiche</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="text-sm">Künstler<input className={field} value={artist} onChange={e => setArtist(e.target.value)} /></label>
          <label className="text-sm">Epoche / Stil<input className={field} value={style} onChange={e => setStyle(e.target.value)} /></label>
          <label className="text-sm">Schlagwort<input className={field} value={tag} onChange={e => setTag(e.target.value)} /></label>
          <label className="text-sm">Trefferart<select aria-label="Trefferart" className={field} value={type} onChange={e => setType(e.target.value)}><option value="">Alle</option><option value="artwork">Bilder</option><option value="project">Projekte</option><option value="note">Notizen / Aufgaben</option><option value="wiki">Wiki</option></select></label>
        </div>
        <p className="text-xs text-slate-500">Künstler, Epoche/Stil und Schlagwort filtern Bilder anhand vorhandener Angaben.</p>
        <div className="flex items-center justify-between"><p role="status">{hits.length} Treffer</p><button className={button} onClick={() => { setQuery(''); setArtist(''); setStyle(''); setTag(''); setType(''); setProjectFilter(''); }}>Filter zurücksetzen</button></div>
        {hits.length === 0 && <p className="rounded-xl bg-white p-6">Keine passenden Einträge. Versuche weniger Filter oder andere Suchwörter.</p>}
        <div className="space-y-3">{hits.slice(0, 150).map((hit, index) => <article key={`${hit.project.id}-${index}`} className="flex gap-3 rounded-xl border bg-white p-4">
          {hit.artwork && <img src={hit.artwork.imageUrl} alt="" className="h-20 w-16 shrink-0 rounded object-contain" />}
          <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{hit.field} · {hit.project.name}</p><button onClick={() => onOpen(hit)} className="text-left font-semibold underline decoration-slate-300 underline-offset-4">{hit.title}</button><p className="mt-1 line-clamp-3 break-words text-sm text-slate-600">{excerpt(hit.text, query)}</p>
            {hit.artwork && <button className={`${button} mt-2`} onClick={() => addToPair({ projectId: hit.project.id, artworkId: hit.artwork!.id })}>Zum Vergleich</button>}
          </div>
        </article>)}</div>{hits.length > 150 && <p>Die ersten 150 Treffer werden angezeigt. Grenze die Suche weiter ein.</p>}
      </>}
      {view === 'compare' && <>
        <div><h1 className="text-2xl font-bold">Bildvergleich</h1><p className="mt-1 text-sm text-slate-600">Zwei Bilder aus deiner Sammlung gegenüberstellen.</p></div>
        <div className="grid grid-cols-2 gap-3 sm:gap-6">{[0,1].map(index => <div key={index} className="min-w-0 space-y-3 rounded-xl border bg-white p-3">
          <label className="block text-sm font-medium">Bild {index + 1}<select aria-label={`Bild ${index + 1} auswählen`} disabled={busy || (index === 1 && !selectedPictures[0])} className={`${field} mt-2`} value={selectedPictures[index]?.key ?? ''} onChange={e => {
            const chosen = pictures.find(p => p.key === e.target.value); const next = [...pair];
            if (!chosen) { next.splice(index, 1); } else { next[index] = { projectId: chosen.project.id, artworkId: chosen.artwork.id }; }
            setPair(next.filter(Boolean)); setNotice('');
          }}><option value="">Bild auswählen</option>{pictures.filter(p => !pair.some((r,i) => i !== index && r.projectId === p.project.id && r.artworkId === p.artwork.id)).map(p => <option key={p.key} value={p.key}>{p.project.name} · {p.artwork.title}</option>)}</select></label>
          {selectedPictures[index] ? <><img className="h-48 w-full rounded bg-slate-100 object-contain sm:h-96" src={selectedPictures[index]!.artwork.imageUrl} alt={selectedPictures[index]!.artwork.title} /><p className="break-words text-sm font-semibold">{selectedPictures[index]!.artwork.title}</p><p className="text-xs text-slate-500">{selectedPictures[index]!.artwork.artist} · {selectedPictures[index]!.artwork.year}</p><button className={button} onClick={() => onOpen({ ...selectedPictures[index]!, title: '', text: '', field: 'Bild' })}>Bild öffnen</button></> : <p className="py-16 text-center text-sm text-slate-500">Noch kein Bild ausgewählt</p>}
        </div>)}</div>
        {selectedPictures.length === 2 && selectedPictures.every(Boolean) && <>
          <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full table-fixed text-sm"><caption className="p-3 text-left font-bold">Vorhandene Angaben und Analysen</caption><thead><tr><th className="w-1/3 break-words p-2 text-left sm:w-1/5">Kriterium</th><th className="p-2 text-left">Bild 1</th><th className="p-2 text-left">Bild 2</th></tr></thead><tbody>{['Motiv', 'Komposition', 'Farbe', 'Licht', 'Technik'].map((label,i) => <tr key={label} className="border-t"><th className="break-words p-2 text-left align-top">{label}</th>{selectedPictures.map((p,j) => <td key={j} className="break-words p-2 align-top">{[p!.artwork.description, p!.artwork.formalAnalysis?.composition, p!.artwork.colors?.join(', '), p!.artwork.formalAnalysis?.lightAndShadow, p!.artwork.formalAnalysis?.technique || p!.artwork.medium][i] || 'Noch keine Angabe'}</td>)}</tr>)}</tbody></table></div>
          <button className={button} onClick={() => add(null, { title: 'Eigene Beobachtungen zum Bildvergleich', comparison: selectedPictures.map(p => ({ projectId: p!.project.id, artworkId: p!.artwork.id, title: p!.artwork.title })) })}>Eigene Vergleichsnotiz / Aufgabe anlegen</button>
          <section className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-bold">KI-Vergleich</h2><p className="text-sm text-slate-600">Nur auf deinen Auftrag werden beide Bilder an den KI-Dienst gesendet. Das Ergebnis wird als KI-Notiz gespeichert.</p><label className="block text-sm">Zusätzliche Vergleichsfrage (optional)<textarea aria-label="Zusätzliche Vergleichsfrage" maxLength={2000} className={field} value={question} onChange={e => setQuestion(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button className={primary} disabled={!aiAvailable || busy} onClick={() => void compare()}>{busy ? 'Vergleich läuft …' : 'KI-Vergleich starten'}</button>{busy && <button className={button} onClick={() => controller.current?.abort()}>Abbrechen</button>}<button className={button} onClick={() => setView('notes')}>Gespeicherte Notizen</button></div>{!aiAvailable && <p className="text-sm">KI ist derzeit nicht verfügbar. Der manuelle Vergleich bleibt nutzbar.</p>}{error && <p role="alert" className="text-red-700">{error}</p>}</section>
        </>}
      </>}
      {view === 'notes' && <>
        <div><h1 className="text-2xl font-bold">Notizen & Aufgaben</h1><p className="mt-1 text-sm text-slate-600">Gedanken zu deiner App und Sammlung. Änderungen werden automatisch gespeichert.</p></div>
        <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 text-sm">Neue Notiz zu<select aria-label="Neue Notiz zu" className={field} value={newOwner} onChange={e => setNewOwner(e.target.value)}><option value="">App / Sammlung allgemein</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className={primary} onClick={() => add(newOwner || null)}>Neue Notiz</button></div>
        <div className="grid gap-3 sm:grid-cols-4"><label className="text-sm">Notizen durchsuchen<input className={field} value={noteQuery} onChange={e => setNoteQuery(e.target.value)} /></label><label className="text-sm">Bezug<select aria-label="Bezug" className={field} value={noteScope} onChange={e => setNoteScope(e.target.value)}><option value="">Alle Bezüge</option><option value="app">App / Vergleiche</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm">Form<select aria-label="Form" className={field} value={noteKind} onChange={e => setNoteKind(e.target.value)}><option value="">Alle Formen</option>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">Aufgabenstatus<select aria-label="Aufgabenstatus" className={field} value={noteStatus} onChange={e => setNoteStatus(e.target.value)}><option value="">Alle</option><option value="open">Offene Aufgaben</option><option value="done">Erledigte Aufgaben</option></select></label></div>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="space-y-2 lg:col-span-2">{noteList.length === 0 && <p className="rounded-xl bg-white p-4 text-slate-500">Keine Einträge für diese Auswahl.</p>}{noteList.map(({project,note}) => <button key={`${project.id}/${note.id}`} className={`w-full rounded-xl border p-3 text-left ${selected?.note.id === note.id && selected.project.id === project.id ? 'border-slate-900 bg-blue-50' : 'bg-white'}`} onClick={() => setSelectedNote({ projectId: project.id, noteId: note.id })}><span className="block text-xs text-slate-500">{labels[note.kind]} · {project.name}{project.name.includes('(Konfliktkopie)') ? ' · Bitte prüfen' : ''}</span><span className="block break-words font-semibold">{note.title || 'Ohne Titel'}</span><span className="mt-1 block line-clamp-2 break-words text-sm text-slate-600">{note.content || 'Noch kein Text'}</span>{note.kind === 'task' && <span className="mt-1 block text-xs">{note.done ? '✓ Erledigt' : 'Offen'}{note.due ? ` · Fällig: ${note.due}` : ''}</span>}</button>)}</div>
          <div className="min-w-0 lg:col-span-3">{selected ? <section className="space-y-3 rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">{selected.project.name} · {selected.note.source === 'ai' ? `KI-Ergebnis (${selected.note.model || 'KI'}), bearbeitbar` : 'Eigene Notiz'}</p>
            <label className="block text-sm">Zuordnung<select aria-label="Zuordnung" className={field} value={selected.project.kind === 'notebook' ? '' : selected.project.id} onChange={e => onMove(selected.project.id, selected.note.id, e.target.value || null)}><option value="">App / Sammlung allgemein</option>{visibleProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="block text-sm">Titel<input className={field} value={selected.note.title} onChange={e => edit({ title: e.target.value })} /></label>
            <label className="block text-sm">Form<select aria-label="Form" className={field} value={selected.note.kind} onChange={e => edit({ kind: e.target.value as WorkNote['kind'] })}>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="block text-sm">Text<textarea aria-label="Text" className={`${field} min-h-64`} value={selected.note.content} onChange={e => edit({ content: e.target.value })} /></label>
            {selected.project.kind !== 'notebook' && <label className="block text-sm">Bildbezug<select aria-label="Bildbezug" className={field} value={selected.note.artworkIds[0] ?? ''} onChange={e => edit({ artworkIds: e.target.value ? [e.target.value] : [] })}><option value="">Gesamtes Projekt</option>{selected.project.artworks.filter(a => !a.deletedAt).map(a => <option key={a.id} value={a.id}>{a.title}</option>)}{selected.note.artworkIds.some(id => !selected.project.artworks.some(a => a.id === id && !a.deletedAt)) && <option value={selected.note.artworkIds[0]}>Gelöschtes Bild</option>}</select></label>}
            {selected.note.artworkIds.map(id => { const a = selected.project.artworks.find(a => a.id === id && !a.deletedAt); return a ? <button key={id} className={button} onClick={() => onOpen({ project: selected.project, artwork: a, title: a.title, text: '', field: 'Bild' })}>Bild öffnen: {a.title}</button> : <p key={id} className="text-sm text-amber-800">Das zugeordnete Bild wurde gelöscht. Die Notiz bleibt erhalten.</p>; })}
            {selected.note.comparison && <div className="space-y-2"><p className="text-sm font-semibold">Verglichene Bilder</p>{selected.note.comparison.map((r,i) => { const p = projects.find(p => p.id === r.projectId); const a = p?.artworks.find(a => a.id === r.artworkId && !a.deletedAt); return <p key={i} className="text-sm">Bild {i+1}: {a && p ? <button className="underline" onClick={() => onOpen({ project: p, artwork: a, title: a.title, text: '', field: 'Bild' })}>{a.title}</button> : `${r.title} (nicht mehr vorhanden)`}</p>; })}<button className={button} disabled={selected.note.comparison.length !== 2 || selected.note.comparison.some(r => !pictures.some(p => p.project.id === r.projectId && p.artwork.id === r.artworkId))} onClick={() => { setPair(selected.note.comparison!); setView('compare'); }}>Vergleich wieder öffnen</button></div>}
            {selected.note.kind === 'task' && <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Fällig am<input className={field} type="date" value={selected.note.due} onChange={e => edit({ due: e.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.note.done} onChange={e => edit({ done: e.target.checked })} />Erledigt</label></div>}
            <button className={`${button} text-red-700`} onClick={() => onDelete(selected.project.id, selected.note.id)}>Notiz löschen</button>
          </section> : <p className="rounded-xl border bg-white p-6 text-slate-500">Wähle eine Notiz aus oder lege eine neue an.</p>}</div>
        </div>
      </>}
    </div>
  </div>;
}

function excerpt(text: string, query: string): string {
  const term = query.trim().split(/\s+/)[0]?.toLocaleLowerCase();
  const found = term ? text.toLocaleLowerCase().indexOf(term) : 0;
  const start = Math.max(0, found - 60);
  return `${start ? '…' : ''}${text.slice(start, start + 300)}${text.length > start + 300 ? '…' : ''}`;
}
