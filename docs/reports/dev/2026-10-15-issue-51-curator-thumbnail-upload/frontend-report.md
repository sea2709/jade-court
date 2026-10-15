# Frontend report — Issue #51 curator thumbnail upload

## Summary

Implemented client API, validation, admin thumbnail UI, and public card image resolution for curator-uploaded news thumbnails. Upload uses multipart `POST /api/admin/news/images` with admin bearer auth (no manual `Content-Type`). Relative stored paths (`/api/news/images/<uuid>.<ext>`) are prefixed with `VITE_API_URL` for `<img src>` while the form and API payloads keep the relative path.

**Adversarial review (UI race):** Thumbnail upload is serialized with the rest of the editor — Save draft, Publish, Fetch details, and Remove are disabled while `uploadingImage` is true; save/preview handlers no-op if upload is in flight. A monotonic **upload epoch** ref invalidates in-flight responses when the user cancels, opens another item, or save succeeds, so late completions cannot mutate hidden or reset form state. **Cancel** stays enabled during upload so curators can leave; cancel bumps the epoch before returning to the list.

## Changes

| Area | Files |
|------|--------|
| API | `apps/web/src/lib/newsApi.ts` — `uploadAdminNewsImage`, `resolveNewsImageUrl`, `NEWS_IMAGE_MAX_BYTES`, `UPLOADED_IMAGE_PATH_RE` |
| Validation | `apps/web/src/lib/newsValidation.ts` — https or uploaded path on publish |
| Admin UI | `AdminNewsEditor.tsx` — 16:9 preview, file input, Remove; disables save/publish/fetch/remove during upload |
| Screen | `AdminNewsScreen.tsx` — upload handler, epoch stale-guard, `invalidateThumbnailUpload()` on cancel/save/navigation |
| Public / list | `NewsCard.tsx`, `AdminNewsItemRow.tsx` — `resolveNewsImageUrl` |
| Tests | `newsApi.test.ts`, `newsValidation.test.ts`, `adminNewsForm.test.ts`, `AdminNewsScreen.test.tsx`, `NewsCard.test.tsx` |
| E2E | `e2e/admin-news.spec.ts` — login, `setInputFiles`, publish, image on `/news` |

`applyPreviewToForm` unchanged: preview `imageUrl` still overwrites the form field when present.

## Server contract (consumed as-is)

- `POST /api/admin/news/images` — field `file`; 201 `{ imageUrl }`; 400 `invalid_image`; 413 `image_too_large`; 401 without session
- `GET /api/news/images/:file` — public serve for relative paths on items

## Tests added/updated

- **newsApi.test.ts** — FormData upload (no `Content-Type`), `resolveNewsImageUrl` with `VITE_API_URL`
- **newsValidation.test.ts** — uploaded path accepted; http external rejected
- **adminNewsForm.test.ts** — preview overwrites uploaded thumbnail
- **AdminNewsScreen.test.tsx** — upload success/error/remove; **in-flight disables save/fetch**; **stale upload ignored after cancel**
- **NewsCard.test.tsx** — relative `imageUrl` on `img` src
- **e2e/admin-news.spec.ts** — full upload → publish → `/news` card `src`

**Browser manual check:** Not run (E2E covers admin upload + public card).

## CI (worktree root, combined backend + frontend)

| Command | Result |
|---------|--------|
| `pnpm lint` | **Pass** (0 warnings) |
| `pnpm format:check` | **Pass** |
| `pnpm typecheck` | **Pass** |
| `pnpm test:coverage` | **Pass** — engine 77; server **242**; web **189** |
| `pnpm build` | **Pass** |
| `pnpm test:e2e` | **Pass** — 34/34 |

## Notes

- E2E stubs admin/news and image bytes because the E2E server has no Mongo news store (`news_storage_unavailable` on unmocked admin routes).
- Orphan files on disk after abandoned uploads remain a **server** lifecycle issue (out of scope for this UI fix).
- Production/dev with `VITE_API_URL` set resolves thumbnails to the API host; same-origin dev leaves relative paths unchanged on `src` (proxy serves `/api`).
