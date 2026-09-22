import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/** Stapel offener Overlays: Escape schließt immer nur das oberste. */
const escapeStack: { current: () => void }[] = [];
let escapeListenerInstalled = false;

function installEscapeListener(): void {
  if (escapeListenerInstalled) return;
  escapeListenerInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = escapeStack[escapeStack.length - 1];
    if (!top) return;
    event.preventDefault();
    top.current();
  });
}

/** Schließt ein Overlay mit der Escape-Taste. */
export function useEscape(onEscape: () => void, active = true): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    installEscapeListener();
    const entry = handler;
    escapeStack.push(entry);
    return () => {
      const index = escapeStack.lastIndexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [active]);
}

/** Verhindert, dass die Seite hinter einem Overlay scrollt (wichtig auf iOS). */
export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'neutral';
  action: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Löschen', tone = 'danger', action, onClose }: ConfirmOptions & { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="mb-2 flex items-center gap-2 text-lg font-bold text-gray-900">
          <AlertTriangle className={tone === 'danger' ? 'text-red-500' : 'text-amber-500'} size={20} /> {title}
        </h3>
        <p className="mb-6 whitespace-pre-line text-sm leading-relaxed text-gray-600">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200">
            Abbrechen
          </button>
          <button
            autoFocus
            onClick={() => {
              action();
              onClose();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors ${
              tone === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-black'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ersatz für window.prompt() – z. B. für Projektnamen. */
export function TextPromptModal({
  title,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'Speichern',
  onSubmit,
  onClose,
}: {
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEscape(onClose);
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };
  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <form
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h3 className="mb-4 text-lg font-bold text-gray-900">{title}</h3>
        {label && <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</label>}
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          maxLength={200}
          className="mb-6 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            Abbrechen
          </button>
          <button type="submit" disabled={!value.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-40">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Einfacher Dialog-Rahmen mit Kopfzeile. */
export function ModalFrame({ title, icon, onClose, children, wide = false }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEscape(onClose);
  useBodyScrollLock();
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-gray-100 bg-white p-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-800">
            {icon} {title}
          </h3>
          <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Schließen">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}
