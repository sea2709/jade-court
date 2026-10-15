/**
 * News curation UI for admins at `/admin/news`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSession } from '../admin/AdminSessionContext';
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
  createAdminNewsItem,
  deleteAdminNewsItem,
  fetchAdminNews,
  NewsApiError,
  patchAdminNewsItem,
  previewAdminNewsUrl,
  NEWS_IMAGE_MAX_BYTES,
  uploadAdminNewsImage,
  type AdminNewsItem,
  type DuplicateExisting,
} from '../lib/newsApi';

type AdminView = 'list' | 'create' | 'edit';
type StatusFilter = 'all' | 'draft' | 'published' | 'archived';

function imageUploadErrorMessage(err: unknown): string {
  if (!(err instanceof NewsApiError)) {
    return 'Upload failed. Try again.';
  }
  switch (err.code) {
    case 'invalid_image':
      return 'Invalid image — use JPEG, PNG, or WebP.';
    case 'image_too_large':
      return 'Image must be 2MB or smaller.';
    case 'unauthorized':
      return 'Session expired.';
    default:
      return adminErrorMessage(err);
  }
}

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
      return 'Session expired.';
    default:
      return err.message || 'Request failed.';
  }
}

/** Admin news list and editor (requires `AdminLayout` session). */
export function AdminNewsScreen() {
  const { onUnauthorized } = useAdminSession();

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
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped when the editor context changes so in-flight uploads cannot mutate stale form state. */
  const thumbnailUploadEpochRef = useRef(0);

  const invalidateThumbnailUpload = useCallback(() => {
    thumbnailUploadEpochRef.current += 1;
    setUploadingImage(false);
    setImageUploadError(null);
  }, []);

  useEffect(() => {
    document.title = 'News · Jade Court Admin';
  }, []);

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
          onUnauthorized();
        } else {
          setServiceMessage(adminErrorMessage(err));
        }
      } finally {
        setListLoading(false);
      }
    },
    [statusFilter, debouncedSearch, onUnauthorized],
  );

  useEffect(() => {
    if (view !== 'list') return;
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
          onUnauthorized();
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
  }, [view, statusFilter, debouncedSearch, onUnauthorized]);

  const openCreate = () => {
    setForm(emptyAdminForm());
    setFieldErrors({});
    setFormError(null);
    setDuplicateOf(null);
    setPreviewFallback(false);
    setDuplicateLinkId(null);
    setEditId(null);
    invalidateThumbnailUpload();
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
    invalidateThumbnailUpload();
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
    invalidateThumbnailUpload();
    setView('edit');
    clearRowError(id);
    setListAlert(null);
  };

  const handleThumbnailUpload = async (file: File) => {
    if (file.size > NEWS_IMAGE_MAX_BYTES) {
      setImageUploadError('Image must be 2MB or smaller.');
      return;
    }
    const epoch = ++thumbnailUploadEpochRef.current;
    setImageUploadError(null);
    setUploadingImage(true);
    try {
      const { imageUrl } = await uploadAdminNewsImage(file);
      if (epoch !== thumbnailUploadEpochRef.current) return;
      setForm((f) => ({ ...f, imageUrl }));
    } catch (err) {
      if (epoch !== thumbnailUploadEpochRef.current) return;
      if (err instanceof NewsApiError && err.code === 'unauthorized') {
        onUnauthorized();
        return;
      }
      setImageUploadError(imageUploadErrorMessage(err));
    } finally {
      if (epoch === thumbnailUploadEpochRef.current) {
        setUploadingImage(false);
      }
    }
  };

  const handleRemoveThumbnail = () => {
    setImageUploadError(null);
    setForm((f) => ({ ...f, imageUrl: '' }));
  };

  const handleRowActionError = (id: string, err: unknown) => {
    if (err instanceof NewsApiError) {
      if (err.code === 'unauthorized') {
        onUnauthorized();
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
    if (uploadingImage) return;
    setFetchingPreview(true);
    setPreviewFallback(false);
    setDuplicateOf(null);
    try {
      const preview = await previewAdminNewsUrl(form.sourceUrl.trim());
      setForm((f) => applyPreviewToForm(f, preview));
      if (preview.duplicateOf) setDuplicateOf(preview.duplicateOf);
    } catch (err) {
      if (err instanceof NewsApiError && err.code === 'unauthorized') {
        onUnauthorized();
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
    if (uploadingImage) return;
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
      invalidateThumbnailUpload();
      setView('list');
      setEditId(null);
      await loadList();
    } catch (err) {
      if (err instanceof NewsApiError) {
        if (err.code === 'unauthorized') {
          onUnauthorized();
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

  return (
    <div>
      {serviceMessage ? (
        <p className="mb-6 text-center font-bold text-red-deep" role="alert">
          {serviceMessage}
        </p>
      ) : null}

      {listAlert ? (
        <p
          className="mb-4 rounded-xl border border-red-soft bg-red-soft/30 px-4 py-3 text-sm font-bold text-red-deep"
          role="alert"
        >
          {listAlert}
        </p>
      ) : null}

      {view === 'list' ? (
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
            uploadingImage={uploadingImage}
            imageUploadError={imageUploadError}
            onChange={setForm}
            onUploadThumbnail={(file) => void handleThumbnailUpload(file)}
            onRemoveThumbnail={handleRemoveThumbnail}
            onFetchDetails={() => void fetchDetails()}
            onOpenDuplicate={openEdit}
            onSaveDraft={() => void saveWithStatus('draft')}
            onPublish={() => void saveWithStatus('published')}
            onCancel={() => {
              invalidateThumbnailUpload();
              setView('list');
              setEditId(null);
            }}
          />
        </>
      )}
    </div>
  );
}
