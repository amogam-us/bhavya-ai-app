import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';

// The home simulator is not linked here; it still works when opened directly at /simulator.
const APPS: { to: string; icon: IconName; title: string; text: string }[] = [
  {
    to: '/parent',
    icon: 'list',
    title: 'Parent dashboard',
    text: 'Create routines by writing, speaking or showing a video. Review, approve and follow progress.',
  },
  {
    to: '/child',
    icon: 'heart',
    title: 'Child app',
    text: 'Step-by-step guidance with pictures and voice, a communication board, and calm breaks.',
  },
];

export function HomePage() {
  return (
    <main className="landing">
      <span className="brand">
        <img src="/favicon.svg" alt="" />
        Bhavya AI
      </span>
      <h1>An independence companion for autistic children</h1>
      <p className="lead muted">
        Bhavya remembers routines, guides each step through smart glasses, and keeps the camera off
        in private rooms. Built on Meta Muse models.
      </p>
      <div className="tiles">
        {APPS.map((app) => (
          <Link key={app.to} to={app.to} className="tile">
            <span className="tile-icon">
              <Icon name={app.icon} size={24} />
            </span>
            <h2>{app.title}</h2>
            <p className="muted">{app.text}</p>
          </Link>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 28 }}>
        Tip: open the child app on a phone on the same Wi-Fi, using this computer&apos;s address
        shown in the hub log.
      </p>
    </main>
  );
}
