import { useState } from 'react';
import type { WikiEntry } from '../types';
import { formatDateTime, generateId } from '../lib/util';
import { ConfirmModal, type ConfirmOptions } from './Modals';

export function WikiDiscussion({ entry, sectionId, onChange }: {
  entry: WikiEntry; sectionId: string; onChange: (updater: (entry: WikiEntry) => WikiEntry) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const posts = entry.discussion ?? [];
  return <section id={sectionId} tabIndex={-1} aria-label="Diskussion zum Artikel" className="mx-auto mt-10 max-w-3xl scroll-mt-4 border-t border-slate-200 pt-6">
    <h3 className="text-lg font-bold">Diskussion <span className="text-sm font-normal text-slate-500">({posts.length})</span></h3>
    <p className="mt-1 text-sm text-slate-600">Fragen, Einwände und Ergänzungen zu diesem Artikel. Beiträge bleiben vom Artikeltext getrennt.</p>
    <div className="mt-4 space-y-3">
      {posts.length === 0 && <p className="text-sm text-slate-500">Noch keine Beiträge.</p>}
      {posts.map((post, index) => <article key={post.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Eigener Beitrag · Erstellt: <time dateTime={new Date(post.createdAt).toISOString()}>{formatDateTime(post.createdAt)}</time>{post.updatedAt !== post.createdAt && <> · Bearbeitet: {formatDateTime(post.updatedAt)}</>}</p>
          <div className="flex gap-3 text-sm"><button className="underline" aria-label={`Beitrag ${index + 1} ${editing === post.id ? 'fertig' : 'bearbeiten'}`} onClick={() => setEditing(editing === post.id ? null : post.id)}>{editing === post.id ? 'Fertig' : 'Bearbeiten'}</button><button className="text-red-700 underline" aria-label={`Beitrag ${index + 1} löschen`} onClick={() => setConfirm({ title: 'Beitrag löschen?', message: 'Dieser Diskussionsbeitrag wird auf allen Geräten entfernt.', action: () => onChange(current => ({ ...current, discussion: (current.discussion ?? []).filter(p => p.id !== post.id) })) })}>Löschen</button></div>
        </div>
        {editing === post.id ? <><textarea autoFocus aria-label={`Beitrag ${index + 1} bearbeiten`} className="mt-3 min-h-32 w-full rounded-lg border bg-white p-3 text-sm" value={post.content} maxLength={20000} onChange={event => onChange(current => ({ ...current, discussion: (current.discussion ?? []).map(p => p.id === post.id ? { ...p, content: event.target.value, updatedAt: Date.now() } : p) }))} /><p className="text-xs text-slate-500">Änderungen werden automatisch gespeichert.</p></> : <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{post.content || '(Leerer Beitrag)'}</p>}
      </article>)}
    </div>
    <form className="mt-5" onSubmit={event => {
      event.preventDefault();
      const id = generateId(); const now = Date.now();
      onChange(current => {
        const content = current.discussionDraft?.trim();
        return content ? { ...current, discussion: [...(current.discussion ?? []), { id, content, createdAt: now, updatedAt: now }], discussionDraft: '' } : current;
      });
    }}>
      <label className="block text-sm font-semibold" htmlFor={`${sectionId}-draft`}>Neuer Diskussionsbeitrag</label>
      <textarea id={`${sectionId}-draft`} aria-label="Neuer Diskussionsbeitrag" className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 p-3 text-sm" value={entry.discussionDraft ?? ''} maxLength={20000} placeholder="Zum Beispiel: Ist die Datierung ausreichend belegt?" onChange={event => onChange(current => ({ ...current, discussionDraft: event.target.value }))} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Dein Entwurf wird automatisch gespeichert.</p><button type="submit" disabled={!entry.discussionDraft?.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Beitrag hinzufügen</button></div>
    </form>
    {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
  </section>;
}
