/**
 * Admin home dashboard with links to each admin section.
 */
import { Link } from 'react-router-dom';
import { ADMIN_SECTIONS } from '../admin/adminSections';

/** Index page for `/admin` listing available admin sections. */
export function AdminDashboardScreen() {
  return (
    <div>
      <h1 className="m-0 mb-2 font-display text-3xl font-extrabold">Dashboard</h1>
      <p className="mb-8 text-base font-semibold text-ink-soft">
        Choose a section to manage Jade Court content.
      </p>
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.path}>
            <Link
              to={section.path}
              className="flex flex-col gap-1 rounded-[20px] border border-line-soft bg-paper px-6 py-5 no-underline text-ink shadow-sm transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="font-display text-xl font-extrabold">{section.label}</span>
              <span className="text-sm font-semibold text-jade-deep">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
