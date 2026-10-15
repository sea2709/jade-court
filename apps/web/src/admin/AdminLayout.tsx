/**
 * Authenticated shell for `/admin`: session gate, header, section nav, and outlet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminApiError, clearAdminSession, fetchAdminMe, getAdminSession } from '../lib/adminApi';
import { ADMIN_SECTIONS } from './adminSections';
import { AdminSessionContext } from './AdminSessionContext';

const ROBOTS_META_ID = 'admin-robots';

function loginRedirectPath(pathname: string, search: string): string {
  const next = encodeURIComponent(`${pathname}${search}`);
  return `/admin/login?next=${next}`;
}

/** Route layout for authenticated admin pages. */
export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = getAdminSession();

  const [phase, setPhase] = useState<'checking' | 'ready' | 'error'>('checking');
  const [username, setUsername] = useState(session?.username ?? '');
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Admin · Jade Court';
    let meta = document.getElementById(ROBOTS_META_ID) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      meta.id = ROBOTS_META_ID;
      document.head.appendChild(meta);
    }
    meta.content = 'noindex';
    return () => {
      meta?.remove();
    };
  }, []);

  const redirectToLogin = useCallback(() => {
    navigate(loginRedirectPath(location.pathname, location.search), { replace: true });
  }, [location.pathname, location.search, navigate]);

  const onUnauthorized = useCallback(() => {
    clearAdminSession();
    redirectToLogin();
  }, [redirectToLogin]);

  const verifySession = useCallback(async () => {
    if (!getAdminSession()) {
      redirectToLogin();
      return;
    }
    setCheckError(null);
    try {
      const me = await fetchAdminMe();
      setUsername(me.username);
      setPhase('ready');
    } catch (err) {
      if (err instanceof AdminApiError) {
        if (err.code === 'unauthorized' || err.code === 'admin_disabled') {
          clearAdminSession();
          redirectToLogin();
          return;
        }
      }
      setCheckError('Could not verify your session. Check your connection and try again.');
      setPhase('error');
    }
  }, [redirectToLogin]);

  const sessionToken = session?.token;

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await verifySession();
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken, verifySession]);

  const signOut = () => {
    clearAdminSession();
    navigate('/admin/login', { replace: true });
  };

  const retryVerify = () => {
    setPhase('checking');
    void verifySession();
  };

  const contextValue = useMemo(() => ({ username, onUnauthorized }), [username, onUnauthorized]);

  if (!session) {
    return <Navigate to={loginRedirectPath(location.pathname, location.search)} replace />;
  }

  if (phase === 'checking') {
    return (
      <div className="admin-shell min-h-screen bg-cream px-[30px] py-12">
        <p className="text-center font-semibold text-muted">Checking session…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="admin-shell min-h-screen bg-cream px-[30px] py-12">
        <div className="news-panel news-panel-error mx-auto max-w-md px-6 py-10">
          <p className="mb-4 text-sm font-bold text-red-deep" role="alert">
            {checkError}
          </p>
          <button type="button" className="btn btn-primary w-full" onClick={retryVerify}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminSessionContext.Provider value={contextValue}>
      <div className="admin-shell min-h-screen bg-cream text-ink">
        <header className="admin-header border-b border-line-soft bg-cream/90 px-[30px] py-4">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4">
            <Link to="/admin" className="brand no-underline text-ink">
              <div className="brand-mark">象</div>
              <div>
                <div className="brand-name">Jade Court · Admin</div>
              </div>
            </Link>
            <span className="ml-auto text-sm font-bold text-muted">{username}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
          <nav
            className="admin-section-nav mx-auto mt-4 flex max-w-[1180px] flex-wrap gap-2"
            aria-label="Admin sections"
          >
            {ADMIN_SECTIONS.map((section) => (
              <NavLink
                key={section.path}
                to={section.path}
                className={({ isActive }) =>
                  `admin-section-link${isActive ? ' admin-section-link-active' : ''}`
                }
              >
                {section.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-[1180px] px-[30px] py-10">
          <Outlet />
        </main>
      </div>
    </AdminSessionContext.Provider>
  );
}
