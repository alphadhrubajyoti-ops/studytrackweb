import { useState } from 'react';
import { verifyPin } from '../lib/lock';
import logo from '../logo.png';
import type { LockSettings } from '../types';

export function LockScreen({ lock, onUnlock }: { lock: LockSettings; onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    const ok = await verifyPin(pin, lock);
    if (ok) onUnlock();
    else {
      setError('That PIN is not correct.');
      setPin('');
    }
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-paper p-6">
      <form
        className="card w-full max-w-sm p-6 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <img src={logo} alt="" width={72} height={72} className="mx-auto mb-3 rounded-2xl" />
        <h1 className="font-display text-xl font-semibold">StudyTrack is locked</h1>
        <p className="mb-4 mt-1 text-sm text-muted">Enter your PIN to continue.</p>
        <input
          className="field text-center text-2xl tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          aria-label="PIN"
          value={pin}
          autoFocus
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <button className="btn btn-primary mt-4 w-full" disabled={busy || pin.length < 4}>
          Unlock
        </button>
      </form>
    </div>
  );
}
