import { pageIndex, resolveSwipe, swipeTarget } from './swipe';

const PATHS = ['/', '/log', '/calendar', '/reports', '/settings'];

describe('resolveSwipe', () => {
  it('a long, mostly horizontal swipe left goes to the next page', () => {
    expect(resolveSwipe(-120, 10, 300)).toBe('next');
  });
  it('a long, mostly horizontal swipe right goes to the previous page', () => {
    expect(resolveSwipe(120, -12, 300)).toBe('prev');
  });
  it('a quick short flick counts', () => {
    expect(resolveSwipe(-45, 4, 60)).toBe('next');
  });
  it('small finger movement is ignored', () => {
    expect(resolveSwipe(-30, 0, 100)).toBeNull();
    expect(resolveSwipe(20, 5, 50)).toBeNull();
  });
  it('a medium slow drag is ignored (neither far nor fast)', () => {
    expect(resolveSwipe(-50, 0, 400)).toBeNull();
  });
  it('vertical scrolling is never a swipe', () => {
    expect(resolveSwipe(-20, 200, 200)).toBeNull();
    expect(resolveSwipe(-80, 150, 250)).toBeNull();
  });
  it('diagonal drags are ignored', () => {
    expect(resolveSwipe(-100, 80, 300)).toBeNull();
  });
  it('very slow drags (e.g. text selection) are ignored', () => {
    expect(resolveSwipe(-200, 0, 1500)).toBeNull();
  });
});

describe('swipeTarget', () => {
  it('moves through Home > Study Log > Calendar > Reports > Settings in order', () => {
    expect([0, 1, 2, 3].map((i) => swipeTarget(i, 5, 'next'))).toEqual([1, 2, 3, 4]);
    expect([4, 3, 2, 1].map((i) => swipeTarget(i, 5, 'prev'))).toEqual([3, 2, 1, 0]);
  });
  it('does not go past the first or last page', () => {
    expect(swipeTarget(0, 5, 'prev')).toBeNull();
    expect(swipeTarget(4, 5, 'next')).toBeNull();
  });
  it('does nothing off the main pages or without an intent', () => {
    expect(swipeTarget(-1, 5, 'next')).toBeNull();
    expect(swipeTarget(2, 5, null)).toBeNull();
  });
});

describe('pageIndex', () => {
  it('maps paths to tab positions', () => {
    expect(PATHS.map((p) => pageIndex(p, PATHS))).toEqual([0, 1, 2, 3, 4]);
  });
  it('treats unknown paths as not a main page', () => {
    expect(pageIndex('/nope', PATHS)).toBe(-1);
  });
});
