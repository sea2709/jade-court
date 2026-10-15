/**
 * Single row in the admin news list with status and actions.
 */
import type { AdminNewsItem } from '../../lib/newsApi';
import { resolveNewsImageUrl } from '../../lib/newsApi';

const STATUS_CLASS: Record<AdminNewsItem['status'], string> = {
  draft: 'pill pill-gold',
  published: 'pill pill-jade',
  archived: 'pill bg-[#ebe6dc] text-muted',
};

export interface AdminNewsItemRowProps {
  item: AdminNewsItem;
  onEdit: (id: string) => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onRepublish: (id: string) => void;
  onDelete: (id: string) => void;
  busyId: string | null;
  rowError?: string | null;
  onEditFromRowError?: (id: string) => void;
}

export function AdminNewsItemRow({
  item,
  onEdit,
  onPublish,
  onUnpublish,
  onArchive,
  onRepublish,
  onDelete,
  busyId,
  rowError,
  onEditFromRowError,
}: AdminNewsItemRowProps) {
  const busy = busyId === item.id;
  const title = item.title.trim() || 'Untitled draft';
  const thumbSrc = resolveNewsImageUrl(item.imageUrl);

  return (
    <article className="card flex flex-wrap items-center gap-4 p-4">
      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-jade">
        {thumbSrc ? (
          <img
            src={thumbSrc}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="grid h-full w-full place-items-center font-piece text-2xl font-black text-white/90">
            象
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="m-0 truncate font-display text-lg font-extrabold">{title}</h3>
        <p className="m-0 text-sm font-semibold text-muted">
          {item.publisher.trim() || '—'} · {item.sourceDomain}
        </p>
      </div>
      <span className={STATUS_CLASS[item.status]}>{item.status}</span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onEdit(item.id)}
        >
          Edit
        </button>
        {item.status === 'draft' ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onPublish(item.id)}
          >
            Publish
          </button>
        ) : null}
        {item.status === 'published' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => onUnpublish(item.id)}
          >
            Unpublish
          </button>
        ) : null}
        {item.status !== 'archived' ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => onArchive(item.id)}
          >
            Archive
          </button>
        ) : null}
        {item.status === 'archived' ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => onRepublish(item.id)}
            >
              Re-publish
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => onDelete(item.id)}
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
      {rowError ? (
        <div
          className="w-full rounded-xl border border-red-soft bg-red-soft/30 px-4 py-3 text-sm font-bold text-red-deep"
          role="alert"
        >
          <p className="m-0">{rowError}</p>
          {onEditFromRowError ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2"
              onClick={() => onEditFromRowError(item.id)}
            >
              Edit
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
