/**
 * Standalone token-gated admin UI for curating news at `/admin/news`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminNewsEditor } from '../components/admin/AdminNewsEditor';
import {
  applyPreviewToForm,
  clientValidateDraft,
  clientValidatePublish,
  emptyAdminForm,
  formFromItem,
  PUBLISH_REQUIREMENTS_MESSAGE,
  type AdminNewsFormState,
} from '../lib/adminNewsForm';
import { AdminNewsItemRow } from '../components/admin/AdminNewsItemRow';
import {
  clearStoredAdminToken,
  createAdminNewsItem,
  deleteAdminNewsItem,
  fetchAdminNews,
  getStoredAdminToken,
  NewsApiError,
  patchAdminNewsItem,
  previewAdminNewsUrl,
  setStoredAdminToken,
  verifyAdminToken,
  type AdminNewsItem,
  type DuplicateExisting,
} from '../lib/newsApi';

const ROBOTS_META = 'news-admin-robots';

type AdminView = 'list' | 'create' | 'edit';
type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

function adminErrorMessage(err: unknown): string {
  if (!(err instanceof NewsApiError)) {
    return 'Something went wrong. Try again.';
  }
  switch (err.code) {
    case 'admin_disabled':
      return 'News admin is disabled on this server.';
    case 'news_storage_unavailable':
      return 'News storage is not available right now.';
    case 'rate_limited':
      return 'Too many attempts, try again later';
    case 'duplicate':
      return 'This URL is already in the library.';
    case 'unauthorized':
      return 'Invalid token.';
    default:
      return err.message || 'Request failed.';
  }
}

export function AdminNewsScreen() {
  const [authed, setAuthed] = useState<boolean | null>(() =>
    getStoredAdminToken() ? null : false,
  );
  const [gateToken, setGateToken] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);

  const [items, setItems] = useState<AdminNewsItem[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [view, setView] = useState<AdminView>('list');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminNewsFormState>(emptyAdminForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateOf, setDuplicateOf] = useState<DuplicateExisting | null>(null);
  const [previewFallback, setPreviewFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [listAlert, setListAlert] = useState<string | null>(null);
  const [duplicateLinkId, setDuplicateLinkId] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = 'News admin · Jade Court';
    let meta = document.getElementById(ROBOTS_META) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      meta.id = ROBOTS_META;
      document.head.appendChild(meta);
    }
    meta.content = 'noindex';
    return () => {
      meta?.remove();
    };
  }, []);

  useEffect(() => {
    if (authed !== null) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        await verifyAdminToken();
        if (!cancelled) {
          setAuthed(true);
          setServiceMessage(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NewsApiError && err.code === 'unauthorized') {
          setAuthed(false);
        } else if (
          err instanceof NewsApiError &&
          (err.code === 'admin_disabled' || err.code === 'news_storage_unavailable')
        ) {
          setServiceMessage(adminErrorMessage(err));
          setAuthed(false);
        } else {
          setAuthed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const loadList = useCallback(
    async (opts?: { cursor?: string; append?: boolean }) => {
      setListLoading(true);
      try {
        const res = await fetchAdminNews({
          status: statusFilter,
          q: debouncedSearch || undefined,
          cursor: opts?.cursor,
        });
        setItems((prev) => (opts?.append ? [...prev, ...(res.items ?? [])] : (res.items ?? [])));
        setListCursor(res.nextCursor ?? null);
        setServiceMessage(null);
      } catch (err) {
        if (err instanceof NewsApiError && err.code === 'unauthorized') {
          setAuthed(false);
        } else {
          setServiceMessage(adminErrorMessage(err));
        }
      } finally {
        setListLoading(false);
      }
    },
    [statusFilter, debouncedSearch],
  );

  useEffect(() => {
    if (!authed || view !== 'list') return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setListLoading(true);
      try {
        const res = await fetchAdminNews({
          status: statusFilter,
          q: debouncedSearch || undefined,
        });
        if (!cancelled) {
          setItems(res.items ?? []);
          setListCursor(res.nextCursor ?? null);
          setServiceMessage(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof NewsApiError && err.code === 'unauthorized') {
          setAuthed(false);
        } else {
          setServiceMessage(adminErrorMessage(err));
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, view, statusFilter, debouncedSearch]);

  const unlock = async () => {
    setGateBusy(true);
    setGateError(null);
    setServiceMessage(null);
    const token = gateToken.trim();
    if (!token) {
      setGateError('Enter the admin token.');
      setGateBusy(false);
      return;
    }
    setStoredAdminToken(token);
    try {
      await verifyAdminToken();
      setAuthed(true);
      setGateToken('');
    } catch (err) {
      clearStoredAdminToken();
      setGateError(adminErrorMessage(err));
      if (
        err instanceof NewsApiError &&
        (err.code === 'admin_disabled' || err.code === 'news_storage_unavailable')
      ) {
        setServiceMessage(adminErrorMessage(err));
      }
    } finally {
      setGateBusy(false);
    }
  };

  const signOut = () => {
    clearStoredAdminToken();
    setAuthed(false);
    setView('list');
    setEditId(null);
  };

  const openCreate = () => {
    setForm(emptyAdminForm());
    setFieldErrors({});
    setFormError(null);
    setDuplicateOf(null);
    setPreviewFallback(false);
    setDuplicateLinkId(null);
    setEditId(null);
    setView('create');
  };

  const clearRowError = (id: string) => {
    setRowErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const openEditWithValidationErrors = (
    id: string,
    fields: Record<string, string>,
    banner: string,
  ) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setForm(formFromItem(item));
    setFieldErrors(fields);
    setFormError(banner);
    setDuplicateOf(null);
    setPreviewFallback(false);
    setDuplicateLinkId(null);
    setEditId(id);
    setView('edit');
    clearRowError(id);
    setListAlert(null);
  };

  const openEdit = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setForm(formFromItem(item));
    setFieldErrors({});
    setFormError(null);
    setDuplicateOf(null);
    setPreviewFallback(false);
    setDuplicateLinkId(null);
    setEditId(id);
    setView('edit');
    clearRowError(id);
    setListAlert(null);
  };

  const handleRowActionError = (id: string, err: unknown) => {
    if (err instanceof NewsApiError) {
      if (err.code === 'unauthorized') {
        setAuthed(false);
        return;
      }
      if (err.code === 'validation' && err.fields) {
        openEditWithValidationErrors(id, err.fields, PUBLISH_REQUIREMENTS_MESSAGE);
        return;
      }
      setRowErrors((prev) => ({ ...prev, [id]: adminErrorMessage(err) }));
      return;
    }
    setRowErrors((prev) => ({ ...prev, [id]: 'Something went wrong. Try again.' }));
  };

  const fetchDetails = async () => {
    setFetchingPreview(true);
    setPreviewFallback(false);
    setDuplicateOf(null);
    try {
      const preview = await previewAdminNewsUrl(form.sourceUrl.trim());
      setForm((f) => applyPreviewToForm(f, preview));
      if (preview.duplicateOf) setDuplicateOf(preview.duplicateOf);
    } catch (err) {
      if (err instanceof NewsApiError && err.code === 'unauthorized') {
        setAuthed(false);
        return;
      }
      setPreviewFallback(true);
    } finally {
      setFetchingPreview(false);
    }
  };

  const payloadFromForm = (
    formState: AdminNewsFormState,
    status: 'draft' | 'published' | 'archived',
  ) => ({
    sourceUrl: formState.sourceUrl.trim(),
    title: formState.title.trim(),
    summary: formState.summary.trim(),
    publisher: formState.publisher.trim(),
    publishedAt: formState.publishedAt ? `${formState.publishedAt}T12:00:00.000Z` : undefined,
    imageUrl: formState.imageUrl.trim() || undefined,
    tags: formState.tags,
    status,
  });

  const saveWithStatus = async (status: 'draft' | 'published') => {
    const errors = status === 'draft' ? clientValidateDraft(form) : clientValidatePublish(form);
    setFieldErrors(errors);
    setFormError(null);
    setDuplicateLinkId(null);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const body = payloadFromForm(form, status);
      if (view === 'edit' && editId) {
        await patchAdminNewsItem(editId, body);
      } else {
        await createAdminNewsItem(body);
      }
      setView('list');
      setEditId(null);
      await loadList();
    } catch (err) {
      if (err instanceof NewsApiError) {
        if (err.code === 'unauthorized') {
          setAuthed(false);
          return;
        }
        if (err.fields) setFieldErrors(err.fields);
        if (err.code === 'duplicate' && err.existing) {
          setDuplicateLinkId(err.existing.id);
          setFormError(`Duplicate of "${err.existing.title}" (${err.existing.status}).`);
        } else {
          setFormError(adminErrorMessage(err));
        }
      } else {
        setFormError('Something went wrong.');
      }
    } finally {
      setSaving(false);
    }
  };

  const publishFromRow = async (id: string) => {
    if (rowBusy) return;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    clearRowError(id);
    setListAlert(null);

    const validationErrors = clientValidatePublish(formFromItem(item));
    if (Object.keys(validationErrors).length > 0) {
      openEditWithValidationErrors(id, validationErrors, PUBLISH_REQUIREMENTS_MESSAGE);
      return;
    }

    setRowBusy(id);
    try {
      await patchAdminNewsItem(id, { status: 'published' });
      clearRowError(id);
      await loadList();
    } catch (err) {
      handleRowActionError(id, err);
    } finally {
      setRowBusy(null);
    }
  };

  const patchStatus = async (id: string, status: AdminNewsItem['status']) => {
    if (status === 'published') {
      await publishFromRow(id);
      return;
    }
    if (rowBusy) return;
    clearRowError(id);
    setListAlert(null);
    setRowBusy(id);
    try {
      await patchAdminNewsItem(id, { status });
      clearRowError(id);
      await loadList();
    } catch (err) {
      handleRowActionError(id, err);
    } finally {
      setRowBusy(null);
    }
  };

  const confirmDelete = async (id: string) => {
    if (!window.confirm('Delete this item permanently?')) return;
    if (rowBusy) return;
    clearRowError(id);
    setListAlert(null);
    setRowBusy(id);
    try {
      await deleteAdminNewsItem(id);
      clearRowError(id);
      await loadList();
    } catch (err) {
      handleRowActionError(id, err);
    } finally {
      setRowBusy(null);
    }
  };

  if (authed === null) {
    return (
      <div className="min-h-screen bg-cream px-[30px] py-12">
        <p className="text-center font-semibold text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-line-soft bg-cream/90 px-[30px] py-4">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-4">
          <Link to="/" className="brand no-underline text-ink">
            <div className="brand-mark">象</div>
            <div>
              <div className="brand-name">Jade Court · News admin</div>
            </div>
          </Link>
          {authed ? (
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-[30px] py-10">
        {serviceMessage && !authed ? (
          <p className="mb-6 text-center font-bold text-red-deep" role="alert">
            {serviceMessage}
          </p>
        ) : null}

        {listAlert && authed ? (
          <p
            className="mb-4 rounded-xl border border-red-soft bg-red-soft/30 px-4 py-3 text-sm font-bold text-red-deep"
            role="alert"
          >
            {listAlert}
          </p>
        ) : null}

        {!authed ? (
          <div className="news-panel mx-auto max-w-md p-8">
            <h1 className="m-0 mb-4 text-center font-display text-2xl font-extrabold">
              Unlock news admin
            </h1>
            <label
              htmlFor="news-admin-token"
              className="mb-4 flex flex-col gap-2 text-sm font-bold text-ink-soft"
            >
              Admin token
              <input
                id="news-admin-token"
                type="password"
                className="room-link-input w-full text-left font-body"
                value={gateToken}
                onChange={(e) => setGateToken(e.target.value)}
                autoComplete="off"
              />
            </label>
            {gateError ? (
              <p className="mb-3 text-sm font-bold text-red-deep" role="alert">
                {gateError}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={gateBusy}
              onClick={() => void unlock()}
            >
              Unlock
            </button>
          </div>
        ) : view === 'list' ? (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
                {(['all', 'draft', 'published', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`btn btn-ghost btn-sm capitalize${statusFilter === s ? ' bg-ink text-cream' : ''}`}
                    aria-pressed={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Search…"
                className="room-link-input min-w-[200px] flex-1 text-left font-body"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search news"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                Add item
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <AdminNewsItemRow
                  key={item.id}
                  item={item}
                  busyId={rowBusy}
                  rowError={rowErrors[item.id]}
                  onEditFromRowError={openEdit}
                  onEdit={openEdit}
                  onPublish={(id) => void publishFromRow(id)}
                  onUnpublish={(id) => void patchStatus(id, 'draft')}
                  onArchive={(id) => void patchStatus(id, 'archived')}
                  onRepublish={(id) => void publishFromRow(id)}
                  onDelete={(id) => void confirmDelete(id)}
                />
              ))}
            </div>

            {listCursor ? (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={listLoading}
                  onClick={() => void loadList({ cursor: listCursor, append: true })}
                >
                  {listLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {formError && duplicateLinkId ? (
              <p className="mb-4 font-bold text-red-deep" role="alert">
                {formError}{' '}
                <button
                  type="button"
                  className="text-jade-deep underline"
                  onClick={() => openEdit(duplicateLinkId)}
                >
                  Edit existing item
                </button>
              </p>
            ) : null}
            <AdminNewsEditor
              mode={view === 'create' ? 'create' : 'edit'}
              form={form}
              fieldErrors={fieldErrors}
              duplicateOf={duplicateOf}
              previewFallback={previewFallback}
              formError={duplicateLinkId ? null : formError}
              saving={saving}
              fetchingPreview={fetchingPreview}
              onChange={setForm}
              onFetchDetails={() => void fetchDetails()}
              onOpenDuplicate={openEdit}
              onSaveDraft={() => void saveWithStatus('draft')}
              onPublish={() => void saveWithStatus('published')}
              onCancel={() => {
                setView('list');
                setEditId(null);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
