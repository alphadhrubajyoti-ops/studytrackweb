export interface SubjectColor {
  key: string;
  label: string;
  light: string;
  dark: string;
}

export const SUBJECT_COLORS: SubjectColor[] = [
  { key: 'forest', label: 'Forest', light: '#2F6B45', dark: '#7DBF8E' },
  { key: 'sage', label: 'Sage', light: '#7A9E7E', dark: '#9CC0A0' },
  { key: 'lime', label: 'Lime', light: '#7FA83A', dark: '#A8CF63' },
  { key: 'gold', label: 'Gold', light: '#D99A1E', dark: '#F0BD52' },
  { key: 'clay', label: 'Clay', light: '#C0653F', dark: '#E39070' },
  { key: 'rose', label: 'Rose', light: '#B4506C', dark: '#DE8AA3' },
  { key: 'plum', label: 'Plum', light: '#7A5395', dark: '#B08FCF' },
  { key: 'ocean', label: 'Ocean', light: '#2F7C93', dark: '#68B8CF' },
  { key: 'indigo', label: 'Indigo', light: '#4B5FA8', dark: '#8A9BE0' },
  { key: 'slate', label: 'Slate', light: '#5D6B6B', dark: '#9FADAD' },
];

export function subjectColor(key: string | undefined, isDark: boolean): string {
  const c = SUBJECT_COLORS.find((x) => x.key === key) ?? SUBJECT_COLORS[0];
  return isDark ? c.dark : c.light;
}

export interface Accent {
  key: string;
  label: string;
  light: { accent: string; strong: string; soft: string };
  dark: { accent: string; strong: string; soft: string };
}

export const ACCENTS: Accent[] = [
  {
    key: 'sage',
    label: 'Sage',
    light: { accent: '#4F7F5A', strong: '#3B6446', soft: '#E1ECDC' },
    dark: { accent: '#8CBF96', strong: '#A9D6B2', soft: '#243228' },
  },
  {
    key: 'forest',
    label: 'Forest',
    light: { accent: '#1F5A3A', strong: '#154229', soft: '#DAE9DF' },
    dark: { accent: '#6FB588', strong: '#93D0A8', soft: '#1F3326' },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    light: { accent: '#2F7C93', strong: '#235F72', soft: '#DDEBF0' },
    dark: { accent: '#6DB9D0', strong: '#8FD0E4', soft: '#1E2F36' },
  },
  {
    key: 'plum',
    label: 'Plum',
    light: { accent: '#7A5395', strong: '#5F3E77', soft: '#EBE2F1' },
    dark: { accent: '#B391D0', strong: '#C9AFE0', soft: '#2D2336' },
  },
  {
    key: 'clay',
    label: 'Clay',
    light: { accent: '#B2593A', strong: '#8E4429', soft: '#F3E2DA' },
    dark: { accent: '#E08F6E', strong: '#EDAA8E', soft: '#382621' },
  },
];

export const SUBJECT_ICONS: Record<string, string> = {
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 3h10v4H7V6Zm1 7h2m4 0h2M8 17h2m4 0h2',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M7.5 15h9',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z',
  pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4ZM14 7l3 3',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15M5 19l7-7',
  atom: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12 4c4 0 7 3.6 7 8s-3 8-7 8-7-3.6-7-8 3-8 7-8Zm0 0c-4 0-7 3.6-7 8M4.5 7.5c3.5-2 9.5 1 12.5 6s2.5 8 0 8',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  scale: 'M12 4v16M6 20h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0l-3 7a3 3 0 0 0 6 0l-3-7Z',
};
