import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Network,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Artwork, Project, WikiEntry, WikiFolder } from '../types';
import { api } from '../lib/api';
import { byTitle, errorMessage, formatDateTime, generateId } from '../lib/util';
import { findLinkSuggestions, linkFirstOccurrence } from '../lib/wiki';
import { ConfirmModal, useEscape, type ConfirmOptions } from './Modals';
import { useToast } from './Toasts';
import { WikiDiscussion } from './WikiDiscussion';
import { WikiMoveDialog } from './WikiMoveDialog';
import { folderPath, moveWikiItem, type WikiMoveTarget } from '../lib/wiki-structure';
import { WikiContent } from './WikiContent';

function ConnectionsPanel({
  entry,
  entries,
  artworks,
  onLink,
}: {
  entry: WikiEntry;
  entries: WikiEntry[];
  artworks: Artwork[];
  onLink: (title: string) => void;
}) {
  const suggestions = useMemo(() => findLinkSuggestions(entry, entries, artworks), [entry, entries, artworks]);
  if (suggestions.length === 0) return null;
  return (
    <div className="mx-auto mt-12 max-w-3xl border-t border-gray-100 pt-8">
      <h4 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        <Network size={14} /> Verknüpfungsvorschläge
      </h4>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {suggestions.map((suggestion) => (
          <div key={`${suggestion.type}-${suggestion.targetTitle}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate text-sm font-bold text-slate-800">
                {suggestion.type === 'artwork-match' ? <ImageIcon size={12} /> : <File size={12} />}
                {suggestion.targetTitle}
              </div>
              <div className="text-[10px] text-slate-500">{suggestion.reason}</div>
            </div>
            <button
              onClick={() => onLink(suggestion.targetTitle)}
              className="rounded-md p-1.5 text-blue-600 transition-colors hover:bg-blue-100"
              title="Link hinzufügen"
              aria-label={`${suggestion.targetTitle} verlinken`}
            >
              <Plus size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextWiki({
  initialEntryId,
  project,
  onMutate,
  onOpenArtwork,
  aiAvailable,
}: {
  initialEntryId?: string | null;
  project: Project;
  onMutate: (updater: (project: Project) => Project) => void;
  onOpenArtwork: (artworkId: string) => void;
  aiAvailable: boolean;
}) {
  const toast = useToast();
  const entries = useMemo(() => project.wikiEntries ?? [], [project.wikiEntries]);
  const folders = useMemo(() => project.wikiFolders ?? [], [project.wikiFolders]);

  const [moveTarget, setMoveTarget] = useState<WikiMoveTarget | null>(null);
  const discussionRef = useRef<HTMLDivElement>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(initialEntryId ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((project.wikiFolders ?? []).map((folder) => [folder.id, true])),
  );
  const [newFolderName, setNewFolderName] = useState('');
  const [creationTargetId, setCreationTargetId] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'article'>(initialEntryId ? 'article' : 'list');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? entries[0];
  const sortedArtworks = useMemo(() => [...project.artworks].sort(byTitle), [project.artworks]);
  const sortedEntries = useMemo(() => [...entries].sort(byTitle), [entries]);

  useEffect(() => {
    if (selectedEntry && !isEditing) {
      setEditTitle(selectedEntry.title);
      setEditContent(selectedEntry.content);
    }
  }, [selectedEntry, isEditing]);

  const closeAiModal = () => {
    abortRef.current?.abort();
    setShowAiModal(false);
  };
  useEscape(closeAiModal, showAiModal);

  const updateEntry = (id: string, changes: Partial<WikiEntry>) =>
    onMutate((current) => ({
      ...current,
      wikiEntries: (current.wikiEntries ?? []).map((entry) => (entry.id === id ? { ...entry, ...changes, updatedAt: Date.now() } : entry)),
    }));

  /** Offene Bearbeitung übernehmen (statt sie – wie im Original – beim Wechsel zu verwerfen). */
  const commitEdits = () => {
    if (isEditing && selectedEntry) {
      const title = editTitle.trim() || selectedEntry.title;
      if (title !== selectedEntry.title || editContent !== selectedEntry.content) {
        updateEntry(selectedEntry.id, { title, content: editContent });
      }
    }
    setIsEditing(false);
  };

  const selectEntry = (id: string) => {
    commitEdits();
    setSelectedEntryId(id);
    setMobilePane('article');
  };

  const createEntry = (folderId?: string, title = 'Neuer Artikel') => {
    commitEdits();
    const now = Date.now();
    const entry: WikiEntry = {
      id: generateId(),
      ...(folderId ? { folderId } : {}),
      title,
      content: '',
      createdAt: now,
      updatedAt: now,
      source: 'user',
    };
    onMutate((current) => ({ ...current, wikiEntries: [...(current.wikiEntries ?? []), entry] }));
    setSelectedEntryId(entry.id);
    setEditTitle(entry.title);
    setEditContent('');
    setIsEditing(true);
    setMobilePane('article');
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const parentId = creationTargetId && creationTargetId !== 'root' ? creationTargetId : undefined;
    const folder: WikiFolder = { id: generateId(), name, ...(parentId ? { parentId } : {}) };
    onMutate((current) => ({ ...current, wikiFolders: [...(current.wikiFolders ?? []), folder] }));
    setNewFolderName('');
    setCreationTargetId(null);
    setExpandedFolders((previous) => ({ ...previous, [folder.id]: true, ...(parentId ? { [parentId]: true } : {}) }));
  };

  const generateArticle = async () => {
    const topic = aiTopic.trim();
    if (!topic || isGenerating) return;
    setIsGenerating(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { content, mock } = await api.wiki(
        {
          topic,
          projectName: project.name,
          artworkTitles: project.artworks.map((artwork) => artwork.title).filter(Boolean).slice(0, 100),
          entryTitles: entries.map((entry) => entry.title).slice(0, 100),
        },
        controller.signal,
      );
      const now = Date.now();
      const entry: WikiEntry = { id: generateId(), title: topic, content, createdAt: now, updatedAt: now, source: 'ai' };
      onMutate((current) => ({ ...current, wikiEntries: [...(current.wikiEntries ?? []), entry] }));
      setIsEditing(false);
      setSelectedEntryId(entry.id);
      setMobilePane('article');
      setShowAiModal(false);
      setAiTopic('');
      toast.success(`Artikel „${topic}“ erstellt${mock ? ' (Demo-Modus)' : ''}.`);
    } catch (error) {
      if (!controller.signal.aborted) toast.error(errorMessage(error, 'Fehler bei der Generierung.'));
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const askDeleteEntry = (id: string) =>
    setConfirm({
      title: 'Artikel löschen?',
      message: 'Der Artikel wird mit seiner Diskussion und dem Diskussionsentwurf endgültig entfernt.',
      action: () => {
        onMutate((current) => ({ ...current, wikiEntries: (current.wikiEntries ?? []).filter((entry) => entry.id !== id) }));
        if (selectedEntry?.id === id) {
          setSelectedEntryId(null);
          setIsEditing(false);
          setMobilePane('list');
        }
      },
    });

  const askDeleteFolder = (folderId: string) =>
    setConfirm({
      title: 'Ordner löschen?',
      message: 'Der Ordner wird gelöscht. Inhalte werden eine Ebene nach oben verschoben.',
      action: () =>
        onMutate((current) => {
          const currentFolders = current.wikiFolders ?? [];
          const newParent = currentFolders.find((folder) => folder.id === folderId)?.parentId;
          return {
            ...current,
            wikiEntries: (current.wikiEntries ?? []).map((entry) => (entry.folderId === folderId ? { ...entry, folderId: newParent } : entry)),
            wikiFolders: currentFolders
              .filter((folder) => folder.id !== folderId)
              .map((folder) => (folder.parentId === folderId ? { ...folder, parentId: newParent } : folder)),
          };
        }),
    });

  const insertLink = (title: string) => {
    const tag = `[[${title}]]`;
    const textarea = textareaRef.current;
    if (!textarea) {
      setEditContent((previous) => previous + tag);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setEditContent(editContent.slice(0, start) + tag + editContent.slice(end));
    window.setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const navigate = (title: string) => {
    const key = title.trim().toLowerCase();
    const artwork = project.artworks.find((item) => item.title.trim().toLowerCase() === key);
    if (artwork) {
      onOpenArtwork(artwork.id);
      return;
    }
    const entry = entries.find((item) => item.title.trim().toLowerCase() === key);
    if (entry) {
      selectEntry(entry.id);
      return;
    }
    setConfirm({
      title: 'Artikel anlegen?',
      message: `„${title}“ existiert noch nicht. Jetzt als neuen Artikel anlegen?`,
      confirmLabel: 'Anlegen',
      tone: 'neutral',
      action: () => createEntry(undefined, title.trim()),
    });
  };

  const renderEntryRow = (entry: WikiEntry, inFolder: boolean) => {
    const active = selectedEntry?.id === entry.id;
    return (
      <div
        key={entry.id}
        className={`group flex cursor-pointer justify-between rounded px-2 py-1.5 text-sm ${
          active
            ? inFolder
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'bg-white font-medium shadow-sm ring-1 ring-gray-200'
            : 'text-gray-600 hover:bg-gray-100'
        }`}
      >
        <button onClick={() => selectEntry(entry.id)} className="min-w-0 flex-1 truncate text-left" title={entry.title}>{entry.title}</button>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => { commitEdits(); setMoveTarget({ kind: 'article', id: entry.id }); }} className="rounded p-1 hover:bg-blue-100" title="Artikel verschieben" aria-label={`${entry.title} verschieben`}><FolderInput size={14} /></button>
          {entry.source === 'ai'  && <Sparkles size={10} className="text-purple-400" />}
          <button
            onClick={(event) => {
              event.stopPropagation();
              askDeleteEntry(entry.id);
            }}
            className="reveal-on-hover hover:text-red-500"
            aria-label={`${entry.title} löschen`}
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  };

  const renderFolderInput = (compact: boolean) => (
    <div className={`${compact ? 'mb-1 p-1' : 'mb-2 p-2'} flex items-center gap-1 rounded border bg-white shadow-sm`}>
      <input
        autoFocus
        className={`w-full outline-none ${compact ? 'text-xs' : 'text-sm'}`}
        placeholder={compact ? 'Name...' : 'Ordnername...'}
        value={newFolderName}
        onChange={(event) => setNewFolderName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') createFolder();
          if (event.key === 'Escape') setCreationTargetId(null);
        }}
      />
      <button onClick={createFolder} className="rounded p-0.5 text-green-500 hover:bg-green-50" aria-label="Ordner anlegen">
        <Check size={compact ? 12 : 16} />
      </button>
      <button onClick={() => setCreationTargetId(null)} className="rounded p-0.5 text-gray-400 hover:bg-gray-50" aria-label="Abbrechen">
        <X size={compact ? 12 : 16} />
      </button>
    </div>
  );

  const renderTree = (parentId: string | undefined): ReactNode =>
    folders
      .filter((folder) => folder.parentId === parentId)
      .map((folder) => {
        const isOpen = expandedFolders[folder.id] ?? true;
        const folderEntries = entries.filter((entry) => entry.folderId === folder.id);
        return (
          <div key={folder.id} className="mb-1">
            <div
              className="group flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <button onClick={() => setExpandedFolders(previous => ({ ...previous, [folder.id]: !isOpen }))} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
                {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} />}
                {isOpen ? <FolderOpen size={14} className="text-blue-500" /> : <Folder size={14} className="text-blue-500" />}
                <span className="truncate">{folder.name}</span>
              </button>
              <div className="flex shrink-0 items-center rounded bg-gray-100 px-1">
                <button onClick={() => { commitEdits(); setMoveTarget({ kind: 'folder', id: folder.id }); }} className="p-1 hover:text-blue-600" title="Ordner verschieben" aria-label={`Ordner ${folder.name} verschieben`}><FolderInput size={14} /></button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setCreationTargetId(folder.id);
                    setNewFolderName('');
                    setExpandedFolders((previous) => ({ ...previous, [folder.id]: true }));
                  }}
                  className="p-1 hover:text-green-600"
                  title="Unterordner erstellen"
                  aria-label="Unterordner erstellen"
                >
                  <FolderPlus size={12} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    createEntry(folder.id);
                  }}
                  className="p-1 hover:text-blue-600"
                  title="Artikel erstellen"
                  aria-label="Artikel in Ordner erstellen"
                >
                  <Plus size={12} />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    askDeleteFolder(folder.id);
                  }}
                  className="p-1 hover:text-red-500"
                  title="Löschen"
                  aria-label="Ordner löschen"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="ml-3 mt-1 space-y-0.5 border-l border-gray-200 pl-2">
                {creationTargetId === folder.id && renderFolderInput(true)}
                {renderTree(folder.id)}
                {folderEntries.map((entry) => renderEntryRow(entry, true))}
              </div>
            )}
          </div>
        );
      });

  return (
    <div className="relative flex h-[calc(100dvh-150px)] min-h-[420px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:h-[calc(100dvh-140px)]">
      {/* Seitenleiste */}
      <aside className={`${mobilePane === 'article' ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-gray-100 bg-gray-50 md:w-72`}>
        <div className="flex items-center justify-between border-b bg-white p-4">
          <h3 className="flex gap-2 font-bold text-gray-700">
            <BookOpen size={16} /> Wiki
          </h3>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setCreationTargetId('root');
                setNewFolderName('');
              }}
              className="rounded p-1.5 text-gray-500 hover:bg-slate-100"
              title="Neuer Hauptordner"
              aria-label="Neuer Hauptordner"
            >
              <FolderPlus size={16} />
            </button>
            <button onClick={() => createEntry()} className="rounded bg-gray-100 p-1.5 transition-colors hover:bg-black hover:text-white" title="Neuer Artikel" aria-label="Neuer Artikel">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {creationTargetId === 'root' && renderFolderInput(false)}
          {renderTree(undefined)}
          <div className="mt-2 border-t border-gray-100 pt-2">
            <div className="px-2 pb-1 text-[10px] font-bold uppercase text-gray-400">Unsortiert</div>
            {entries.filter((entry) => !entry.folderId).map((entry) => renderEntryRow(entry, false))}
          </div>
        </div>
        <div className="border-t bg-white p-3">
          <button
            onClick={() => setShowAiModal(true)}
            className="flex w-full justify-center gap-2 rounded-lg bg-slate-900 py-2 text-xs font-medium text-white transition-transform active:scale-95"
          >
            <Sparkles size={12} /> KI-Recherche
          </button>
        </div>
      </aside>

      {/* Artikel */}
      <section className={`${mobilePane === 'list' ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col bg-white`}>
        {selectedEntry ? (
          <>
            <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3 md:px-8">
              <button onClick={() => { commitEdits(); setMobilePane('list'); }} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 md:hidden" aria-label="Zur Artikelliste">
                <ArrowLeft size={18} />
              </button>
              {isEditing ? (
                <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="min-w-0 flex-1 text-xl font-bold outline-none md:text-2xl" aria-label="Artikeltitel" />
              ) : (
                <h2 className="min-w-0 flex-1 break-words font-serif text-xl font-bold md:text-2xl">{selectedEntry.title}</h2>
              )}
              <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
                {!isEditing && <button onClick={() => setMoveTarget({ kind: 'article', id: selectedEntry.id })} className="rounded-lg border p-2 hover:bg-gray-50" aria-label="Aktuellen Artikel verschieben" title="Artikel verschieben"><FolderInput size={18} /></button>}
                {isEditing && (
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditTitle(selectedEntry.title);
                      setEditContent(selectedEntry.content);
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
                  >
                    Abbrechen
                  </button>
                )}
                <button
                  onClick={() => (isEditing ? commitEdits() : setIsEditing(true))}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${isEditing ? 'bg-black text-white' : 'border hover:bg-gray-50'}`}
                >
                  {isEditing ? (
                    <>
                      <Save size={14} /> Speichern
                    </>
                  ) : (
                    <>
                      <Edit3 size={14} /> Bearbeiten
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-white p-4 md:p-8">
              <header className="mx-auto mb-6 max-w-3xl space-y-2 border-b border-slate-100 pb-4 text-xs text-slate-500">
                <p className="break-words">{selectedEntry.folderId ? folderPath(folders, selectedEntry.folderId) : 'Unsortiert'}{selectedEntry.source === 'ai' ? ' · KI-generierter Artikel' : ''}</p>
                <p>Erstellt: <time dateTime={new Date(selectedEntry.createdAt).toISOString()}>{formatDateTime(selectedEntry.createdAt)}</time> · Zuletzt geändert: {formatDateTime(selectedEntry.updatedAt)}</p>
                {!isEditing && <a className="inline-block rounded-lg border px-3 py-2 text-sm font-medium text-blue-700" href={`#discussion-${selectedEntry.id}`} onClick={event => { event.preventDefault(); const section = discussionRef.current?.querySelector('section'); section?.scrollIntoView({ block: 'start' }); section?.focus({ preventScroll: true }); }}>Diskussion ({selectedEntry.discussion?.length ?? 0})</a>}
              </header>
              {isEditing ? (
                <div className="flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
                    <span className="flex items-center gap-1 text-xs font-bold uppercase text-gray-500">
                      <LinkIcon size={12} /> Verlinken:
                    </span>
                    <select
                      onChange={(event) => {
                        if (event.target.value) insertLink(event.target.value);
                        event.target.value = '';
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm outline-none"
                      aria-label="Werk verlinken"
                      defaultValue=""
                    >
                      <option value="">Werk auswählen...</option>
                      {sortedArtworks.map((artwork) => (
                        <option key={artwork.id} value={artwork.title}>
                          {artwork.title}
                        </option>
                      ))}
                    </select>
                    <select
                      onChange={(event) => {
                        if (event.target.value) insertLink(event.target.value);
                        event.target.value = '';
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm outline-none"
                      aria-label="Artikel verlinken"
                      defaultValue=""
                    >
                      <option value="">Artikel auswählen...</option>
                      {sortedEntries
                        .filter((entry) => entry.id !== selectedEntry.id)
                        .map((entry) => (
                          <option key={entry.id} value={entry.title}>
                            {entry.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <p className="text-xs text-slate-500">Überschriften wie „## Abschnitt“ und „### Unterabschnitt“ bilden automatisch das verlinkte Inhaltsverzeichnis.</p>
                  <textarea
                    aria-label="Artikelinhalt"
                    ref={textareaRef}
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    className="min-h-[300px] w-full flex-1 resize-none p-2 font-mono text-sm leading-relaxed outline-none"
                    placeholder={'Inhalt... (Markdown, Verlinkungen mit [[Titel]])'}
                  />
                </div>
              ) : (
                <>
                  {selectedEntry.content.trim() ? (
                    <WikiContent content={selectedEntry.content} artworks={project.artworks} entries={entries} onNavigate={navigate} />
                  ) : (
                    <p className="mx-auto max-w-3xl text-sm text-gray-400">Noch kein Inhalt. Über „Bearbeiten“ Text ergänzen.</p>
                  )}
                  <div ref={discussionRef}>
                    <WikiDiscussion key={selectedEntry.id} entry={selectedEntry} sectionId={`discussion-${selectedEntry.id}`} onChange={updater => {
                      const id = selectedEntry.id;
                      onMutate(current => ({ ...current, wikiEntries: (current.wikiEntries ?? []).map(entry => entry.id === id ? updater(entry) : entry) }));
                    }} />
                  </div>
                  <ConnectionsPanel
                    entry={selectedEntry}
                    entries={entries}
                    artworks={project.artworks}
                    onLink={(title) => updateEntry(selectedEntry.id, { content: linkFirstOccurrence(selectedEntry.content, title) })}
                  />
                  <p className="mx-auto mt-10 max-w-3xl text-[11px] text-gray-400">
                    {selectedEntry.source === 'ai' ? 'KI-generiert · ' : ''}Zuletzt geändert: {formatDateTime(selectedEntry.updatedAt)}
                  </p>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-gray-400">
            <BookOpen size={48} className="mb-4 opacity-10" />
            <p>Wählen Sie einen Artikel oder erstellen Sie einen neuen.</p>
          </div>
        )}
      </section>

      {showAiModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onSubmit={(event) => {
              event.preventDefault();
              void generateArticle();
            }}
          >
            <h3 className="mb-4 flex gap-2 font-bold">
              <Sparkles size={18} className="text-purple-500" /> KI-Recherche
            </h3>
            <input
              autoFocus
              value={aiTopic}
              onChange={(event) => setAiTopic(event.target.value)}
              className="mb-3 w-full rounded border p-2 outline-none focus:border-slate-900"
              placeholder="Thema..."
              maxLength={200}
              disabled={isGenerating}
            />
            <p className="mb-4 text-xs text-gray-500">
              {isGenerating
                ? 'Die KI schreibt den Artikel … das kann bis zu einer Minute dauern.'
                : 'Werke dieses Projekts werden automatisch mit [[Titel]] verlinkt, wenn sie passen.'}
            </p>
            {!aiAvailable && <p className="mb-4 rounded bg-red-50 px-3 py-2 text-xs text-red-700">Die KI ist auf dem Server nicht eingerichtet.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeAiModal} className="px-3 py-2 text-sm text-gray-500">
                {isGenerating ? 'Abbrechen' : 'Schließen'}
              </button>
              <button type="submit" disabled={isGenerating || !aiTopic.trim() || !aiAvailable} className="flex items-center gap-2 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-40">
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generieren
              </button>
            </div>
          </form>
        </div>
      )}
      {moveTarget && <WikiMoveDialog project={project} target={moveTarget} onClose={() => setMoveTarget(null)} onMove={destination => {
        try {
          onMutate(current => moveWikiItem(current, moveTarget, destination));
          setExpandedFolders(Object.fromEntries(folders.map(folder => [folder.id, true])));
          setMoveTarget(null);
          toast.success('Verschoben.');
        } catch (error) { toast.error(errorMessage(error, 'Verschieben fehlgeschlagen.')); }
      }} />}
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
