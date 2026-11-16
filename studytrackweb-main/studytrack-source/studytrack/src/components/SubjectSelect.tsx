import { useState } from 'react';
import { useData } from '../hooks/useData';
import { SubjectModal } from './SubjectModal';
import { Icon } from './Icon';

export function SubjectSelect({
  id,
  value,
  onChange,
  includeId,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  /** Keep an archived subject selectable when editing an old session. */
  includeId?: string;
}) {
  const { subjects } = useData();
  const [creating, setCreating] = useState(false);
  const options = subjects
    .filter((s) => !s.archivedAt || s.id === includeId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex gap-2">
      <select
        id={id}
        className="field flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{options.length ? 'Choose a subject' : 'No subjects yet'}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.archivedAt ? ' (removed)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn btn-soft shrink-0 px-3"
        onClick={() => setCreating(true)}
        aria-label="Create a new subject"
      >
        <Icon name="plus" size={18} />
        <span className="hidden sm:inline">New</span>
      </button>
      <SubjectModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(s) => s && onChange(s.id)}
      />
    </div>
  );
}
