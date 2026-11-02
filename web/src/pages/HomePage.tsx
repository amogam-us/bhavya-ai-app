import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon';
import { api } from '../lib/api';
import { useLoader } from '../lib/useLoader';

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
  {
    to: '/simulator',
    icon: 'home',
    title: 'Home simulator',
    text: 'Stands in for presence sensors and smart lights: move the child between rooms.',
  },
];

export function HomePage() {
  const options = useLoader(() => api.options(), []);
  // Hidden until the hub answers, so a hidden link never flashes; shown if the hub cannot say.
  const showSimulator = options.data ? options.data.simulator.visible : !!options.error;
  const apps = APPS.filter((app) => app.to !== '/simulator' || showSimulator);

  return (
    <main className="landing">
      <img
        className="landing-logo"
        src="/logo.png"
        alt="Bhavya: Supplemental Brain for Autism Kids"
        width={900}
        height={322}
      />
      <h1>An independence companion for autistic children</h1>
      <p className="lead muted">
        Bhavya remembers routines, guides each step through smart glasses, and keeps the camera off
        in private rooms. Built on Meta Muse models.
      </p>
      <div className="tiles">
        {apps.map((app) => (
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
