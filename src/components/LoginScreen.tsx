import { useState } from 'react';
import { Archive, Loader2, Lock } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../config';
import { api } from '../lib/api';
import { errorMessage } from '../lib/util';

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(errorMessage(err, 'Anmeldung fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        className="animate-slide-up w-full max-w-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="mb-10 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl">
            <Archive size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{APP_NAME}</h1>
            <p className="text-sm font-medium text-slate-500">{APP_TAGLINE}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="password" className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Lock size={12} /> Passwort
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={!password || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} Anmelden
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Geschützter Zugang · Dein persönliches Archiv auf deinen Geräten.</p>
      </form>
    </div>
  );
}
