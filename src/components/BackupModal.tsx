import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  ClipboardCopy,
  Download,
  Folder,
  FolderOpen,
  HardDrive,
  Loader2,
  LogOut,
  RefreshCcw,
  Save,
  ShieldCheck,
  Unlink,
  UploadCloud,
} from 'lucide-react';
import type { SessionInfo } from '../types';
import { estimateStorage, getMeta } from '../lib/storage';
import { formatBytes, formatDateTime } from '../lib/util';
import { ModalFrame } from './Modals';
import { useToast } from './Toasts';

export type FolderStatus = 'unsupported' | 'none' | 'prompt' | 'granted' | 'denied';

/** Lesezeichen-Skript: exportiert die Daten der alten AI-Studio-App (localStorage) als JSON-Datei. */
export const LEGACY_EXPORT_BOOKMARKLET =
  "javascript:(()=>{const d=localStorage.getItem('art_archive_projects');if(!d){alert('Keine ArtArchive-Daten auf dieser Seite gefunden.');return;}" +
  "const b=new Blob([d],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);" +
  "a.download='ArtArchive-Altdaten.json';document.body.appendChild(a);a.click();a.remove();})();";

export function BackupModal({
  session,
  projectCount,
  artworkCount,
  folderStatus,
  folderName,
  isSyncing,
  folderError,
  onLinkFolder,
  onRegrantFolder,
  onUnlinkFolder,
  onExport,
  onImportFile,
  onLogout,
  onClose,
}: {
  session: SessionInfo;
  projectCount: number;
  artworkCount: number;
  folderStatus: FolderStatus;
  folderName?: string;
  isSyncing: boolean;
  folderError?: string;
  onLinkFolder: () => void;
  onRegrantFolder: () => void;
  onUnlinkFolder: () => void;
  onExport: () => Promise<void>;
  onImportFile: (file: File) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastExport, setLastExport] = useState<number | undefined>();
  const [lastFolderSync, setLastFolderSync] = useState<number | undefined>();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void getMeta<number>('lastExport').then(setLastExport);
    void getMeta<number>('lastFolderSync').then(setLastFolderSync);
    void estimateStorage().then(setStorage);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, [isSyncing]);

  const exportNow = async () => {
    await onExport();
    setLastExport(Date.now());
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(LEGACY_EXPORT_BOOKMARKLET);
      toast.success('Lesezeichen-Code kopiert.');
    } catch {
      toast.error('Kopieren nicht möglich – bitte den Code aus der README übernehmen.');
    }
  };

  const daysSinceExport = lastExport ? Math.floor((Date.now() - lastExport) / 86_400_000) : null;

  return (
    <ModalFrame title="Speichern & Synchronisieren" icon={<Save size={20} />} onClose={onClose}>
      <div className="space-y-8 p-6">
        <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Dein persönliches Archiv wird mit dem Server abgeglichen. Melde dich auf deinen anderen Geräten mit demselben Passwort unter derselben Adresse an. Vor dem Gerätewechsel oben auf „Auf dem Server gespeichert“ achten. JSON-Export und Ordner-Sicherung bleiben zusätzliche Sicherungen.</p>
        {/* Ordner-Synchronisation */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <div className={`rounded-full p-2 ${folderStatus === 'granted' ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
              {folderStatus === 'granted' ? <Check size={20} /> : <FolderOpen size={20} />}
            </div>
            <h4 className="font-bold text-gray-800">Zusätzliche Ordner-Sicherung</h4>
          </div>
          <p className="mb-4 pl-11 text-sm text-gray-600">Daten automatisch als Backup-Datei in einem lokalen Ordner speichern.</p>
          <div className="space-y-3 pl-11">
            {folderStatus === 'unsupported' && (
              <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                Dieser Browser erlaubt keinen Ordnerzugriff (z. B. Safari/iPad). Bitte regelmäßig „Export (JSON)“ nutzen und die Datei in
                „Dateien“/iCloud ablegen.
              </p>
            )}
            {folderStatus === 'none' && (
              <button onClick={onLinkFolder} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800">
                <HardDrive size={16} /> Ordner verknüpfen
              </button>
            )}
            {(folderStatus === 'prompt' || folderStatus === 'denied') && (
              <button onClick={onRegrantFolder} className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600">
                <RefreshCcw size={16} /> Zugriff auf „{folderName ?? 'Ordner'}“ erneut erlauben
              </button>
            )}
            {folderStatus === 'granted' && (
              <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-green-800">
                  <Folder size={16} className="shrink-0" /> <span className="truncate">{folderName}</span>
                </span>
                {isSyncing ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Loader2 size={12} className="animate-spin" /> Sync …
                  </span>
                ) : (
                  <span className="text-[11px] text-green-700">{lastFolderSync ? formatDateTime(lastFolderSync) : 'bereit'}</span>
                )}
              </div>
            )}
            {folderStatus !== 'none' && folderStatus !== 'unsupported' && (
              <button onClick={onUnlinkFolder} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600">
                <Unlink size={12} /> Verknüpfung aufheben
              </button>
            )}
            {folderError && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="mb-1 font-bold">Hinweis</p>
                  <p>{folderError}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Export / Import */}
        <section className="space-y-3 pl-11">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => void exportNow()} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:border-slate-900 hover:bg-gray-50">
              <Download size={16} /> Export (JSON)
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:border-slate-900 hover:bg-gray-50">
              <UploadCloud size={16} /> Import (JSON)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onImportFile(file);
              }}
            />
          </div>
          <p className={`text-xs ${daysSinceExport === null || daysSinceExport > 14 ? 'text-amber-700' : 'text-gray-500'}`}>
            Letzter Export: {lastExport ? `${formatDateTime(lastExport)}${daysSinceExport && daysSinceExport > 0 ? ` (vor ${daysSinceExport} Tagen)` : ''}` : 'noch nie'}
            {' · '}
            {projectCount} Projekte, {artworkCount} Werke
          </p>
          <p className="text-xs text-gray-500">
            Speicher im Browser: {storage ? `${formatBytes(storage.usage)} belegt` : 'unbekannt'}
            {persisted === true && ' · dauerhaft geschützt'}
            {persisted === false && ' · kann vom Browser geleert werden – Export empfohlen'}
          </p>
          <details className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">Daten aus der alten AI-Studio-Version übernehmen</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Lesezeichen-Code kopieren und ein beliebiges Lesezeichen damit als Adresse speichern.</li>
              <li>Die alte App (…run.app) öffnen und dort das Lesezeichen antippen – die Datei „ArtArchive-Altdaten.json“ wird geladen.</li>
              <li>Hier „Import (JSON)“ wählen und die Datei auswählen.</li>
            </ol>
            <button onClick={() => void copyBookmarklet()} className="mt-3 flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700 hover:border-slate-900">
              <ClipboardCopy size={12} /> Lesezeichen-Code kopieren
            </button>
          </details>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Zugang & KI */}
        <section className="space-y-3 pl-11">
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <ShieldCheck size={14} className="text-green-600" /> Angemeldet · der OpenAI-Schlüssel liegt nur auf dem Server.
          </p>
          <p className="flex items-center gap-2 text-xs text-gray-600">
            <Bot size={14} className="text-purple-500" />
            {session.offline
              ? 'Server nicht erreichbar – KI-Funktionen offline.'
              : session.aiAvailable
                ? `KI: ${session.mock ? 'Demo-Modus' : session.model}${
                    session.usage && session.usage.limit > 0 ? ` · heute ${session.usage.count}/${session.usage.limit} Anfragen` : ''
                  }`
                : 'KI nicht eingerichtet (OPENAI_API_KEY fehlt).'}
          </p>
          <button onClick={onLogout} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:border-red-300 hover:text-red-600">
            <LogOut size={14} /> Abmelden
          </button>
        </section>
      </div>
    </ModalFrame>
  );
}
