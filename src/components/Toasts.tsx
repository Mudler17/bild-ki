import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';

/** Kurze Hinweise statt alert() – blockiert nichts und funktioniert auch auf dem iPad. */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((list) => [...list.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`animate-slide-up pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-xl ${
              toast.kind === 'error'
                ? 'bg-red-600 text-white'
                : toast.kind === 'success'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-800 ring-1 ring-slate-200'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {toast.kind === 'error' ? <AlertTriangle size={16} /> : toast.kind === 'success' ? <Check size={16} /> : <Info size={16} />}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Hinweis schließen">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden.');
  return context;
}
