# Backend report — Issue #51 curator thumbnail upload

## Summary

Server-side curator news thumbnail upload, public serving, validation, and reference-aware cleanup on PATCH/DELETE.

## Re-review round 3 fixes (2026-10-15)

| Finding | Fix |
|---------|-----|
| **Mongo full `$set` snapshot** | `MongoNewsStore.update()` now `$set`s only fields in the patch (+ `updatedAt`, derived `sortAt` when `publishedAt` changes, `publishedOnSiteAt` on first publish). In-memory `after` doc built for return value only. Test: title-only patch must not include `imageUrl` in `$set`. |
| **Cleanup returns 500 after commit** | `tryRemoveUploadedImageIfUnreferenced` wraps count/remove in try/catch + `console.warn`; PATCH/DELETE responses unchanged on cleanup failure. Route test with store that throws on `countByImageUrl`. |
| **Concurrent count/unlink race** | Accepted open item — no locking in #51. |

Prior fixes retained: 2 MiB multipart overhead, `countByImageUrl` for shared paths, partial PATCH body in routes.

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/admin/news/images` | `adminAuth` |
| `GET` | `/api/news/images/:file` | Public |

## Tests (server)

- `mongoStore.test.ts` — partial `$set` on title-only update
- `news.test.ts` — size boundaries, shared path, title-only PATCH, cleanup failure after commit
- `imageStorage.test.ts`, `validate.test.ts`, `memoryStore.test.ts`

## CI (worktree root)

| Command | Result |
|---------|--------|
| `pnpm lint` | **Pass** |
| `pnpm format:check` | **Pass** |
| `pnpm typecheck` | **Pass** |
| `pnpm test:coverage` | **Pass** — server **244** tests |
| `pnpm build` | **Pass** |

## Open risks

- Orphan uploads on disk (by design).
- Concurrent reference-count vs unlink race (accepted).
- Multiple items may share one uploaded path.
