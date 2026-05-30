import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const NAV = [
  ['/', 'Home'],
  ['/learn', 'Learn with AI'],
  ['/play', 'Play vs Computer'],
  ['/lessons', 'Lessons'],
  ['/multiplayer', 'Friends'],
] as const;

function Topbar() {
  const navigate = useNavigate();

  return (
    <div className="topbar">
      <div className="brand" onClick={() => navigate('/')} role="button" tabIndex={0}>
        <div className="brand-mark">象</div>
        <div>
          <div className="brand-name">Jade Court</div>
          <div className="brand-sub">Xiangqi</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map(([path, label]) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <Topbar />
      <div className="rise" style={{ flex: 1 }}>
        <Outlet />
      </div>
      <footer
        style={{
          borderTop: '1px solid var(--line-soft)',
          padding: '22px 30px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          color: 'var(--muted)',
          fontSize: 13.5,
          fontWeight: 700,
        }}
      >
        <span className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 17 }}>
          象
        </span>
        <span style={{ color: 'var(--ink-soft)' }}>Jade Court · Learn &amp; play Xiangqi</span>
        <nav style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <button
            type="button"
            className="nav-link"
            style={{ padding: 0, fontSize: 13.5, fontWeight: 700, background: 'none' }}
            onClick={() => navigate('/learn')}
          >
            Learn
          </button>
          <button
            type="button"
            className="nav-link"
            style={{ padding: 0, fontSize: 13.5, fontWeight: 700, background: 'none' }}
            onClick={() => navigate('/lessons')}
          >
            Lessons
          </button>
          <button
            type="button"
            className="nav-link"
            style={{ padding: 0, fontSize: 13.5, fontWeight: 700, background: 'none' }}
            onClick={() => navigate('/multiplayer')}
          >
            Friends
          </button>
        </nav>
        <span style={{ width: '100%', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>
          © 2026 Jade Court · A teaching prototype
        </span>
      </footer>
    </div>
  );
}
