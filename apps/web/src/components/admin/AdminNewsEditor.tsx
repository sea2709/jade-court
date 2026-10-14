/**
 * Create/edit form for a curated news item in the admin UI.
 */
import type { DuplicateExisting } from '../../lib/newsApi';
import type { AdminNewsFormState } from '../../lib/adminNewsForm';
import { NEWS_TAG_OPTIONS } from '../../lib/newsValidation';

export type { AdminNewsFormState };

export interface AdminNewsEditorProps {
  mode: 'create' | 'edit';
  form: AdminNewsFormState;
  fieldErrors: Record<string, string>;
  duplicateOf: DuplicateExisting | null;
  previewFallback: boolean;
  formError: string | null;
  saving: boolean;
  fetchingPreview: boolean;
  onChange: (next: AdminNewsFormState) => void;
  onFetchDetails: () => void;
  onOpenDuplicate: (id: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onCancel: () => void;
}

export function AdminNewsEditor({
  mode,
  form,
  fieldErrors,
  duplicateOf,
  previewFallback,
  formError,
  saving,
  fetchingPreview,
  onChange,
  onFetchDetails,
  onOpenDuplicate,
  onSaveDraft,
  onPublish,
  onCancel,
}: AdminNewsEditorProps) {
  const setField = <K extends keyof AdminNewsFormState>(key: K, value: AdminNewsFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  const toggleTag = (tag: string) => {
    const tags = form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag];
    setField('tags', tags);
  };

  const summaryHint = "Write it in your own words — don't paste article text";
  const summaryLen = form.summary.length;

  return (
    <div className="card p-6">
      <h2 className="m-0 mb-5 font-display text-2xl font-extrabold">
        {mode === 'create' ? 'Add news item' : 'Edit news item'}
      </h2>

      {formError ? (
        <p
          className="mb-4 rounded-xl border border-red-soft bg-red-soft/40 px-4 py-3 text-sm font-bold text-red-deep"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <label htmlFor="news-admin-source-url" className="text-sm font-bold text-ink-soft">
            Source URL
          </label>
          <input
            id="news-admin-source-url"
            type="url"
            className="room-link-input w-full text-left font-body"
            value={form.sourceUrl}
            onChange={(e) => setField('sourceUrl', e.target.value)}
            aria-invalid={fieldErrors.sourceUrl ? true : undefined}
            aria-describedby={fieldErrors.sourceUrl ? 'news-admin-source-url-error' : undefined}
          />
          {fieldErrors.sourceUrl ? (
            <span id="news-admin-source-url-error" className="text-sm font-bold text-red-deep">
              {fieldErrors.sourceUrl}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm self-end"
          disabled={saving || fetchingPreview}
          onClick={onFetchDetails}
        >
          Fetch details
        </button>
      </div>

      {previewFallback ? (
        <p className="mb-4 text-sm font-semibold text-gold-deep">
          Couldn&apos;t fetch details — fill them in manually
        </p>
      ) : null}

      {duplicateOf ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#fbeac4] px-4 py-3 text-sm font-bold text-gold-deep">
          <span>
            This URL may duplicate &quot;{duplicateOf.title}&quot; ({duplicateOf.status}).
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onOpenDuplicate(duplicateOf.id)}
          >
            Open existing
          </button>
        </div>
      ) : null}

      <div className="grid gap-4">
        <label className="flex flex-col gap-1 text-sm font-bold text-ink-soft">
          Title
          <input
            className="room-link-input w-full text-left font-body"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
          />
          {fieldErrors.title ? <span className="text-red-deep">{fieldErrors.title}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm font-bold text-ink-soft">
          Summary
          <span className="text-xs font-semibold text-muted">{summaryHint}</span>
          <textarea
            className="room-link-input min-h-[100px] w-full resize-y text-left font-body"
            value={form.summary}
            onChange={(e) => setField('summary', e.target.value)}
            aria-invalid={fieldErrors.summary ? true : undefined}
          />
          <span className="text-xs font-semibold text-muted">{summaryLen}/300</span>
          {fieldErrors.summary ? (
            <span className="text-red-deep">{fieldErrors.summary}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm font-bold text-ink-soft">
          Publisher
          <input
            className="room-link-input w-full text-left font-body"
            value={form.publisher}
            onChange={(e) => setField('publisher', e.target.value)}
            aria-invalid={fieldErrors.publisher ? true : undefined}
          />
          {fieldErrors.publisher ? (
            <span className="text-red-deep">{fieldErrors.publisher}</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-sm font-bold text-ink-soft">
          Published date
          <input
            type="date"
            className="room-link-input w-full max-w-xs text-left font-body"
            value={form.publishedAt}
            onChange={(e) => setField('publishedAt', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-bold text-ink-soft">
          Image URL (https)
          <input
            type="url"
            className="room-link-input w-full text-left font-body"
            value={form.imageUrl}
            onChange={(e) => setField('imageUrl', e.target.value)}
            aria-invalid={fieldErrors.imageUrl ? true : undefined}
          />
          {fieldErrors.imageUrl ? (
            <span className="text-red-deep">{fieldErrors.imageUrl}</span>
          ) : null}
        </label>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-bold text-ink-soft">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {NEWS_TAG_OPTIONS.map((tag) => (
              <label key={tag} className="inline-flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.tags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {tag}
              </label>
            ))}
          </div>
          {fieldErrors.tags ? <span className="text-red-deep">{fieldErrors.tags}</span> : null}
        </fieldset>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onSaveDraft}>
          Save draft
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={onPublish}>
          Publish
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
