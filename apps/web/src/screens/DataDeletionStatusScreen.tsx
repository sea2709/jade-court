/**
 * Meta data-deletion status page at `/account/data-deletion?code=…`.
 * Display-only — confirmation codes are issued by `POST /api/auth/facebook/data-deletion`.
 */
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  isValidDataDeletionConfirmationCode,
  normalizeDataDeletionConfirmationCode,
} from '../lib/dataDeletionCode';

/** Shows the deletion confirmation code from the status URL Meta receives from our callback. */
export function DataDeletionStatusScreen() {
  const [searchParams] = useSearchParams();
  const rawCode = searchParams.get('code');
  const code = rawCode?.trim() ?? '';
  const valid = code.length > 0 && isValidDataDeletionConfirmationCode(code);
  const displayCode = valid ? normalizeDataDeletionConfirmationCode(code) : null;

  useEffect(() => {
    document.title = 'Data deletion · Jade Court';
  }, []);

  return (
    <div className="page-container-sm py-10">
      <div className="news-panel mx-auto max-w-md border border-line-soft p-8 shadow-md">
        <h1 className="m-0 mb-2 text-center font-display text-2xl font-extrabold">
          Data deletion request
        </h1>
        {valid && displayCode ? (
          <>
            <p className="mb-6 text-center text-sm font-semibold text-muted">
              Your Facebook data deletion request was received. Keep this confirmation code for your
              records.
            </p>
            <p className="m-0 mb-2 text-center text-xs font-bold uppercase tracking-wide text-muted">
              Confirmation code
            </p>
            <p
              className="m-0 break-all rounded-[var(--r-md)] border border-line-soft bg-cream/80 px-4 py-3 text-center font-mono text-sm font-bold text-ink"
              data-testid="data-deletion-confirmation-code"
            >
              {displayCode}
            </p>
          </>
        ) : (
          <div role="alert">
            <p className="mb-4 text-center text-sm font-semibold text-muted">
              This status link is missing a valid confirmation code.
            </p>
            <p className="m-0 text-center text-sm font-bold text-red-deep">
              {rawCode == null || rawCode === ''
                ? 'Open the link from your data deletion confirmation email or from Facebook, which includes a ?code= parameter.'
                : 'The code in this link does not look valid. Use the full status URL returned when your deletion request was submitted.'}
            </p>
          </div>
        )}
        <p className="mt-8 mb-0 text-center text-sm font-semibold text-muted">
          <Link to="/" className="text-jade-deep font-bold no-underline hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
