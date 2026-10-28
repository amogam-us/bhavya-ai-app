import type { Notification } from '@bhavya/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { Button, ConnectionBadge } from '../../components/ui';
import { clockTime } from '../../lib/format';
import { useHome } from '../../lib/useHome';

const NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/parent', icon: 'list', label: 'Routines', end: true },
  { to: '/parent/new', icon: 'plus', label: 'New routine' },
  { to: '/parent/progress', icon: 'chart', label: 'Progress' },
  { to: '/parent/settings', icon: 'settings', label: 'Child & rooms' },
];

/** Kinds that need the parent's attention right away. */
const URGENT = new Set<Notification['kind']>(['help', 'stuck']);
const TOAST_MS = 12_000;

export function ParentLayout() {
  const [toasts, setToasts] = useState<Notification[]>([]);

  const onNotification = useCallback((n: Notification) => {
    if (!URGENT.has(n.kind)) return;
    setToasts((list) => [n, ...list].slice(0, 3));
  }, []);
  const home = useHome('parent', onNotification);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((list) => list.slice(0, -1)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  return (
    <div className="parent-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          Bhavya AI
        </Link>
        <nav className="nav" aria-label="Parent dashboard">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <ConnectionBadge connected={home.connected} />
        <section className="alerts-panel" aria-label="Recent updates">
          <h3>
            <Icon name="bell" size={16} /> Updates
          </h3>
          {home.notifications.length === 0 ? (
            <p className="muted small">Nothing yet.</p>
          ) : (
            <ul className="alerts-list">
              {home.notifications.map((n) => (
                <li key={n.id} className={`alert-item alert-${n.kind}`}>
                  {n.message}
                  <time dateTime={n.at}>{clockTime(n.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main className="parent-main">
        <div className="parent-content">
          <Outlet />
        </div>
      </main>

      <div className="toast-stack" aria-live="assertive">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="alert">
            <Icon name="bell" />
            <span>{t.message}</span>
            <Button
              variant="ghost"
              size="sm"
              icon="close"
              aria-label="Dismiss"
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
