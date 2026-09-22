import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive as ArchiveIcon, Loader2, RefreshCcw, WifiOff } from 'lucide-react';
import { APP_NAME, APP_VERSION } from './config';
import type { Artwork, AnalysisResult, FocusArea, Project, SessionInfo } from './types';
import { AUTH_REQUIRED_EVENT, api } from './lib/api';
import {
  exportBackup,
  folderPermission,
  folderSyncSupported,
  getBackupFolder,
  mergeProjects,
  pickBackupFolder,
  readBackupFile,
  unlinkBackupFolder,
  writeBackupToFolder,
} from './lib/backup';
import { compressImage } from './lib/image';
import { ProjectPersister, deleteMeta, getMeta, loadProjects, requestPersistentStorage, setMeta } from './lib/storage';
import { errorMessage, flattenClusters, generateId } from './lib/util';
import { ArtworkDetailModal } from './components/ArtworkDetailModal';
import { BackupModal, type FolderStatus } from './components/BackupModal';
import { ContextWiki } from './components/ContextWiki';
import { LoginScreen } from './components/LoginScreen';
import { ConfirmModal, TextPromptModal, type ConfirmOptions } from './components/Modals';
import { ProjectList } from './components/ProjectList';
import { Gallery, ProjectHeader, type ProjectViewMode } from './components/ProjectView';
import { ToastProvider, useToast } from './components/Toasts';

export default function App() {
  return (
    <ToastProvider>
      <Root />
    </ToastProvider>
  );
}

function FullscreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center text-slate-500">{children}</div>;
}

/** Sitzung prüfen: Login-Pflicht, Offline-Zugriff nur nach früherer erfolgreicher Anmeldung auf diesem Gerät. */
function Root() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [offlineAllowed, setOfflineAllowed] = useState(false);

  const refreshSession = useCallback(async () => {
    try {
      const info = await api.session();
      if (info.authenticated) await setMeta('hadLogin', Date.now());
      setSession(info);
    } catch {
      setOfflineAllowed(Boolean(await getMeta<number>('hadLogin')));
      setSession({ authenticated: false, version: APP_VERSION, offline: true, aiAvailable: false });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const onAuthRequired = () => setSession((current) => (current ? { ...current, authenticated: false, offline: false } : current));
    const onOnline = () => void refreshSession();
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshSession]);

  if (!session) {
    return (
      <FullscreenMessage>
        <Loader2 className="animate-spin" />
      </FullscreenMessage>
    );
  }

  if (session.offline && !offlineAllowed) {
    return (
      <FullscreenMessage>
        <WifiOff size={36} />
        <p className="max-w-sm">Der Server von {APP_NAME} ist nicht erreichbar. Für die erste Anmeldung wird eine Verbindung benötigt.</p>
        <button onClick={() => void refreshSession()} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          <RefreshCcw size={16} /> Erneut versuchen
        </button>
      </FullscreenMessage>
    );
  }

  if (!session.authenticated && !session.offline) {
    return <LoginScreen onSuccess={() => void refreshSession()} />;
  }

  return (
    <ArchiveApp
      session={session}
      onLogout={async () => {
        try {
          await api.logout();
        } catch {
          // offline: Sitzung verfällt serverseitig von selbst
        }
        await deleteMeta('hadLogin'); // nach dem Abmelden kein Offline-Zugriff mehr ohne neue Anmeldung
        setOfflineAllowed(false);
        setSession((current) => (current ? { ...current, authenticated: false, offline: false } : current));
      }}
      onRetryConnection={() => void refreshSession()}
    />
  );
}

/** Übernimmt KI-Ergebnisse, ohne vorhandene Angaben durch leere KI-Felder zu überschreiben. */
function applyAnalysis(current: Artwork, result: AnalysisResult, model: string): Artwork {
  const text = (value: string, fallback: string) => (value.trim() ? value : fallback);
  const list = (value: string[], fallback: string[] | undefined) => (value.length > 0 ? value : (fallback ?? []));
  const clusters = Object.keys(result.elementClusters).length > 0 ? result.elementClusters : current.elementClusters;
  const formal = { ...(current.formalAnalysis ?? {}) };
  for (const [key, value] of Object.entries(result.formalAnalysis) as [keyof AnalysisResult['formalAnalysis'], string][]) {
    if (value.trim()) formal[key] = value;
  }
  return {
    ...current,
    title: text(result.title, current.title),
    artist: text(result.artist, current.artist),
    year: text(result.year, current.year),
    description: text(result.description, current.description),
    medium: text(result.medium, current.medium),
    dimensions: text(result.dimensions, current.dimensions),
    contextAnalysis: text(result.contextAnalysis, current.contextAnalysis ?? ''),
    styleTags: list(result.styleTags, current.styleTags),
    colors: list(result.colors, current.colors),
    elementClusters: clusters,
    elementTags: flattenClusters(clusters),
    formalAnalysis: formal,
    analyzed: true,
    analyzedAt: Date.now(),
    analysisModel: model,
  };
}

function newArtwork(file: File, imageUrl: string): Artwork {
  const now = Date.now();
  return {
    id: generateId(),
    imageUrl,
    title: file.name.replace(/\.[^.]+$/, '') || 'Ohne Titel',
    artist: 'Unbekannt',
    year: '',
    description: '',
    styleTags: [],
    elementTags: [],
    elementClusters: {},
    analyzed: false,
    inventoryNumber: '',
    medium: '',
    dimensions: '',
    location: '',
    provenance: '',
    catalogText: '',
    createdAt: now,
    updatedAt: now,
  };
}

type PromptState = { kind: 'create' } | { kind: 'rename'; project: Project };

function ArchiveApp({ session, onLogout, onRetryConnection }: { session: SessionInfo; onLogout: () => Promise<void>; onRetryConnection: () => void }) {
  const toast = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [view, setView] = useState<ProjectViewMode>('gallery');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(() => new Set());
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [folder, setFolder] = useState<{ handle?: FileSystemDirectoryHandle; status: FolderStatus; error?: string }>(() => ({
    status: folderSyncSupported() ? 'none' : 'unsupported',
  }));
  const [isSyncing, setIsSyncing] = useState(false);

  const projectsRef = useRef<Project[] | null>(null);
  const folderRef = useRef(folder);
  const folderTimer = useRef<number | undefined>(undefined);
  const saveErrorShown = useRef(false);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  useEffect(() => {
    folderRef.current = folder;
  }, [folder]);

  const syncFolderNow = useCallback(async (list: Project[]) => {
    const { handle, status } = folderRef.current;
    if (!handle || status !== 'granted') return;
    setIsSyncing(true);
    try {
      await writeBackupToFolder(handle, list);
      setFolder((previous) => ({ ...previous, error: undefined }));
    } catch (error) {
      setFolder((previous) => ({ ...previous, error: `Ordner-Sync fehlgeschlagen: ${errorMessage(error, 'unbekannter Fehler')}` }));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const persister = useMemo(
    () =>
      new ProjectPersister(
        (error) => {
          if (saveErrorShown.current) return;
          saveErrorShown.current = true;
          toast.error(`Speichern fehlgeschlagen: ${errorMessage(error, 'Speicher voll?')} Bitte ein Backup exportieren.`);
          window.setTimeout(() => (saveErrorShown.current = false), 30_000);
        },
        (saved) => {
          if (folderRef.current.status !== 'granted') return;
          window.clearTimeout(folderTimer.current);
          folderTimer.current = window.setTimeout(() => void syncFolderNow(saved), 4000);
        },
      ),
    [toast, syncFolderNow],
  );

  // Laden
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { projects: loaded, migratedFromLegacy } = await loadProjects();
        if (cancelled) return;
        persister.prime(loaded);
        setProjects(loaded);
        if (migratedFromLegacy) toast.success('Daten der bisherigen Version wurden übernommen.');
        // Erinnerung an die Sicherung (Browser dürfen lokale Daten löschen, Safari z. B. nach 7 Tagen ohne Nutzung)
        const artworkTotal = loaded.reduce((sum, project) => sum + project.artworks.length, 0);
        const lastExport = await getMeta<number>('lastExport');
        const days = lastExport ? Math.floor((Date.now() - lastExport) / 86_400_000) : null;
        if (!cancelled && artworkTotal >= 3 && (days === null || days >= 14)) {
          toast.info(
            days === null
              ? 'Tipp: Noch keine Sicherung – unter Einstellungen „Export (JSON)“ wählen.'
              : `Letzte Sicherung vor ${days} Tagen – bitte unter Einstellungen exportieren.`,
          );
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(`Lokale Daten konnten nicht geladen werden: ${errorMessage(error, 'unbekannter Fehler')}`);
        setProjects([]);
      }
      if (folderSyncSupported()) {
        const handle = await getBackupFolder();
        if (handle && !cancelled) {
          const state = await folderPermission(handle).catch(() => 'prompt' as PermissionState);
          setFolder({ handle, status: state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [persister, toast]);

  // Speichern: Strukturänderungen (Import, Upload, Löschen …) sofort, Texteingaben kurz entprellt
  const structureRef = useRef('');
  useEffect(() => {
    if (!projects) return;
    const structure = projects
      .map((project) => `${project.id}:${project.artworks.length}:${project.wikiEntries?.length ?? 0}:${project.wikiFolders?.length ?? 0}`)
      .join('|');
    const structural = structure !== structureRef.current;
    structureRef.current = structure;
    persister.schedule(projects, structural ? 0 : 300);
  }, [projects, persister]);

  // Beim Verlassen: sofort sichern; am Desktop warnen, falls noch geschrieben wird
  useEffect(() => {
    const flush = () => void persister.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!persister.isBusy()) return;
      flush();
      event.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [persister]);

  // ---------- Änderungen (immer funktional, damit parallele Aktionen nichts überschreiben) ----------

  const mutateProject = useCallback((projectId: string, updater: (project: Project) => Project) => {
    setProjects((previous) =>
      previous ? previous.map((project) => (project.id === projectId ? { ...updater(project), updatedAt: Date.now() } : project)) : previous,
    );
  }, []);

  const mutateArtwork = useCallback(
    (projectId: string, artworkId: string, updater: (artwork: Artwork) => Artwork) => {
      mutateProject(projectId, (project) => ({
        ...project,
        artworks: project.artworks.map((artwork) => (artwork.id === artworkId ? { ...updater(artwork), updatedAt: Date.now() } : artwork)),
      }));
    },
    [mutateProject],
  );

  const currentProject = projects?.find((project) => project.id === currentProjectId);
  const selectedArtwork = currentProject?.artworks.find((artwork) => artwork.id === selectedArtworkId);

  useEffect(() => {
    if (projects && currentProjectId && !currentProject) setCurrentProjectId(null);
  }, [projects, currentProjectId, currentProject]);

  const createProject = (name: string) => {
    const now = Date.now();
    const project: Project = {
      id: generateId(),
      name,
      description: '',
      createdAt: now,
      updatedAt: now,
      artworks: [],
      historicalContext: '',
      wikiEntries: [{ id: generateId(), title: 'Index', content: 'Willkommen im Wiki.', createdAt: now, updatedAt: now, source: 'user' }],
      wikiFolders: [],
    };
    setProjects((previous) => [...(previous ?? []), project]);
    setCurrentProjectId(project.id);
    setView('gallery');
    void requestPersistentStorage();
  };

  const deleteProject = (project: Project) =>
    setConfirm({
      title: 'Projekt löschen?',
      message: `„${project.name}“ mit ${project.artworks.length} Werken und allen Wiki-Artikeln wird dauerhaft gelöscht.\nTipp: Vorher ein Backup exportieren.`,
      action: () => setProjects((previous) => (previous ?? []).filter((item) => item.id !== project.id)),
    });

  const uploadImages = async (files: File[]) => {
    if (!currentProject || uploadProgress) return;
    const projectId = currentProject.id;
    setUploadProgress({ done: 0, total: files.length });
    const created: Artwork[] = [];
    let failed = 0;
    for (const [index, file] of files.entries()) {
      try {
        created.push(newArtwork(file, await compressImage(file)));
      } catch {
        failed += 1;
      }
      setUploadProgress({ done: index + 1, total: files.length });
    }
    if (created.length > 0) mutateProject(projectId, (project) => ({ ...project, artworks: [...project.artworks, ...created] }));
    setUploadProgress(null);
    if (failed > 0) toast.error(`${failed} Datei(en) konnten nicht als Bild gelesen werden.`);
    else if (created.length > 1) toast.success(`${created.length} Werke hinzugefügt.`);
    void requestPersistentStorage();
  };

  const runAnalysis = async (projectId: string, artworkId: string, options: { focusAreas: FocusArea[]; hint: string }): Promise<boolean> => {
    const artwork = projectsRef.current?.find((project) => project.id === projectId)?.artworks.find((item) => item.id === artworkId);
    if (!artwork) return false;
    setAnalyzingIds((previous) => new Set(previous).add(artworkId));
    try {
      const { result, model, mock } = await api.analyze({
        image: artwork.imageUrl,
        focusAreas: options.focusAreas,
        hint: options.hint,
        known: { title: artwork.title, artist: artwork.artist, year: artwork.year, medium: artwork.medium, dimensions: artwork.dimensions },
      });
      mutateArtwork(projectId, artworkId, (current) => applyAnalysis(current, result, mock ? 'Demo-Modus' : model));
      toast.success(mock ? 'Demo-Analyse abgeschlossen (keine echte KI).' : `KI-Analyse für „${result.title || artwork.title}“ abgeschlossen.`);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, 'Fehler bei der KI-Analyse.'));
      return false;
    } finally {
      setAnalyzingIds((previous) => {
        const next = new Set(previous);
        next.delete(artworkId);
        return next;
      });
    }
  };

  const importFile = async (file: File) => {
    try {
      const { projects: incoming, skippedArtworks } = await readBackupFile(file);
      const existing = projectsRef.current ?? [];
      const existingIds = new Set(existing.map((project) => project.id));
      const conflicts = incoming.filter((project) => existingIds.has(project.id));
      const apply = () => {
        const { added, replaced } = mergeProjects(projectsRef.current ?? [], incoming);
        setProjects((previous) => mergeProjects(previous ?? [], incoming).merged);
        toast.success(
          `Import: ${added} neu, ${replaced} ersetzt${skippedArtworks > 0 ? ` · ${skippedArtworks} Werke ohne gültiges Bild übersprungen` : ''}.`,
        );
        void requestPersistentStorage();
      };
      if (conflicts.length > 0) {
        setConfirm({
          title: 'Vorhandene Projekte ersetzen?',
          message: `${conflicts.length} Projekt(e) gibt es schon (${conflicts.map((project) => `„${project.name}“`).join(', ')}). Sie werden durch die Fassung aus der Datei ersetzt.`,
          confirmLabel: 'Importieren',
          tone: 'neutral',
          action: apply,
        });
      } else {
        apply();
      }
    } catch (error) {
      toast.error(errorMessage(error, 'Import fehlgeschlagen.'));
    }
  };

  const linkFolder = async () => {
    try {
      const handle = await pickBackupFolder();
      const next = { handle, status: 'granted' as FolderStatus };
      folderRef.current = next;
      setFolder(next);
      if (projectsRef.current) await syncFolderNow(projectsRef.current);
      toast.success(`Ordner „${handle.name}“ verknüpft.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setFolder((previous) => ({ ...previous, error: errorMessage(error, 'Ordner konnte nicht verknüpft werden.') }));
    }
  };

  const regrantFolder = async () => {
    const handle = folderRef.current.handle;
    if (!handle) return;
    const state = await folderPermission(handle, true).catch(() => 'denied' as PermissionState);
    const next = { handle, status: (state === 'granted' ? 'granted' : 'denied') as FolderStatus };
    folderRef.current = next;
    setFolder(next);
    if (state === 'granted' && projectsRef.current) await syncFolderNow(projectsRef.current);
  };

  const unlinkFolder = async () => {
    await unlinkBackupFolder();
    setFolder({ status: 'none' });
  };

  if (!projects) {
    return (
      <FullscreenMessage>
        <ArchiveIcon size={32} />
        <Loader2 className="animate-spin" />
      </FullscreenMessage>
    );
  }

  const artworkCount = projects.reduce((sum, project) => sum + project.artworks.length, 0);

  return (
    <>
      {session.offline && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900">
          <WifiOff size={14} /> Offline – Ihre Sammlung ist verfügbar, KI-Funktionen nicht.
          <button onClick={onRetryConnection} className="underline">
            Erneut verbinden
          </button>
        </div>
      )}

      {!currentProject ? (
        <ProjectList
          projects={projects}
          onOpen={(projectId) => {
            setCurrentProjectId(projectId);
            setView('gallery');
          }}
          onCreate={() => setPromptState({ kind: 'create' })}
          onRename={(project) => setPromptState({ kind: 'rename', project })}
          onDelete={deleteProject}
          onOpenSettings={() => setIsBackupOpen(true)}
        />
      ) : (
        <div className="flex min-h-screen flex-col bg-slate-50">
          <ProjectHeader
            project={currentProject}
            view={view}
            onViewChange={setView}
            onBack={() => {
              setCurrentProjectId(null);
              setSelectedArtworkId(null);
            }}
            onUpload={(files) => void uploadImages(files)}
            uploadProgress={uploadProgress}
            onOpenSettings={() => setIsBackupOpen(true)}
            session={session}
          />
          <main className="flex-1">
            {view === 'gallery' ? (
              <Gallery project={currentProject} analyzingIds={analyzingIds} onSelect={setSelectedArtworkId} onUpload={(files) => void uploadImages(files)} />
            ) : (
              <div className="p-3 sm:p-8">
                <ContextWiki
                  key={currentProject.id}
                  project={currentProject}
                  onMutate={(updater) => mutateProject(currentProject.id, updater)}
                  onOpenArtwork={setSelectedArtworkId}
                  aiAvailable={Boolean(session.aiAvailable) && !session.offline}
                />
              </div>
            )}
          </main>
        </div>
      )}

      {currentProject && selectedArtwork && (
        <ArtworkDetailModal
          key={selectedArtwork.id}
          artwork={selectedArtwork}
          project={currentProject}
          aiAvailable={Boolean(session.aiAvailable) && !session.offline}
          analyzing={analyzingIds.has(selectedArtwork.id)}
          onClose={() => setSelectedArtworkId(null)}
          onUpdate={(updater) => mutateArtwork(currentProject.id, selectedArtwork.id, updater)}
          onCreateArtwork={(artwork) => mutateProject(currentProject.id, (project) => ({ ...project, artworks: [...project.artworks, artwork] }))}
          onDeleteArtwork={() => {
            const artworkId = selectedArtwork.id;
            setSelectedArtworkId(null);
            mutateProject(currentProject.id, (project) => ({ ...project, artworks: project.artworks.filter((artwork) => artwork.id !== artworkId) }));
          }}
          onAnalyze={(options) => runAnalysis(currentProject.id, selectedArtwork.id, options)}
        />
      )}

      {isBackupOpen && (
        <BackupModal
          session={session}
          projectCount={projects.length}
          artworkCount={artworkCount}
          folderStatus={folder.status}
          folderName={folder.handle?.name}
          isSyncing={isSyncing}
          folderError={folder.error}
          onLinkFolder={() => void linkFolder()}
          onRegrantFolder={() => void regrantFolder()}
          onUnlinkFolder={() => void unlinkFolder()}
          onExport={async () => {
            await persister.flush();
            await exportBackup(projectsRef.current ?? projects);
          }}
          onImportFile={(file) => void importFile(file)}
          onLogout={() => {
            setIsBackupOpen(false);
            void persister.flush().then(onLogout);
          }}
          onClose={() => setIsBackupOpen(false)}
        />
      )}

      {promptState?.kind === 'create' && (
        <TextPromptModal title="Neues Projekt" label="Projektname" placeholder="z. B. Niederländische Malerei" confirmLabel="Erstellen" onSubmit={createProject} onClose={() => setPromptState(null)} />
      )}
      {promptState?.kind === 'rename' && (
        <TextPromptModal
          title="Projekt umbenennen"
          label="Projektname"
          initialValue={promptState.project.name}
          onSubmit={(name) => mutateProject(promptState.project.id, (project) => ({ ...project, name }))}
          onClose={() => setPromptState(null)}
        />
      )}
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
