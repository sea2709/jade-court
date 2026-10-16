/**
 * Public-app breadcrumb below the topbar: Home / current section from the shared NAV list.
 */
import { Link, useLocation } from 'react-router-dom';

/** One top-nav entry: route path and display label (same shape as `NAV` in App.tsx). */
export type BreadcrumbNavItem = readonly [path: string, label: string];

export type BreadcrumbProps = {
  /** Top-nav routes and labels; must include `['/', 'Home']` and section paths. */
  nav: readonly BreadcrumbNavItem[];
};

/**
 * Renders a two-level trail (Home / section) for known public routes, or nothing on Home
 * and unknown paths. Query strings on the URL are ignored; only `pathname` is matched.
 */
export function Breadcrumb({ nav }: BreadcrumbProps) {
  const { pathname } = useLocation();

  if (pathname === '/') {
    return null;
  }

  const section = nav.find(([path]) => path === pathname);
  if (!section) {
    return null;
  }

  const homeEntry = nav.find(([path]) => path === '/');
  const homeLabel = homeEntry?.[1] ?? 'Home';
  const sectionLabel = section[1];

  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol className="breadcrumb-list">
        <li>
          <Link to="/" className="breadcrumb-link">
            {homeLabel}
          </Link>
        </li>
        <li className="breadcrumb-sep" aria-hidden="true">
          /
        </li>
        <li aria-current="page" className="breadcrumb-current">
          {sectionLabel}
        </li>
      </ol>
    </nav>
  );
}
