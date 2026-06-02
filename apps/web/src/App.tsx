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
      <div className="rise flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-line-soft px-[30px] py-[22px] flex items-center gap-3.5 flex-wrap text-muted text-[13.5px] font-bold">
        <span className="brand-mark w-[30px] h-[30px] rounded-[9px] text-[17px]">象</span>
        <span className="text-ink-soft">Jade Court · Learn &amp; play Xiangqi</span>
        <nav className="ml-auto flex gap-5">
          <button
            type="button"
            className="nav-link p-0 text-[13.5px] font-bold bg-transparent"
            onClick={() => navigate('/learn')}
          >
            Learn
          </button>
          <button
            type="button"
            className="nav-link p-0 text-[13.5px] font-bold bg-transparent"
            onClick={() => navigate('/lessons')}
          >
            Lessons
          </button>
          <button
            type="button"
            className="nav-link p-0 text-[13.5px] font-bold bg-transparent"
            onClick={() => navigate('/multiplayer')}
          >
            Friends
          </button>
        </nav>
        <span className="w-full text-left text-muted font-semibold">
          © 2026 Jade Court · A teaching prototype
        </span>
      </footer>
    </div>
  );
}
