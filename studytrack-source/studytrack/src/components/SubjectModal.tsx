import { useEffect, useRef, useState } from 'react';
import { Modal, Field } from './ui';
import { Icon } from './Icon';
import { createSubject, updateSubject } from '../db/subjects';
import { errorMessage } from '../db/errors';
import { SUBJECT_COLORS, SUBJECT_ICONS, subjectColor } from '../lib/palette';
import { useIsDark } from '../hooks/useTheme';
import type { Subject } from '../types';

export function SubjectModal({
  open,
  subject,
  onClose,
  onSaved,
}: {
  open: boolean;
  subject?: Subject;
  onClose: () => void;
  onSaved?: (s: Subject | undefined) => void;
}) {
  const dark = useIsDark();
  const [name, setName] = useState('');
  const [color, setColor] = useState(SUBJECT_COLORS[0].key);
  const [icon, setIcon] = useState('book');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Initialise only on open / when editing a different subject, not on every data refresh.
  const subjectRef = useRef(subject);
  subjectRef.current = subject;
  const subjectId = subject?.id;

  useEffect(() => {
    if (open) {
      setName(subject?.name ?? '');
      setColor(
        subject?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)].key,
      );
      setIcon(subject?.icon ?? 'book');
      setError('');
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: initialise on open / subject change only
  }, [open, subjectId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (subject) {
        await updateSubject(subject.id, { name, color, icon });
        onSaved?.(undefined);
      } else {
        onSaved?.(await createSubject(name, color, icon));
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? 'Edit subject' : 'New subject'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {subject ? 'Save subject' : 'Create subject'}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation(); // modals are children of other forms in the React tree
          void save();
        }}
      >
        <Field label="Subject name" htmlFor="subject-name" error={error}>
          <input
            id="subject-name"
            className="field"
            value={name}
            maxLength={60}
            placeholder="e.g. Mathematics"
            onChange={(e) => setName(e.target.value)}
            data-autofocus
            autoComplete="off"
          />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c.key}
                aria-label={c.label}
                aria-pressed={color === c.key}
                onClick={() => setColor(c.key)}
                className={`grid h-10 w-10 place-items-center rounded-full border-2 ${color === c.key ? 'border-ink' : 'border-transparent'}`}
                style={{ background: subjectColor(c.key, dark) }}
              >
                {color === c.key && <Icon name="check" size={16} className="text-white" />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Icon</legend>
          <div className="grid grid-cols-6 gap-2">
            {Object.keys(SUBJECT_ICONS).map((k) => (
              <button
                type="button"
                key={k}
                aria-label={k}
                aria-pressed={icon === k}
                onClick={() => setIcon(k)}
                className={`grid h-11 place-items-center rounded-xl border ${icon === k ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted'}`}
              >
                <Icon name={k} size={20} />
              </button>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
