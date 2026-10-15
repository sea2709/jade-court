# Adversarial review — Issue #51 curator thumbnail upload

## Verdict: FAIL

The upload/serve path blocks unauthenticated writes and path traversal, but the branch has four major correctness/resource-lifecycle failures. In particular, a file at the documented 2 MiB limit is rejected, and cleanup can either delete a thumbnail still referenced by another item or leave unlimited files orphaned on disk.

## Findings

### [MAJOR] A valid file of exactly 2 MiB is always rejected

- **Location:** `apps/server/src/routes/adminNews.ts:90-95`, `apps/server/src/routes/adminNews.ts:112-115`
- **Attack:** Upload a 2,097,152-byte PNG/JPEG/WebP. The route configures Hono's `bodyLimit.maxSize` to 2,097,152 bytes, but that middleware measures the entire multipart body, including boundaries and part headers, before the later code measures the file itself.
- **Evidence:** A direct reproduction using the same Hono middleware and multipart request returned:
  `{"fileBytes":2097152,"status":413,"body":"{\"error\":\"image_too_large\"}"}`
- **Impact:** This violates the `≤2MB` acceptance criterion. The actual accepted file limit is smaller and varies with multipart metadata such as the filename.
- **Suggested fix (backend-developer):** Give the request limit enough bounded multipart overhead while retaining the explicit `bytes.length > NEWS_IMAGE_MAX_BYTES` file check, or parse the upload with a streaming multipart parser that applies the limit to the `file` part. Add boundary tests for exactly 2 MiB and 2 MiB + 1.

### [MAJOR] Uploaded paths are reusable, but deleting either referencing item deletes the shared file

- **Location:** `apps/server/src/news/validate.ts:132-139`, `apps/server/src/routes/adminNews.ts:251-254`, `apps/server/src/routes/adminNews.ts:269-279`
- **Attack:** Upload image `X`; save item A with `imageUrl: X`; create item B with the same path (the Image URL field is editable and server validation accepts any syntactically valid UUID path); then replace A's image or delete A.
- **Impact:** Cleanup unlinks X without checking whether B still references it. Item B remains published with a permanently broken thumbnail. The API neither enforces one-owner-per-upload nor reference-counts shared files.
- **Suggested fix (backend-developer):** Claim uploaded files atomically for one news item and reject reuse, or query/reference-count image paths before unlinking. Do not delete a file while any news document references it.

### [MAJOR] Abandoned uploads are permanent and allow unbounded disk exhaustion

- **Location:** `apps/server/src/routes/adminNews.ts:90-128`, `apps/web/src/screens/AdminNewsScreen.tsx:228-252`, `apps/web/src/screens/AdminNewsScreen.tsx:270-284`, `apps/web/src/screens/AdminNewsScreen.tsx:511-517`
- **Attack:** With one valid admin session, repeatedly upload near-limit files and then click Remove, Fetch details (which replaces the path with `og:image`), Cancel, or submit a create that fails with `409 duplicate`. The server persists each file before any news item owns it, exposes no deletion/claim token for unsaved uploads, and has no quota or upload rate limit.
- **Impact:** Every abandoned request consumes up to roughly 2 MiB forever. A curator mistake, automation loop, or compromised session can fill the server filesystem and take down unrelated writes/services. There is also a UI race: Save, Fetch details, and Cancel remain enabled while `uploadingImage` is true, so an in-flight upload can finish after the form is saved/replaced/closed and become orphaned immediately.
- **Suggested fix (backend-developer + frontend-developer):** Model uploads as temporary objects with expiry and atomic claim-on-save, plus periodic garbage collection and a storage quota/rate limit. The UI should serialize upload with preview/save/cancel and explicitly discard replaced temporary uploads.

### [MAJOR] Concurrent PATCH requests can restore a path after its file was deleted

- **Location:** `apps/server/src/routes/adminNews.ts:217-254`, `apps/server/src/news/mongoStore.ts:223-285`
- **Attack:** Item A currently references X. From two tabs, concurrently PATCH image to Y and PATCH an unrelated field such as title. Both route handlers can read existing X. The image PATCH writes Y and deletes X; the unrelated PATCH carries the fully merged stale `imageUrl: X` into `store.update` and can write X back afterward.
- **Impact:** The final Mongo document can reference X even though X has been unlinked. This is a realistic lost-update race that creates a broken published thumbnail; two image replacements can also orphan the losing new upload.
- **Suggested fix (backend-developer):** Make updates conditional/atomic (revision or compare-and-swap), update only fields actually present in the PATCH, and couple image ownership transition/cleanup to the successful state transition. Re-read current references before unlinking.

### [MINOR] “Magic-byte” validation accepts arbitrary non-images with a short prefix

- **Location:** `apps/server/src/news/imageStorage.ts:40-69`, `apps/server/src/routes/adminNews.ts:112-128`
- **Attack:** Upload arbitrary bytes beginning with `FF D8 FF`, or `RIFF....WEBP`; no JPEG/WebP structure, dimensions, or successful decode is required.
- **Impact:** Wrong-type files pass as images and become permanent public blobs. Fixed image response types plus `X-Content-Type-Options: nosniff` substantially reduce browser script-execution risk, but the endpoint does not actually establish that the upload is a valid JPEG/PNG/WebP and cannot reject malformed/decompression-bomb inputs.
- **Suggested fix (backend-developer):** Decode/inspect with a bounded image library, reject malformed files and unreasonable dimensions/pixel counts, and re-encode if strong content sanitization is required.

## Attacked and held

- Admin middleware executes before the upload handler; a missing bearer session returns 401.
- Public filenames are restricted to UUID basenames plus `jpg|png|webp`; raw and encoded traversal strings do not satisfy the route/storage regex.
- Served uploads use an extension-derived image content type and `X-Content-Type-Options: nosniff`; an attacker cannot choose the response MIME type.
- External `imageUrl` values are restricted to HTTPS and uploaded values to the exact hosted-path shape; `javascript:`, `data:`, arbitrary relative paths, and SVG upload extensions are rejected.
- Client multipart requests preserve the browser-generated boundary and include the admin bearer header.
- Relative hosted paths are prefixed by `VITE_API_URL`; leaving it empty preserves the Vite-proxied `/api/...` path.
- Re-running preview after a completed upload replaces the form value when metadata returns a non-null `og:image`.
- Random UUID filenames and immutable caching avoid overwrite/cache-collision attacks.

## QA hints

1. Upload valid files at 2 MiB - 1, exactly 2 MiB, and 2 MiB + 1; expect 201, 201, and 413 respectively.
2. Save two items with the same uploaded path, then replace/delete one; verify the other image still returns 200.
3. Upload and then Cancel, Remove, fetch preview, trigger duplicate-create failure, and navigate away; inspect `NEWS_IMAGE_DIR` after each case for orphan cleanup.
4. Delay the upload response and click Save/Fetch details/Cancel while it is pending; verify no late response changes hidden form state or leaves a file.
5. From two sessions, race an image replacement against a title-only PATCH and verify the final document never references a deleted file.
6. Upload signature-only fake JPEG/WebP files and high-dimension/decompression-bomb fixtures; require `invalid_image` without excessive CPU/memory.
7. Runtime-check encoded traversal variants (`%2e%2e`, `%2f`, backslash, double encoding), missing files, and valid public access without auth.

## Verification performed

- Targeted server upload/serve/storage tests: 22 passed.
- `pnpm lint`: passed with zero warnings.
- `pnpm format:check`: passed.
- `pnpm typecheck`: passed.
- `pnpm test:coverage`: passed.
- `pnpm test:e2e`: exited successfully with 34 passed; one unrelated multiplayer test failed on its first attempt and passed on retry.
- The edge cases in the findings above are not covered by the existing suites.

## Re-review 2026-10-15 (round 2)

### Verdict: FAIL

The 2 MiB boundary and frontend stale-response fixes hold, and sequential shared-reference cleanup is fixed. However, the production Mongo update still writes a full stale snapshot, so the original concurrent PATCH data-loss finding remains. The new reference-count cleanup also introduces a non-best-effort failure path and retains a count/unlink race.

### Original findings

#### [RESOLVED] Exact 2 MiB uploads were rejected

- `NEWS_IMAGE_UPLOAD_MAX_BODY_BYTES` now allows 16 KiB of multipart overhead while the handler separately enforces the 2 MiB file-byte limit (`apps/server/src/news/imageStorage.ts:9-15`, `apps/server/src/routes/adminNews.ts:132-157`).
- The route test exercises 2 MiB - 1, exactly 2 MiB, and 2 MiB + 1 (`apps/server/src/routes/news.test.ts:301-329`).

#### [PARTIALLY RESOLVED — MAJOR REMAINS] Shared-reference cleanup

- Sequential reuse is handled: cleanup calls `countByImageUrl()` and the new test proves deleting one of two references retains the file (`apps/server/src/routes/adminNews.ts:39-50`, `apps/server/src/routes/news.test.ts:420-457`).
- **Remaining attack:** PATCH item A from X to Y. After `countByImageUrl(X)` returns zero but before `storage.remove(X)` executes, concurrently create or PATCH item B to reference X.
- **Impact:** Item B commits a reference to X, then the first request unlinks X. Reference counting and unlink are separate operations with no claim, lock, or transaction, so the promise “do not delete while referenced” is still false under concurrency.
- **Suggested fix (backend-developer):** Give hosted images explicit ownership/lifecycle records and perform reference transitions atomically, or serialize claim/count/unlink for each image key and re-check immediately under that lock.

#### [ACCEPTED OUT OF SCOPE] Abandoned-upload disk exhaustion

- Per the round-2 scope decision, permanent files from Cancel, Remove, preview replacement, duplicate create, or repeated authenticated uploads remain accepted for issue #51.
- The frontend state race is fixed: save/preview are disabled during upload, Cancel invalidates the upload epoch, and stale completion cannot mutate a later editor (`apps/web/src/screens/AdminNewsScreen.tsx:97-104`, `apps/web/src/screens/AdminNewsScreen.tsx:232-256`, `apps/web/src/components/admin/AdminNewsEditor.tsx:99-104`, `apps/web/src/components/admin/AdminNewsEditor.tsx:266-283`).

#### [NOT RESOLVED — MAJOR] Concurrent PATCH can still restore a deleted image in Mongo

- **Location:** `apps/server/src/news/mongoStore.ts:231-285`, `apps/server/src/routes/adminNews.ts:276-287`
- **Attack:** Item A references X. Start an image PATCH X→Y and an unrelated title PATCH concurrently. Both `MongoNewsStore.update()` calls can read current X at line 231. The image request writes Y and deletes X; the title request then writes its `merged` full snapshot containing stale X.
- **Impact:** The final document references deleted X. Although the route now passes partial fields, Mongo constructs `{ ...current, ...set }` and sends the entire `merged` document in `$set`; this defeats the partial-PATCH fix. The added route test is sequential and uses `MemoryNewsStore`, whose update implementation actually applies fields selectively, so it cannot expose the production race.
- **Suggested fix (backend-developer):** In Mongo, `$set` only changed fields and compute dependent fields without copying unrelated stale values. Add a real concurrent Mongo-store test or conditional revision/CAS test, not a sequential memory-store test.

#### [UNCHANGED — MINOR] Signature-only image validation

- Arbitrary bytes with a JPEG/WebP prefix are still accepted. Fixed response MIME plus `nosniff` limits XSS impact, but malformed files and image bombs remain unvalidated.

### New finding

#### [MAJOR] Cleanup is no longer best-effort and can return failure after committing the mutation

- **Location:** `apps/server/src/routes/adminNews.ts:39-50`, `apps/server/src/routes/adminNews.ts:283-288`, `apps/server/src/routes/adminNews.ts:300-312`
- **Attack:** Let Mongo become unavailable after `store.update()` or `store.remove()` succeeds but before `countByImageUrl()` completes.
- **Impact:** `countByImageUrl()` rejects and the route returns 500 even though the PATCH/DELETE already committed. A DELETE retry then returns 404; a PATCH retry can apply twice or conflict. This violates the acceptance criterion that file cleanup is best-effort.
- **Suggested fix (backend-developer):** Do not let reference-count or unlink failures change the response after the news mutation commits. Catch/log cleanup failures or move cleanup to a durable asynchronous job/outbox.

### Re-review verification

- Server route tests: 19 passed.
- Admin screen tests: 17 passed.
- `pnpm lint`, `pnpm format:check`, and `pnpm typecheck`: passed.

### Round-2 QA hints

1. Against Mongo (not `MemoryNewsStore`), pause two PATCH requests after both have read X; let X→Y commit and clean up before the title-only PATCH writes. Confirm X is not restored.
2. Pause cleanup after a zero reference count, create another item referencing X, then resume unlink. Confirm the new item still serves its image.
3. Inject a `countByImageUrl()` rejection after successful PATCH and DELETE; both API responses should still reflect the committed mutation.
