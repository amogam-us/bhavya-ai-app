import type { Notification } from '@bhavya/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { Button, ConnectionBadge } from '../../components/ui';
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
          <img src="/logo-wordmark.png" alt="Bhavya" width={121} height={38} />
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
