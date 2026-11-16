import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { MiniTimer } from './Timer';
import { BrandMark } from './Brand';
import { useData } from '../hooks/useData';
import { useSwipeNav } from '../hooks/useSwipeNav';
import { pageIndex } from '../lib/swipe';

export const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/log', label: 'Study Log', icon: 'log' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
const PATHS = NAV.map((n) => n.to);

export function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { running } = useData();
  const scroller = useRef<HTMLElement>(null);
  const index = pageIndex(pathname, PATHS);

  // Remember which way the user moved so the next page can enter from the correct side.
  // (Adjusting state while rendering is the supported pattern for "derived from previous props".)
  const [last, setLast] = useState({ index, dir: 0 });
  if (last.index !== index) {
    setLast({ index, dir: index < 0 || last.index < 0 ? 0 : index > last.index ? 1 : -1 });
  }
  const pageClass = last.dir > 0 ? 'page-in-fwd' : last.dir < 0 ? 'page-in-back' : 'page-in';

  // Every page starts at the top. The shell, not the window, is what scrolls.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [pathname]);

  // Swipe left/right moves through the same routes the bottom bar uses; there is one navigation system.
  useSwipeNav(scroller, {
    index,
    count: NAV.length,
    onNavigate: (i) => navigate(NAV[i].to),
  });

  return (
    <div className="app-shell">
      <aside className="safe-top hidden h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <BrandMark size={44} />
          <div>
            <div className="font-display text-xl font-semibold leading-tight">StudyTrack</div>
            <div className="text-xs text-muted">Your Study. Your Progress.</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold transition-colors duration-200 ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-sunken hover:text-ink'}`
              }
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">{running && pathname !== '/' && <MiniTimer />}</div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main ref={scroller} className="app-scroll" id="main">
          <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            {running && pathname !== '/' && (
              <div className="mb-4 lg:hidden">
                <MiniTimer />
              </div>
            )}
            <div key={pathname} className={pageClass}>
              <Outlet />
            </div>
          </div>
        </main>

        <nav className="bottom-nav lg:hidden" aria-label="Main">
          <div className="relative mx-auto max-w-xl">
            {index >= 0 && (
              <span
                className="nav-indicator"
                style={{ transform: `translate3d(${index * 100}%, 0, 0)` }}
                aria-hidden="true"
              >
                <span />
              </span>
            )}
            <ul className="grid grid-cols-5">
              {NAV.map((n) => (
                <li key={n.to} className="min-w-0">
                  <NavLink
                    to={n.to}
                    end={n.to === '/'}
                    className={({ isActive }) =>
                      `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-semibold transition-colors duration-200 ${isActive ? 'text-accent-strong' : 'text-muted'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`grid h-7 w-12 place-items-center rounded-full transition-[background-color,transform] duration-300 ${isActive ? 'scale-105 bg-accent-soft' : ''}`}
                        >
                          <Icon name={n.icon} size={22} />
                        </span>
                        <span className="max-w-full truncate px-0.5">{n.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}
