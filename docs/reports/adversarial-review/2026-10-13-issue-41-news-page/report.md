# Adversarial review — Issue #41 curated Xiangqi news

**Date:** 2026-10-13  
**Branch:** `issue-41-news-page` (uncommitted worktree)  
**Reviewer:** adversarial-reviewer subagent

## Verdict

**APPROVE** (as of re-review 2026-10-13) — Blocker and major findings from the initial review are addressed. Two **minor** items from the first pass remain open by design (findings 4–5). Initial review verdict was **BLOCK**; see [Re-review](#re-review-2026-10-13) below.

---

## Findings

### 1. DNS rebinding bypass on metadata preview (SSRF)

|                   |                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **blocker**                                                                                                                                                                                                                                                                                                                                                                                           |
| **Location**      | `apps/server/src/news/metadata.ts:73-93`, `229-238`, `268`                                                                                                                                                                                                                                                                                                                                            |
| **Attack**        | Curator (or attacker with `ADMIN_TOKEN`) runs `POST /api/admin/news/preview` with `{ "url": "https://attacker.example/article" }`. Attacker DNS returns a public IP (e.g. `8.8.8.8`) when `assertHostAllowed` calls `resolve4`/`resolve6`, then returns `169.254.169.254` or `10.x` on the **second** resolution when Node’s `fetch` connects. TTL can be 0–1s; no pinning between check and connect. |
| **Impact**        | Server-side GET to cloud metadata, internal HTTP services, or other addresses that would have been blocked by the pre-fetch DNS check. Violates acceptance “Preview refuses … private ranges” under realistic rebinding, not only static DNS answers.                                                                                                                                                 |
| **Evidence**      | `assertHostAllowed(current.hostname)` runs before `fetch(current.toString(), …)`; `fetch` uses the hostname string and the runtime resolver, not the IPs validated in the loop. Redirect hops re-check DNS but the same TOCTOU applies on every hop.                                                                                                                                                  |
| **Suggested fix** | Pin connections to resolved addresses (custom Undici agent / `dns.lookup` with `verbatim`, connect to IP, set `Host` header), or use a dedicated metadata-fetch library that enforces pinned IPs; re-validate after connect where possible. **Owner:** `backend-developer`.                                                                                                                           |

---

### 2. Five-second timeout does not cover response body reads

|                   |                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **major**                                                                                                                                                                                                                                                                                                 |
| **Location**      | `apps/server/src/news/metadata.ts:233-252`, `274-276`, `175-207`                                                                                                                                                                                                                                          |
| **Attack**        | Target (or MITM) responds quickly with `200` and `Content-Type: text/html`, then dribbles body chunks slowly (below 1 MB cap). The abort timer on the initial `fetch` is cleared in `finally` once headers arrive; `readHtmlWithCap` uses `controller2` which is **never** tied to `METADATA_TIMEOUT_MS`. |
| **Impact**        | A single preview request can hold a server worker until the client/parser gives up (no upper bound), enabling slowloris-style DoS against the Hono process. Requires a valid admin token to hit `/preview`, but one compromised/leaked token or insider can tie up workers indefinitely.                  |
| **Evidence**      | `clearTimeout(timer)` runs when `fetch` resolves; body consumption is a separate loop with only byte-cap enforcement, no wall-clock abort.                                                                                                                                                                |
| **Suggested fix** | Reuse one `AbortController` for the whole operation (headers + body), or arm `controller2` with the same 5s (or remaining) deadline before `readHtmlWithCap`. **Owner:** `backend-developer`.                                                                                                             |

---

### 3. Admin list “Publish” / status changes swallow validation errors

|                   |                                                                                                                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **major**                                                                                                                                                                                                                                                                                         |
| **Location**      | `apps/web/src/screens/AdminNewsScreen.tsx:330-339`                                                                                                                                                                                                                                                |
| **Attack**        | Create a draft with only `sourceUrl` (allowed). From the list row, click **Publish** → `patchAdminNewsItem(id, { status: 'published' })`. Server returns **400** `{ error: 'validation', fields: … }` (covered in `apps/server/src/routes/news.test.ts:159-168`).                                 |
| **Impact**        | UI clears `rowBusy` and leaves the row as **draft** with no toast, banner, or field errors. Curator may believe the story is live; public feed stays empty for that item. Same pattern for **Re-publish** on archived rows that no longer satisfy publish rules if fields were edited down in DB. |
| **Evidence**      | `patchStatus` `catch` only handles `unauthorized`; validation and other errors are ignored.                                                                                                                                                                                                       |
| **Suggested fix** | Surface `NewsApiError` `fields` / message via `setServiceMessage` or inline row error; optionally open the editor on failed publish. **Owner:** `frontend-developer`.                                                                                                                             |

---

### 4. Duplicate guard: `www` and `http`/`https` variants

|                   |                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**      | **minor**                                                                                                                                                                                                                |
| **Location**      | `apps/server/src/news/normalizeUrl.ts:15-61`                                                                                                                                                                             |
| **Attack**        | Publish `https://example.com/story`, then add `https://www.example.com/story` or `http://example.com/story`. Normalization lowercases host and strips tracking params but does **not** strip `www.` or normalize scheme. |
| **Impact**        | Same real-world article can appear twice in the public feed; preview `duplicateOf` miss until second publish attempt returns 409.                                                                                        |
| **Suggested fix** | Optional P0: strip leading `www.` and/or canonicalize http→https when comparing duplicates (document if intentional). **Owner:** `backend-developer`.                                                                    |

---

### 5. Shared rate-limit bucket when remote address is missing

|                   |                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **minor**                                                                                                                                                                                                 |
| **Location**      | `apps/server/src/middleware/adminAuth.ts:10`, `16-22`, `59-63`                                                                                                                                            |
| **Attack**        | Many clients where `getConnInfo(c).remote.address` is undefined share key `unknown-remote`. One actor’s failed attempts rate-limit all others on that key.                                                |
| **Impact**        | Legitimate admin locked out (429) behind certain proxies or runtimes; also easier cross-customer noise in misconfigured deploys. Spec accepts ignoring `X-Forwarded-For`, but fallback collapse is harsh. |
| **Suggested fix** | Document requirement for reliable `remote.address`; consider separate cap per connection id or require reverse-proxy config. **Owner:** `backend-developer`.                                              |

---

### 6. Public API 401 clears admin session token

|                   |                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **minor**                                                                                                                                                                                                                     |
| **Location**      | `apps/web/src/lib/newsApi.ts:99-103`                                                                                                                                                                                          |
| **Attack**        | If any caller using `newsRequest` gets a **401** (misconfigured route, future middleware, or accidental auth on `GET /api/news`), `clearStoredAdminToken()` runs. Today public news returns 200 without auth; risk is latent. |
| **Impact**        | Surprising sign-out from `/admin/news` while browsing `/news`; not a token leak.                                                                                                                                              |
| **Suggested fix** | Only clear token when `init.admin === true` or path starts with `/api/admin/`. **Owner:** `frontend-developer`.                                                                                                               |

---

### 7. CGNAT / shared address space not blocked in IP guard

|                   |                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **minor**                                                                                                                                           |
| **Location**      | `apps/server/src/news/metadata.ts:44-71`                                                                                                            |
| **Attack**        | Hostname resolves to `100.64.0.0/10` (RFC 6598) or other non-RFC1918 “special” ranges not listed.                                                   |
| **Impact**        | Preview fetch may reach addresses some providers treat as internal; lower risk than 169.254.169.254 (which **is** blocked).                         |
| **Suggested fix** | Extend `isBlockedIpAddress` with `100.64.0.0/10` and other bogon lists if parity with cloud SSRF guides is desired. **Owner:** `backend-developer`. |

---

## Attacked and held

- **Public field leakage:** `GET /api/news` maps through `toPublicNewsItem` only; route tests assert no `normalizedUrl` / `status` on public items (`apps/server/src/routes/news.test.ts:61-84`).
- **Draft vs publish validation:** `validateCreateInput` / `validateUpdateInput` apply full fields only when resulting status is `published`; PATCH `{ status: 'published' }` on URL-only draft returns 400 (route test).
- **Duplicate normalization:** `utm_*`, `fbclid`, fragment, trailing slash, default ports — 409 on create (route test).
- **Redirect SSRF (static DNS):** Second hop resolving to private IP rejected when mock DNS returns `10.0.0.5` (`metadata.test.ts:103-111`).
- **Non-http(s), bad ports, localhost hostname, metadata IP:** Covered by unit tests and `assertHostAllowed`.
- **Odd IPv4 literals:** Node normalizes `http://2130706433/` → hostname `127.0.0.1`; resolution path blocks loopback (verified via URL parser behavior in Node 24).
- **NoSQL injection:** Admin `status` whitelisted; `q` passed through `escapeRegex`; ids converted via `ObjectId` / UUID map.
- **XSS on public cards:** Titles/summaries rendered as React text; outbound links use `rel="noopener noreferrer"` (`NewsCard.tsx:42-46`).
- **Stored `javascript:` / `data:` URLs:** `isHttpOrHttpsUrl` / `isHttpsUrl` on write paths.
- **Admin auth:** `timingSafeEqual` on equal-length tokens; 503 when `ADMIN_TOKEN` unset; 429 after 10 failures per remote key (test); `Cache-Control: no-store` on admin routes.
- **No MongoDB URI:** Public feed returns empty list, not error (`createApp` + route test).
- **Admin token in web bundle:** No `ADMIN_TOKEN` string in `apps/web` sources (only sessionStorage key constant).
- **Admin list stale fetch:** `cancelled` flag on filter/search effect (`AdminNewsScreen.tsx:165-196`).
- **Cursor tampering:** Malformed cursor → 400 `invalid_cursor`.

---

## QA hints (runtime)

1. **Preview SSRF (lab):** With a test domain you control, configure DNS to alternate public → `127.0.0.1` or RFC1918 between two quick lookups; run preview and packet-capture server egress. Expectation after fix: no connect to private IPs.
2. **Slow body:** Mock site returns headers immediately, body sleeps 30s between chunks; preview should fail or abort within ~5s total.
3. **List publish UX:** Draft with URL only → list **Publish** → expect visible error; after fix, item must not appear published without confirmation.
4. **Duplicate:** Publish `https://a.com/x` and `https://www.a.com/x` — note whether product allows two cards (current behavior).
5. **Rate limit:** Ten bad Bearer attempts from same IP → 401; eleventh → 429; valid token before reset → still 429 until window expires.
6. **Public feed without DB:** Unset `MONGODB_URI`, open `/news` → empty state, not error panel.
7. **Regression:** Card click opens exact `sourceUrl` in new tab with `noopener` (E2E covers stubbed flow; spot-check real item).
8. **Mongo down with URI set:** Start server with invalid `MONGODB_URI` and hit `/api/news` — observe 500 vs empty (operational gap; not in P0 acceptance but worth noting).

---

## Re-review 2026-10-13

### Verdict

**APPROVE** — No remaining **blocker** or **major** findings. Findings **4** (www/http duplicate normalization) and **5** (shared `unknown-remote` rate-limit bucket) remain accepted **minor** backlog.

### Fix verification

| Original                                | Status    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 DNS rebinding (blocker)**           | **Fixed** | `resolveValidatedAddresses` validates all A/AAAA answers; `createPinnedConnectLookup` caches the first validated set and ignores later `resolve4`/`resolve6` changes (`metadata.test.ts:121-135`). Each redirect hop builds a **new** `Agent` with fresh resolution + pin (`metadata.ts:361-387`). `Host` + TLS `servername` stay on the URL hostname while TCP targets pinned IPs.                                           |
| **2 Body timeout (major)**              | **Fixed** | Single `AbortController` + `deadlineTimer` for the whole `fetchPageMetadata` call (`355-356`, `412-413`). `readHtmlWithCap` races `reader.read()` via `awaitWithAbort` (`309-314`, `279-294`). Fake-timer test confirms slow body aborts within 200ms budget (`metadata.test.ts:225-246`).                                                                                                                                    |
| **3 Row Publish UX (major)**            | **Fixed** | `publishFromRow` runs `clientValidatePublish` before PATCH; failures open editor with banner + fields (`379-391`). Server `validation` → `handleRowActionError` → `openEditWithValidationErrors` (`291-299`). Other errors set per-row `rowErrors` + `role="alert"` (`AdminNewsItemRow.tsx:123-138`). Tests cover client block (no PATCH), server 400, row alert, and in-flight disable (`AdminNewsScreen.test.tsx:222-290`). |
| **6 Token clear on public 401 (minor)** | **Fixed** | `throwFromResponse(..., { admin: init?.admin })` (`newsApi.ts:99-107`, `151`). Test: `fetchPublicNews` 401 leaves sessionStorage token (`newsApi.test.ts:49-54`).                                                                                                                                                                                                                                                             |
| **7 CGNAT / bogon ranges (minor)**      | **Fixed** | Expanded `blockedIpv4` / `blockedIpv6` + table tests (`metadata.ts:57-87`, `metadata.test.ts:74-102`).                                                                                                                                                                                                                                                                                                                        |

### Attacks on the fixes (no new blockers/majors)

**Pinned lookup bypass**

- **DNS rebinding:** Second lookup on same host returns cached first address; mock proves `resolve4` called once while DNS “flips” to `10.0.0.5` (`metadata.test.ts:121-135`). Pre-resolved addresses passed into `createPinnedMetadataAgent` on each hop remove the check-vs-connect gap that existed with global `fetch`.
- **Multiple records in one answer:** All v4/v6 results must pass `isBlockedIpAddress` before pin (`122-124`); a mixed public+private list throws `BlockedUrlError` (cannot pin then connect to private).
- **Happy eyeballs / `family`:** Custom lookup handles `family` 4, 6, or 0 (prefers v4 when present, else v6) (`159-174`). Undici’s connector uses this lookup via `Agent` `connect.lookup`; no separate unpinned `dns.lookup` path when dispatcher is set.
- **IP-literal hostnames:** Node’s URL parser normalizes forms like `http://2130706433/` → `127.0.0.1`; resolution path still hits blocked loopback. Literal public IPs (e.g. `8.8.8.8`) are allowed by design for preview of numeric URLs.
- **Redirect + old agent:** New `dispatcher` per hop; `finally { await dispatcher.close() }` runs before following redirect or reading body (`385-387`). Manual spot-check: `agent.close()` before `res.text()` still reads body for a real Undici response (connection teardown is deferred until body consumption).
- **`HTTP_PROXY`:** With explicit `dispatcher`, Undici does not route through env proxy (bogus `HTTP_PROXY` + pinned agent: connect uses pinned IP; default fetch without dispatcher still reached example.com in a local check). Preview path always passes `dispatcher`.

**Residual hardening (minor, not raised as major)**

- Only **first** v4/v6 address is used per family; all must be non-blocked, but unreachable first A record yields `fetch_failed` rather than trying siblings (availability, not SSRF).
- Redirect **3xx** responses do not explicitly `cancel()` the redirect body before the next hop; mitigated by `dispatcher.close()` each iteration (possible extra socket churn under abuse, admin-gated).

**Deadline / resources**

- `clearTimeout(deadlineTimer)` in outer `finally` (`411-413`); abort listener removed on settle in `awaitWithAbort`.
- Slow-body test covers stall after headers; no evidence of timer leaks in tests.

**Row actions**

- Global `rowBusy` serializes row mutations (intentional); double-click blocked via `disabled={busy}` and early `if (rowBusy) return`.
- No optimistic status flip; list refreshes after successful PATCH only.
- Client publish rules align with server (`newsValidation.ts` / `validate.ts`).

### Remaining open (unchanged, minor)

- **Finding 4:** `www` / http vs https duplicate variants (`normalizeUrl.ts`).
- **Finding 5:** Collapsed rate-limit key when `remote.address` missing (`adminAuth.ts`).

### Updated QA hints

1. **Rebinding regression:** Repeat DNS-flip lab on `/api/admin/news/preview`; egress should stay on first resolved public IP only.
2. **Slow body (5s):** HTML headers fast, body never completes → `502`/`fetch_failed` within metadata deadline (use real Undici path, not only mocks).
3. **Row publish:** URL-only draft → **Publish** → editor + banner, zero PATCH; complete draft with server-side invalid summary → editor shows server field error.
4. **Row non-validation error:** Force 503 on unpublish → row `role="alert"`, status unchanged on screen.
5. **Public 401:** Stub `GET /api/news` → 401 with admin token in sessionStorage → token **retained**; admin `GET` 401 → token cleared.
6. **Bogon IP preview:** Preview host resolving to `100.64.0.1` or `198.18.0.1` → `400 blocked_url`.
7. **Prior minors still accepted:** `www` duplicate pair; rate-limit `unknown-remote` behavior behind broken `getConnInfo`.
8. **Smoke:** Real preview of a public article (integration) to confirm Undici pin + body read end-to-end after `dispatcher.close()` pattern.

---

## Re-review 2 (QA fix)

**Scope:** Node 24 / Undici 7 `connect.lookup` **`options.all: true`** callback shape (`metadata.ts` ~L129–210), plus `metadata.connect.test.ts`.

### Verdict

**APPROVE** — No **blocker** or **major** findings on this change. The QA regression (502 / `ERR_INVALID_IP_ADDRESS: undefined`) is addressed without opening a new SSRF or pinning bypass.

### What was verified

| Attack                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-validated IP in `entries` when `all: true`**  | **Held.** `pinnedEntries` only copies from cached `{ v4, v6 }` (`146-157`, `191-197`). Production always fills that cache via `resolveValidatedAddresses` (all A/AAAA checked, `122-124`) before `createPinnedMetadataAgent(..., pinnedAddresses)` (`387-388`). Empty family filter → `ENOTFOUND` via `fail`, not system DNS.                                                                                                                                                                                                                |
| **`family` fall-through to default / `dns.lookup`** | **Held.** Custom `lookup` is the only one wired on `Agent.connect` (`217-221`). Mismatch `host !== hostname` → `EINVAL` (`184-186`). No `dns.lookup` import or fallback path in this module.                                                                                                                                                                                                                                                                                                                                                 |
| **Wrong pinned set on redirect / IP literal**       | **Held.** Each hop: new `resolveValidatedAddresses(current.hostname)` + new `Agent` (`387-388`). Lookup closure hostname is per-agent; redirect changes `current` before the next iteration. IP-literal hostnames go through the same resolve + pin (blocked if loopback/private in validation).                                                                                                                                                                                                                                             |
| **Error / hang on failed lookup**                   | **Held.** `fail()` always invokes `callback(err, …)` once (`182`, `193-194`, `203-205`); success paths return either `callback(null, entries)` or single-address form (`196-201`). `ensurePinned` rejection maps to `BlockedUrlError` in `fail`.                                                                                                                                                                                                                                                                                             |
| **Integration test meaningful?**                    | **Yes, with caveat.** `metadata.connect.test.ts` uses **real** `undiciFetch` + TCP to `127.0.0.1` with synthetic hostname `news.test` and **test-only** `preResolved: { v4: ['127.0.0.1'] }` — it exercises the exact Undici→`net.connect`→custom `lookup` path that failed in production (including autoSelectFamily / `all: true`), Host header, and HTML read. It does **not** re-run `resolveValidatedAddresses` (that remains covered by unit tests + live preview smoke). It does **not** bypass the lookup implementation under test. |

### Unit coverage added

- `metadata.test.ts:137-150` — direct `lookup(..., { all: true, family: 4 })` returns full pinned v4 array (both addresses came from mocked `resolve4`, both would have been validated in `resolveValidatedAddresses`).

### Residual notes (minor, not escalated)

- **`preResolved` trust boundary:** Callers that pass `preResolved` without prior validation (integration test only) could connect anywhere; **only** `fetchPageMetadata` supplies it, always after validation. Public API surface is unchanged.
- **Coverage gap (hardening):** Still no automated test that calls **`fetchPageMetadata`** end-to-end with unmocked Undici (live httpbin was manual). Connect integration closes the QA hole; optional follow-up is one slow integration test behind a flag or httpbin allowlist.

### QA hints (this fix)

1. **Regression:** `POST /api/admin/news/preview` with `https://httpbin.org/html` (or similar) → **200** with title/metadata, not **502**.
2. **CI:** `metadata.connect.test.ts` must stay unmocked (real Undici); keep `news.test` hostname if tests depend on it.
3. **Dual-stack host (manual):** Preview URL with both A and AAAA records → should succeed (lookup `all: true` returns multiple validated entries).
4. **Blocked preview unchanged:** `localhost` / metadata IP still **400 `blocked_url`** before connect.
