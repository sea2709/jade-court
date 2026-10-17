import { Link, NavLink, Outlet } from 'react-router-dom';
import { Breadcrumb } from './components/Breadcrumb';
import { PUBLIC_NAV } from './lib/publicNav';

function Topbar() {
  return (
    <div className="topbar">
      <Link to="/" className="brand">
        <div className="brand-mark">象</div>
        <div>
          <div className="brand-name">Jade Court</div>
          <div className="brand-sub">Xiangqi</div>
        </div>
      </Link>
      <nav className="nav">
        {PUBLIC_NAV.map(([path, label]) => (
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
  return (
    <div className="app-shell">
      <Topbar />
      <Breadcrumb nav={PUBLIC_NAV} />
      <div className="rise flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-line-soft px-[30px] py-[22px] flex items-center gap-3.5 flex-wrap text-muted text-[13.5px] font-bold">
        <span className="brand-mark w-[30px] h-[30px] rounded-[9px] text-[17px]">象</span>
        <span className="text-ink-soft">Jade Court · Learn &amp; play Xiangqi</span>
        <nav className="ml-auto flex gap-5">
          <Link to="/learn" className="nav-link p-0 text-[13.5px] font-bold">
            Learn
          </Link>
          <Link to="/multiplayer" className="nav-link p-0 text-[13.5px] font-bold">
            Play with Friends
          </Link>
          <Link to="/news" className="nav-link p-0 text-[13.5px] font-bold">
            News
          </Link>
        </nav>
        <span className="w-full text-left text-muted font-semibold">
          © 2026 Jade Court · A teaching prototype
        </span>
      </footer>
    </div>
  );
}
