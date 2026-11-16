import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { db } from '../db/db';
import { saveSetting } from '../db/settings';
import { createSubject } from '../db/subjects';
import { addManualSession } from '../db/sessions';

beforeEach(async () => {
  db.close();
  await db.delete();
  await db.open();
  window.location.hash = '';
  document.documentElement.classList.remove('dark');
  localStorage.clear();
  sessionStorage.clear();
});

const ready = async () => {
  await saveSetting('onboarded', true);
  render(<App />);
  await screen.findByRole('heading', { name: /start learning/i });
};
const goTo = async (name: RegExp) => {
  await userEvent.click(screen.getAllByRole('link', { name })[0]);
};

async function createSubjectViaUI(name: string) {
  await userEvent.click(screen.getByRole('button', { name: /create a new subject/i }));
  const dialog = await screen.findByRole('dialog', { name: /new subject/i });
  await userEvent.type(within(dialog).getByLabelText(/subject name/i), name);
  await userEvent.click(within(dialog).getByRole('button', { name: /create subject/i }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('onboarding', () => {
  it('shows on first visit, can be completed, and is remembered', async () => {
    render(<App />);
    expect(await screen.findByText(/track your study time/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByText(/organise subjects and chapters/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^next$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^3 h$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^dark$/i }));
    await userEvent.click(screen.getByRole('button', { name: /start using studytrack/i }));
    await waitFor(() => expect(screen.queryByText(/make it yours/i)).not.toBeInTheDocument());
    expect((await db.settings.get('onboarded'))?.value).toBe(true);
    expect((await db.goals.toArray())[0].targetMinutes).toBe(180);
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
  });
  it('can be skipped', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /skip/i }));
    await screen.findByRole('heading', { name: /start learning/i });
  });
});

describe('navigation and empty states', () => {
  it('reaches every section and shows helpful empty states', async () => {
    await ready();
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument();
    await goTo(/study log/i);
    expect(await screen.findByText(/your study history starts here/i)).toBeInTheDocument();
    await goTo(/calendar/i);
    expect(
      await screen.findByRole('heading', { name: /november 2026|^[a-z]+ \d{4}$/i, level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no study recorded/i)).toBeInTheDocument();
    await goTo(/reports/i);
    expect(await screen.findByText(/no reports yet/i)).toBeInTheDocument();
    await goTo(/settings/i);
    expect(await screen.findByRole('heading', { name: /appearance/i })).toBeInTheDocument();
    await goTo(/home/i);
    await screen.findByRole('heading', { name: /start learning/i });
  });
  it('renders both the desktop sidebar and the mobile bottom bar (CSS picks one)', async () => {
    await ready();
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    expect(navs).toHaveLength(2);
    expect(navs[1].className).toMatch(/lg:hidden/);
    expect(navs[0].parentElement?.className).toMatch(/hidden.*lg:flex/);
    for (const nav of navs) expect(within(nav).getAllByRole('link')).toHaveLength(5);
  });
});

describe('timer flow', () => {
  it('creates a subject, starts, pauses, resumes and finishes with a summary', async () => {
    await ready();
    await createSubjectViaUI('Physics');
    await userEvent.type(screen.getByLabelText(/^chapter$/i), 'Motion');
    await userEvent.click(screen.getByRole('button', { name: /start learning now/i }));

    expect(await screen.findByRole('timer')).toBeInTheDocument();
    expect(screen.getByText('Studying')).toBeInTheDocument();
    expect(await db.sessions.toArray()).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /^pause$/i }));
    expect(await screen.findByText('Paused')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(await screen.findByText('Studying')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /finish study/i }));
    const summary = await screen.findByRole('dialog', { name: /session complete/i });
    expect(within(summary).getByText(/physics - motion/i)).toBeInTheDocument();
    await userEvent.click(within(summary).getByRole('button', { name: /^done$/i }));
    await waitFor(() => expect(screen.queryByRole('timer')).not.toBeInTheDocument());
    expect((await db.sessions.toArray())[0].status).toBe('completed');
    expect(await db.pauses.count()).toBe(1);
  });
  it('shows an already-running session after a reload (recovery) on every page', async () => {
    await ready();
    const s = await createSubject('Maths', 'forest', 'calc');
    const { startSession } = await import('../db/sessions');
    await startSession({ subjectId: s.id, chapter: 'Algebra' });
    expect(await screen.findByRole('timer')).toBeInTheDocument();
    await goTo(/study log/i);
    expect(
      await screen.findAllByRole('button', { name: /open running study session/i }),
    ).not.toHaveLength(0);
  });
  it('pressing Enter in the New subject dialog creates the subject but does not start a session', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: /create a new subject/i }));
    const dialog = await screen.findByRole('dialog', { name: /new subject/i });
    await userEvent.type(within(dialog).getByLabelText(/subject name/i), 'Geography{Enter}');
    await waitFor(async () => expect(await db.subjects.count()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await db.sessions.count()).toBe(0);
  });
  it('requires a subject before starting', async () => {
    await ready();
    await userEvent.click(screen.getByRole('button', { name: /start learning now/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a subject/i);
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('quick add, study log, edit and delete', () => {
  it('adds a past session and the totals update everywhere', async () => {
    await ready();
    await createSubject('Chemistry', 'ocean', 'flask');
    await userEvent.click(screen.getAllByRole('button', { name: /quick add/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /quick add/i });
    const sub = within(dialog).getByLabelText(/^subject$/i);
    await userEvent.selectOptions(sub, within(sub).getByRole('option', { name: 'Chemistry' }));
    await userEvent.type(within(dialog).getByLabelText(/^chapter$/i), 'Acids');
    const yesterday = new Date(Date.now() - 86_400_000);
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: key } });
    fireEvent.change(within(dialog).getByLabelText(/start time/i), { target: { value: '16:00' } });
    fireEvent.change(within(dialog).getByLabelText(/finish time/i), { target: { value: '17:30' } });
    expect(within(dialog).getByText(/total: 1h 30m/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /add session/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await goTo(/study log/i);
    expect((await screen.findAllByText('Chemistry')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('1h 30m').length).toBeGreaterThan(0);
  });
  it('validates Quick add input and blocks overlaps with a clear message', async () => {
    await ready();
    const s = await createSubject('Biology', 'lime', 'leaf');
    const day = new Date(Date.now() - 2 * 86_400_000);
    const at = (h: number) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).getTime();
    await addManualSession({ subjectId: s.id, chapter: 'Cells', startAt: at(10), endAt: at(11) });
    await userEvent.click(screen.getAllByRole('button', { name: /quick add/i })[0]);
    const dialog = await screen.findByRole('dialog', { name: /quick add/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /add session/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/choose a subject/i);
    const sub = within(dialog).getByLabelText(/^subject$/i);
    await userEvent.selectOptions(sub, within(sub).getByRole('option', { name: 'Biology' }));
    await userEvent.type(within(dialog).getByLabelText(/^chapter$/i), 'Genes');
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    fireEvent.change(within(dialog).getByLabelText(/^date$/i), { target: { value: key } });
    fireEvent.change(within(dialog).getByLabelText(/start time/i), { target: { value: '10:30' } });
    fireEvent.change(within(dialog).getByLabelText(/finish time/i), { target: { value: '11:30' } });
    await userEvent.click(within(dialog).getByRole('button', { name: /add session/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/overlaps another session/i);
    expect(await db.sessions.count()).toBe(1);
  });
  it('edits and deletes a session from the log', async () => {
    await ready();
    const s = await createSubject('History', 'clay', 'globe');
    const d = new Date(Date.now() - 3 * 86_400_000);
    const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
    await addManualSession({ subjectId: s.id, chapter: 'Rome', startAt: at(9), endAt: at(10) });
    await goTo(/study log/i);
    await userEvent.click(await screen.findByText('Rome'));
    await userEvent.click(await screen.findByRole('button', { name: /^edit$/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit session/i });
    const chapter = within(dialog).getByLabelText(/^chapter$/i);
    await userEvent.clear(chapter);
    await userEvent.type(chapter, 'Greece');
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    expect(await screen.findByText(/session updated/i)).toBeInTheDocument();
    // Back on the details view, which now shows the new chapter.
    const details = await screen.findByRole('dialog', { name: /session details/i });
    expect(await within(details).findByText('Greece')).toBeInTheDocument();
    await userEvent.click(within(details).getByRole('button', { name: /delete/i }));
    await userEvent.click(await screen.findByRole('button', { name: /delete session/i }));
    await waitFor(() =>
      expect(screen.getByText(/your study history starts here/i)).toBeInTheDocument(),
    );
    expect(await db.sessions.count()).toBe(0);
  });
  it('searches and filters the log', async () => {
    await ready();
    const a = await createSubject('Maths', 'forest', 'calc');
    const b = await createSubject('English', 'plum', 'pen');
    const d = new Date(Date.now() - 4 * 86_400_000);
    const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
    await addManualSession({
      subjectId: a.id,
      chapter: 'Fractions',
      startAt: at(9),
      endAt: at(10),
    });
    await addManualSession({ subjectId: b.id, chapter: 'Poetry', startAt: at(11), endAt: at(12) });
    await goTo(/study log/i);
    await screen.findByText('Fractions');
    await userEvent.type(screen.getByLabelText(/search sessions/i), 'poet');
    await waitFor(() => expect(screen.queryByText('Fractions')).not.toBeInTheDocument());
    expect(screen.getByText('Poetry')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/search sessions/i), 'zzz');
    expect(await screen.findByText(/no sessions match/i)).toBeInTheDocument();
  });
});

describe('calendar and reports with data', () => {
  it('shows daily totals in the calendar and charts in reports', async () => {
    await ready();
    const s = await createSubject('Maths', 'forest', 'calc');
    const now = new Date();
    const at = (h: number, m = 0) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
    // use yesterday so the time can never be in the future
    const y = (h: number) => at(h) - 86_400_000;
    await addManualSession({ subjectId: s.id, chapter: 'Algebra', startAt: y(9), endAt: y(10) });
    await goTo(/calendar/i);
    const cell = await screen.findByRole('gridcell', { name: /1h studied/i });
    await userEvent.click(cell);
    expect(await screen.findByText(/by subject/i)).toBeInTheDocument();
    await goTo(/reports/i);
    expect(await screen.findByText(/study time by day/i)).toBeInTheDocument();
    expect(screen.getAllByText(/maths/i).length).toBeGreaterThan(0);
  });
});

describe('settings', () => {
  it('switches theme and saves the daily target', async () => {
    await ready();
    await goTo(/settings/i);
    await userEvent.click(await screen.findByRole('radio', { name: /^dark$/i }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
    expect(localStorage.getItem('studytrack.theme')).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: /^light$/i }));
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false));
    const h = screen.getByLabelText(/^hours$/i);
    await userEvent.clear(h);
    await userEvent.type(h, '3');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(async () =>
      expect((await db.goals.toArray()).some((g) => g.targetMinutes === 180)).toBe(true),
    );
  });
  it('requires typing DELETE before clearing all data', async () => {
    await ready();
    await createSubject('Maths', 'forest', 'calc');
    await goTo(/settings/i);
    await userEvent.click(await screen.findByRole('button', { name: /clear all data/i }));
    const dialog = await screen.findByRole('dialog', { name: /clear all data/i });
    const confirm = within(dialog).getByRole('button', { name: /delete everything/i });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(await db.subjects.count()).toBe(1);
  });
  it('removes a subject but keeps its sessions (safe default)', async () => {
    await ready();
    const s = await createSubject('Art', 'rose', 'pen');
    const d = new Date(Date.now() - 86_400_000 * 2);
    const at = (h: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).getTime();
    await addManualSession({ subjectId: s.id, chapter: 'Sketch', startAt: at(9), endAt: at(10) });
    await goTo(/settings/i);
    await userEvent.click(await screen.findByRole('button', { name: /remove art/i }));
    await userEvent.click(await screen.findByRole('button', { name: /^remove subject$/i }));
    await waitFor(async () => expect((await db.subjects.get(s.id))?.archivedAt).toBeTruthy());
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('privacy lock', () => {
  it('asks for the PIN and unlocks only with the right one', async () => {
    const { hashPin } = await import('../lib/lock');
    await saveSetting('onboarded', true);
    await saveSetting('lock', await hashPin('4821'));
    render(<App />);
    const input = await screen.findByLabelText('PIN');
    await userEvent.type(input, '1111');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not correct/i);
    await userEvent.type(screen.getByLabelText('PIN'), '4821');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    await screen.findByRole('heading', { name: /start learning/i });
    const stored = JSON.stringify(await db.settings.get('lock'));
    expect(stored).not.toContain('4821');
  });
});
