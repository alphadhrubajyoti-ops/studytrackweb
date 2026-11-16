import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../hooks/useData';
import { useToast } from '../hooks/useToast';
import { Icon } from '../components/Icon';
import { ConfirmDialog, Field, Modal, PageHeader, SubjectDot } from '../components/ui';
import { SubjectModal } from '../components/SubjectModal';
import { saveSetting, setDailyTarget } from '../db/settings';
import {
  archiveSubject,
  deleteSubjectAndSessions,
  restoreSubject,
  sessionCountForSubject,
} from '../db/subjects';
import {
  clearAllData,
  exportBackup,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from '../db/backup';
import { errorMessage } from '../db/errors';
import { ACCENTS } from '../lib/palette';
import { hashPin, isValidPin, verifyPin } from '../lib/lock';
import { targetMinutesFor } from '../lib/stats';
import { formatHHMMLabel, formatDateWithYear, dateKey } from '../lib/time';
import { askNotificationPermission, notificationsSupported } from '../pwa/notifications';
import { useInstall } from '../pwa/install';
import { APP_VERSION } from '../constants';
import type { Subject, ThemeMode, WeekStart } from '../types';

function Section({
  title,
  icon,
  children,
  desc,
}: {
  title: string;
  icon: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-5" aria-label={title}>
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="inline-flex rounded-xl bg-sunken p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${value === o.value ? 'bg-card shadow-sm' : 'text-muted'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Settings() {
  const d = useData();
  const { settings, goals, todayKey, subjects } = d;
  const toast = useToast();
  const install = useInstall();

  const [targetH, setTargetH] = useState('2');
  const [targetM, setTargetM] = useState('0');
  useEffect(() => {
    const m = targetMinutesFor(goals, todayKey);
    setTargetH(String(Math.floor(m / 60)));
    setTargetM(String(m % 60));
  }, [goals, todayKey]);

  const [subjectModal, setSubjectModal] = useState<{ open: boolean; subject?: Subject }>({
    open: false,
  });
  const [removing, setRemoving] = useState<Subject | null>(null);
  const [removeCount, setRemoveCount] = useState(0);
  const [deleteText, setDeleteText] = useState('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(
    notificationsSupported() ? Notification.permission : 'unsupported',
  );
  const [newTime, setNewTime] = useState('18:00');
  const [pinModal, setPinModal] = useState<'set' | 'off' | null>(null);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const [importing, setImporting] = useState<BackupFile | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [quota, setQuota] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => {});
    void navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setQuota(`${(e.usage / 1024).toFixed(0)} KB used`))
      .catch(() => {});
  }, []);

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.show(ok, 'success');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  async function saveTarget() {
    const minutes = Number(targetH || 0) * 60 + Number(targetM || 0);
    await guard(
      () => setDailyTarget(minutes),
      'Daily target saved. Earlier days keep their old target.',
    );
  }

  async function openRemove(s: Subject) {
    setRemoveCount(await sessionCountForSubject(s.id));
    setDeleteText('');
    setRemoving(s);
  }

  async function toggleReminders(on: boolean) {
    if (on) {
      let perm = notifPerm;
      if (perm === 'default') perm = await askNotificationPermission();
      setNotifPerm(perm);
      if (perm !== 'granted') {
        toast.show(
          perm === 'unsupported'
            ? 'This browser does not support notifications.'
            : 'Notifications are blocked. Allow them in your browser settings to use reminders.',
          'error',
        );
        return;
      }
    }
    await guard(() => saveSetting('reminderEnabled', on));
  }

  async function savePin() {
    setPinErr('');
    if (pinModal === 'set') {
      if (!isValidPin(pin1)) return setPinErr('Use 4 to 8 digits.');
      if (pin1 !== pin2) return setPinErr('The two PINs do not match.');
      await guard(async () => saveSetting('lock', await hashPin(pin1)), 'Privacy lock turned on.');
    } else if (settings.lock) {
      if (!(await verifyPin(pin1, settings.lock))) return setPinErr('That PIN is not correct.');
      await guard(() => saveSetting('lock', null), 'Privacy lock turned off.');
    }
    setPinModal(null);
  }

  async function doExport() {
    await guard(async () => {
      const b = await exportBackup();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `studytrack-backup-${dateKey(Date.now())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'Backup downloaded. Keep it somewhere safe.');
  }

  const activeSubjects = subjects
    .filter((s) => !s.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
  const archived = subjects
    .filter((s) => s.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader title="Settings" subtitle={`StudyTrack ${APP_VERSION}`} />
      <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section title="Appearance" icon="moon">
            <Segmented<ThemeMode>
              label="Theme"
              value={settings.theme}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
              onChange={(v) => guard(() => saveSetting('theme', v))}
            />
            <div>
              <div className="mb-2 text-sm font-semibold">Accent colour</div>
              <div className="flex flex-wrap gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.key}
                    aria-label={a.label}
                    aria-pressed={settings.accent === a.key}
                    onClick={() => guard(() => saveSetting('accent', a.key))}
                    className={`grid h-11 w-11 place-items-center rounded-full border-2 ${settings.accent === a.key ? 'border-ink' : 'border-transparent'}`}
                    style={{ background: a.light.accent }}
                  >
                    {settings.accent === a.key && (
                      <Icon name="check" size={18} className="text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <Segmented<string>
              label="Time format"
              value={settings.hour12 ? '12' : '24'}
              options={[
                { value: '12', label: '12-hour' },
                { value: '24', label: '24-hour' },
              ]}
              onChange={(v) => guard(() => saveSetting('hour12', v === '12'))}
            />
            <Segmented<WeekStart>
              label="Week starts on"
              value={settings.weekStart}
              options={[
                { value: 6, label: 'Sat' },
                { value: 0, label: 'Sun' },
                { value: 1, label: 'Mon' },
              ]}
              onChange={(v) => guard(() => saveSetting('weekStart', v))}
            />
          </Section>

          <Section
            title="Daily study target"
            icon="target"
            desc="Changing it affects today and future days only."
          >
            <div className="flex items-end gap-3">
              <Field label="Hours" htmlFor="t-h">
                <input
                  id="t-h"
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  value={targetH}
                  onChange={(e) => setTargetH(e.target.value)}
                />
              </Field>
              <Field label="Minutes" htmlFor="t-m">
                <input
                  id="t-m"
                  className="field"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={targetM}
                  onChange={(e) => setTargetM(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary" onClick={saveTarget}>
                Save
              </button>
            </div>
          </Section>

          <Section
            title="Subjects"
            icon="book"
            desc="Removing a subject hides it from lists but keeps its history."
          >
            {activeSubjects.length === 0 && (
              <p className="text-sm text-muted">You have not created any subjects yet.</p>
            )}
            <ul className="divide-y divide-line">
              {activeSubjects.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <SubjectDot subject={s} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                  <button
                    className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-sunken"
                    aria-label={`Edit ${s.name}`}
                    onClick={() => setSubjectModal({ open: true, subject: s })}
                  >
                    <Icon name="edit" size={18} />
                  </button>
                  <button
                    className="grid h-11 w-11 place-items-center rounded-lg text-muted hover:bg-sunken"
                    aria-label={`Remove ${s.name}`}
                    onClick={() => openRemove(s)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn btn-soft w-full" onClick={() => setSubjectModal({ open: true })}>
              <Icon name="plus" size={18} /> Add subject
            </button>
            {archived.length > 0 && (
              <details>
                <summary className="min-h-10 cursor-pointer text-sm font-semibold text-muted">
                  Removed subjects ({archived.length})
                </summary>
                <ul className="mt-1 divide-y divide-line">
                  {archived.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2">
                      <SubjectDot subject={s} size={32} />
                      <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                      <button
                        className="btn btn-ghost min-h-10 px-3 text-sm"
                        onClick={() => guard(() => restoreSubject(s.id), 'Subject restored.')}
                      >
                        <Icon name="undo" size={16} /> Restore
                      </button>
                      <button
                        className="grid h-11 w-11 place-items-center rounded-lg text-danger hover:bg-sunken"
                        aria-label={`Delete ${s.name} permanently`}
                        onClick={() => openRemove(s)}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section
            title="Reminders"
            icon="bell"
            desc="Optional. Reminders appear only while StudyTrack is open in your browser, because websites cannot wake a closed app."
          >
            {notifPerm === 'unsupported' ? (
              <p className="rounded-xl bg-sunken p-3 text-sm text-muted">
                This browser does not support notifications. On iPhone, add StudyTrack to your Home
                Screen first (iOS 16.4 or later).
              </p>
            ) : (
              <>
                <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                  <span className="font-semibold">Study reminders</span>
                  <input
                    type="checkbox"
                    className="h-6 w-6 accent-[var(--accent)]"
                    checked={settings.reminderEnabled && notifPerm === 'granted'}
                    onChange={(e) => toggleReminders(e.target.checked)}
                  />
                </label>
                {notifPerm === 'denied' && (
                  <p className="text-sm text-danger">
                    Notifications are blocked for this site. Allow them in your browser settings,
                    then switch reminders on again.
                  </p>
                )}
                {settings.reminderEnabled && notifPerm === 'granted' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {settings.reminderTimes.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-sm font-semibold text-accent-strong"
                        >
                          {formatHHMMLabel(t, settings.hour12)}
                          <button
                            className="grid h-8 w-8 place-items-center rounded-full"
                            aria-label={`Remove reminder at ${t}`}
                            onClick={() =>
                              guard(() =>
                                saveSetting(
                                  'reminderTimes',
                                  settings.reminderTimes.filter((x) => x !== t),
                                ),
                              )
                            }
                          >
                            <Icon name="x" size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                    {settings.reminderTimes.length < 4 && (
                      <div className="flex gap-2">
                        <input
                          className="field"
                          type="time"
                          aria-label="New reminder time"
                          value={newTime}
                          onChange={(e) => setNewTime(e.target.value)}
                        />
                        <button
                          className="btn btn-soft shrink-0"
                          onClick={() =>
                            newTime &&
                            !settings.reminderTimes.includes(newTime) &&
                            guard(() =>
                              saveSetting(
                                'reminderTimes',
                                [...settings.reminderTimes, newTime].sort(),
                              ),
                            )
                          }
                        >
                          Add time
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Section>

          <Section
            title="Install StudyTrack"
            icon="phone"
            desc="Add it to your home screen to open it like an app, even offline."
          >
            {install.standalone ? (
              <p className="rounded-xl bg-accent-soft p-3 text-sm font-medium text-accent-strong">
                You are using the installed app.
              </p>
            ) : install.canPrompt ? (
              <button
                className="btn btn-primary w-full"
                onClick={() =>
                  guard(async () => {
                    await install.install();
                  })
                }
              >
                <Icon name="download" size={18} /> Install app
              </button>
            ) : install.ios ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Open this page in Safari.</li>
                <li>Tap the Share button.</li>
                <li>Choose &quot;Add to Home Screen&quot;.</li>
              </ol>
            ) : (
              <p className="text-sm text-muted">
                Open your browser menu and choose &quot;Install app&quot; or &quot;Add to Home
                screen&quot;. If you do not see it, your browser may not support installing
                websites. StudyTrack still works fine in a tab.
              </p>
            )}
            <p className="text-xs text-muted">
              A website installed this way is not identical to a native Android or iOS app: it
              cannot run background tasks or send notifications while closed.
            </p>
          </Section>

          <Section
            title="Privacy lock"
            icon="lock"
            desc="Hides StudyTrack behind a PIN each time you open it."
          >
            <p className="rounded-xl bg-sunken p-3 text-sm text-muted">
              This is a convenience screen, not encryption. Anyone who can use this device&apos;s
              browser profile or its developer tools can still read your study data.
            </p>
            {settings.lock ? (
              <button
                className="btn btn-ghost w-full"
                onClick={() => {
                  setPin1('');
                  setPin2('');
                  setPinErr('');
                  setPinModal('off');
                }}
              >
                Turn off PIN lock
              </button>
            ) : (
              <button
                className="btn btn-soft w-full"
                onClick={() => {
                  setPin1('');
                  setPin2('');
                  setPinErr('');
                  setPinModal('set');
                }}
              >
                Set a PIN
              </button>
            )}
          </Section>

          <Section
            title="Your data"
            icon="download"
            desc="Everything is stored in this browser only. Nothing is sent to a server."
          >
            <div className="rounded-xl bg-gold/10 p-3 text-sm">
              <strong>
                Clearing browser data, uninstalling the browser, or using private browsing can erase
                your study records.
              </strong>{' '}
              Download a backup now and then.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-soft" onClick={doExport}>
                <Icon name="download" size={18} /> Backup
              </button>
              <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={18} /> Restore
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  await guard(async () => setImporting(parseBackup(await f.text())));
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted">
                {persisted === null
                  ? ''
                  : persisted
                    ? 'Protected from automatic cleanup.'
                    : 'Browser may clear this data if the device runs low on space.'}{' '}
                {quota}
              </span>
              {persisted === false && (
                <button
                  className="btn btn-ghost min-h-10 px-3 text-sm"
                  onClick={() =>
                    guard(async () => {
                      const ok = await navigator.storage?.persist?.();
                      setPersisted(!!ok);
                      if (!ok) throw new Error('declined');
                    }, 'Storage is now protected.')
                  }
                >
                  Protect data
                </button>
              )}
            </div>
            <button
              className="btn btn-ghost w-full text-danger"
              onClick={() => {
                setClearText('');
                setClearOpen(true);
              }}
            >
              <Icon name="trash" size={18} /> Clear all data
            </button>
          </Section>

          <Section title="About StudyTrack" icon="info">
            <p className="text-sm text-muted">
              Your Study. Your Progress. Version {APP_VERSION}. Works offline after the first load
              and never uploads your records.
            </p>
          </Section>
        </div>
      </div>

      <SubjectModal
        open={subjectModal.open}
        subject={subjectModal.subject}
        onClose={() => setSubjectModal({ open: false })}
      />

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={
          removing?.archivedAt ? `Delete "${removing.name}"?` : `Remove "${removing?.name ?? ''}"?`
        }
        footer={
          <button className="btn btn-ghost" onClick={() => setRemoving(null)}>
            Cancel
          </button>
        }
      >
        {removing && (
          <div className="space-y-4 text-sm">
            {!removing.archivedAt && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 font-semibold">Remove, keep history (recommended)</p>
                <p className="mb-3 text-muted">
                  Hides the subject from pickers. Its {removeCount}{' '}
                  {removeCount === 1 ? 'session stays' : 'sessions stay'} in reports. You can
                  restore it any time.
                </p>
                <button
                  className="btn btn-primary w-full"
                  onClick={() =>
                    guard(async () => {
                      await archiveSubject(removing.id);
                      setRemoving(null);
                    }, 'Subject removed.')
                  }
                >
                  <Icon name="archive" size={18} /> Remove subject
                </button>
              </div>
            )}
            <div className="rounded-xl border border-danger/40 p-3">
              <p className="mb-2 font-semibold text-danger">Delete permanently</p>
              <p className="mb-3 text-muted">
                Deletes the subject and {removeCount} {removeCount === 1 ? 'session' : 'sessions'}.
                Totals, streaks and records will change. This cannot be undone.
              </p>
              <input
                className="field mb-3"
                aria-label="Type DELETE to confirm"
                placeholder="Type DELETE to confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
              />
              <button
                className="btn btn-danger w-full"
                disabled={deleteText !== 'DELETE'}
                onClick={() =>
                  guard(async () => {
                    await deleteSubjectAndSessions(removing.id);
                    setRemoving(null);
                  }, 'Subject and its sessions deleted.')
                }
              >
                Delete subject and sessions
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!pinModal}
        onClose={() => setPinModal(null)}
        title={pinModal === 'set' ? 'Set a PIN' : 'Turn off PIN lock'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setPinModal(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={savePin}>
              {pinModal === 'set' ? 'Turn on lock' : 'Turn off'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field
            label={pinModal === 'set' ? 'New PIN (4 to 8 digits)' : 'Current PIN'}
            htmlFor="pin1"
          >
            <input
              id="pin1"
              className="field"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin1}
              onChange={(e) => setPin1(e.target.value.replace(/\D/g, ''))}
              autoComplete="off"
            />
          </Field>
          {pinModal === 'set' && (
            <Field label="Repeat PIN" htmlFor="pin2">
              <input
                id="pin2"
                className="field"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                autoComplete="off"
              />
            </Field>
          )}
          {pinErr && (
            <p role="alert" className="text-sm font-medium text-danger">
              {pinErr}
            </p>
          )}
          {pinModal === 'set' && (
            <p className="text-xs text-muted">
              There is no way to recover a forgotten PIN. If you forget it, clear the site data in
              your browser (this deletes your study records), so keep a backup.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!importing}
        title="Replace your data with this backup?"
        confirmLabel="Replace my data"
        danger
        onCancel={() => setImporting(null)}
        onConfirm={() =>
          guard(async () => {
            if (importing) await restoreBackup(importing);
            setImporting(null);
          }, 'Backup restored.')
        }
      >
        {importing && (
          <p>
            This backup (saved{' '}
            {importing.exportedAt
              ? formatDateWithYear(dateKey(importing.exportedAt))
              : 'on an unknown date'}
            ) has {importing.subjects.length} subjects and {importing.sessions.length} sessions.
            Everything currently in StudyTrack will be replaced. Download a backup first if you are
            unsure.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={clearOpen}
        title="Clear all data?"
        confirmLabel="Delete everything"
        danger
        disabled={clearText !== 'DELETE'}
        onCancel={() => setClearOpen(false)}
        onConfirm={() =>
          guard(async () => {
            await clearAllData();
            window.location.reload();
          })
        }
      >
        <p>
          This permanently deletes every subject, session, goal and setting stored by StudyTrack in
          this browser. It cannot be undone.
        </p>
        <button className="btn btn-soft w-full" onClick={doExport}>
          <Icon name="download" size={18} /> Download a backup first
        </button>
        <input
          className="field"
          aria-label="Type DELETE to confirm"
          placeholder="Type DELETE to confirm"
          value={clearText}
          onChange={(e) => setClearText(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
