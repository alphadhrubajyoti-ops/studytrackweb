import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { MiniTimer } from './Timer';
import { useData } from '../hooks/useData';
import logo from '../logo.png';

export const NAV = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/log', label: 'Study Log', icon: 'log' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Layout() {
  const { pathname } = useLocation();
  const { running } = useData();
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="safe-top sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-card px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img src={logo} alt="" width={44} height={44} className="rounded-xl" />
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
                `flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold transition-colors ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-sunken hover:text-ink'}`
              }
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">{running && pathname !== '/' && <MiniTimer />}</div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {running && pathname !== '/' && (
            <div className="mb-4 lg:hidden">
              <MiniTimer />
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur lg:hidden"
        aria-label="Main"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-semibold ${isActive ? 'text-accent-strong' : 'text-muted'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${isActive ? 'bg-accent-soft' : ''}`}
                    >
                      <Icon name={n.icon} size={22} />
                    </span>
                    {n.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
