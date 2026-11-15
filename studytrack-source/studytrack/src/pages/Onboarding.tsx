import { useState } from 'react';
import { Icon } from '../components/Icon';
import { saveSetting, setDailyTarget } from '../db/settings';
import { useToast } from '../hooks/useToast';
import { errorMessage } from '../db/errors';
import { useData } from '../hooks/useData';
import logo from '../logo.png';
import type { ThemeMode } from '../types';

const STEPS = [
  {
    icon: 'clock',
    title: 'Track your study time',
    text: 'Press start when you begin and finish when you are done. Breaks are never counted, and the timer stays accurate even if you lock your phone.',
  },
  {
    icon: 'book',
    title: 'Organise subjects and chapters',
    text: 'Create your own subjects, then note the chapter you studied each time, so you can see where your effort goes.',
  },
  {
    icon: 'reports',
    title: 'Monitor your progress',
    text: 'Daily, weekly and monthly totals, a calendar and reports show how your study time adds up.',
  },
  {
    icon: 'flame',
    title: 'Build consistent habits',
    text: 'Set a daily target and keep a streak going. Small sessions on most days beat one long session once a week.',
  },
];
const TARGETS = [30, 60, 90, 120, 180, 240];

export function Onboarding() {
  const { settings } = useData();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(120);
  const [theme, setTheme] = useState<ThemeMode>(settings.theme);
  const last = step === STEPS.length;

  async function finish(skip: boolean) {
    try {
      if (!skip) {
        await setDailyTarget(target);
        await saveSetting('theme', theme);
      }
      await saveSetting('onboarded', true);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-paper">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="" width={36} height={36} className="rounded-lg" />
            <span className="font-display text-lg font-semibold">StudyTrack</span>
          </div>
          <button
            className="min-h-11 px-2 text-sm font-semibold text-muted"
            onClick={() => finish(true)}
          >
            Skip
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          {!last ? (
            <div key={step} className="anim-fade text-center">
              <span className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-accent-soft text-accent-strong">
                <Icon name={STEPS[step].icon} size={38} />
              </span>
              <h1 className="font-display text-3xl font-semibold leading-tight">
                {STEPS[step].title}
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-muted">{STEPS[step].text}</p>
            </div>
          ) : (
            <div className="anim-fade space-y-6">
              <div className="text-center">
                <h1 className="font-display text-3xl font-semibold">Make it yours</h1>
                <p className="mt-2 text-muted">You can change both later in Settings.</p>
              </div>
              <fieldset>
                <legend className="mb-2 font-semibold">Daily study target</legend>
                <div className="grid grid-cols-3 gap-2">
                  {TARGETS.map((m) => (
                    <button
                      key={m}
                      aria-pressed={target === m}
                      onClick={() => setTarget(m)}
                      className={`min-h-12 rounded-xl border font-semibold ${target === m ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-card'}`}
                    >
                      {m >= 60
                        ? `${(m / 60) % 1 === 0 ? m / 60 : (m / 60).toFixed(1)} h`
                        : `${m} min`}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 font-semibold">Theme</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(['light', 'dark', 'system'] as ThemeMode[]).map((t) => (
                    <button
                      key={t}
                      aria-pressed={theme === t}
                      onClick={() => {
                        setTheme(t);
                        void saveSetting('theme', t);
                      }}
                      className={`min-h-12 rounded-xl border font-semibold capitalize ${theme === t ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-card'}`}
                    >
                      {t === 'system' ? 'Auto' : t}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>

        <div>
          <div className="mb-4 flex justify-center gap-2" aria-hidden="true">
            {[...STEPS, 0].map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-2 bg-line'}`}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button
              className="btn btn-primary flex-1 min-h-12"
              onClick={() => (last ? finish(false) : setStep(step + 1))}
            >
              {last ? 'Start using StudyTrack' : 'Next'}
            </button>
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            No account needed. Your study data stays on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
