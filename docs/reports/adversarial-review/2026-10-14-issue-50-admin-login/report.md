# Adversarial review — Issue #50 admin login & `/admin` shell

**Date:** 2026-10-14  
**Scope:** Uncommitted changes in `issue-50-admin-login` worktree vs `origin/main`  
**Reviewer:** adversarial-reviewer subagent  

## Verdict

**CHANGES REQUESTED** — Login rate-limit map growth and weak `next` validation are realistic server/client break scenarios; credential verification does not fully meet the stated constant-time requirement for unknown usernames.

---

## Findings

### 1. Login rate-limit map — memory growth via unique usernames (one IP)

- **Severity:** major  
- **Location:** `apps/server/src/middleware/adminAuth.ts:19-24`, `54-63`; `apps/server/src/routes/admin.ts:64-75`  
- **Attack:** From a single IP, send `POST /api/admin/login` with JSON `{ "username": "<unique>", "password": "x" }` (≤128 chars), repeating with a fresh username on each request. Each failed attempt calls `recordFailure(adminLoginRateLimitKey(ip, username))`, creating a new `Map` entry. `400 invalid_request` bodies are not counted, but arbitrary distinct usernames are.  
- **Impact:** `maybePruneBuckets` runs only when `failureBuckets.size > 2000` and deletes **expired** buckets only (`now >= bucket.resetAt`). While the 15-minute window is active, an attacker can grow the map by thousands of live entries per wave; sustained traffic creates unbounded churn and retained keys until windows expire — a practical memory/CPU DoS against the Node process. This bypasses the “10 failures per IP+username” intent for abuse volume (each username gets its own bucket).  
- **Suggested fix:** Cap total buckets (evict oldest/LRU), hash or normalize usernames in the key, and/or apply a secondary per-IP cap on **distinct** login-failure keys. **Owner:** backend-developer  

---

### 2. `next` validation allows path normalization escape from `/admin`

- **Severity:** major  
- **Location:** `apps/web/src/lib/adminApi.ts:123-129`; consumed in `apps/web/src/screens/AdminLoginScreen.tsx:30`, `69-70`  
- **Attack:** Visit `/admin/login?next=%2Fadmin%2F..%2Flogin` (or `/admin/login?next=/admin/../login`). `isValidAdminNext` returns `true` because the string starts with `/admin` and the pathname segment is not exactly `/admin/login` (literal `/admin/../login`). After successful login, `navigate(nextPath)` runs with that value.  
- **Evidence:** Static check (`node`): `isValidAdminNext('/admin/../login') === true`. Browser-style resolution: `new URL('/admin/../login', 'http://localhost:5173').pathname` → `/login`. The SPA has no `/login` route (`apps/web/src/main.tsx`), so the admin can land on an unmatched route outside the `/admin` layout after auth.  
- **Impact:** Breaks the acceptance flow (“lands on `/admin`”), bypasses the admin shell (no `/me` re-check, no admin chrome), and weakens the open-redirect hardening goal. Not a full off-site redirect (React Router `navigate`, not `location.href`), but a post-auth escape from the intended `/admin/*` enclave.  
- **Suggested fix:** Resolve `next` with the URL API against a fixed origin and require `pathname === '/admin' || pathname.startsWith('/admin/')` **after** normalization; reject `%2e`, `..`, and `@` in the path. **Owner:** frontend-developer  

---

### 3. Username existence — length short-circuit before `timingSafeEqual` (unknown-user path)

- **Severity:** major (acceptance criteria explicitly forbid username timing oracles)  
- **Location:** `apps/server/src/admin/users.ts:30-47`  
- **Attack:** For an **unknown** username, `verifyAdminCredentials` calls `safeEqual(password, DUMMY_PASSWORD)`. `safeEqual` returns immediately when `Buffer.from(a).length !== Buffer.from(b).length` **without** calling `timingSafeEqual` (`users.ts:33-34`). `DUMMY_PASSWORD` is 42 characters (`jade-court-admin-dummy-password-for-timing`). For a **known** user whose env password length is *L* ≠ 42, submit wrong passwords of length *L*: the known-user branch runs a full `timingSafeEqual`, while the unknown-user branch exits on length mismatch against the 42-char dummy. Repeat samples on `POST /api/admin/login` (same 401 body for both — response shape does not hide this).  
- **Impact:** Violates issue #50 / acceptance (“no timing oracle for username existence”). Practical exploitation depends on network jitter and password length; short `.env` passwords (e.g. dev `change-me`) widen the gap. Remote proof was not completed in this review, but the code path is not constant-time.  
- **Suggested fix:** Always compare fixed-length digests (e.g. HMAC both sides) or pad/hash to a constant width before `timingSafeEqual`, including the unknown-user branch. **Owner:** backend-developer  

---

### 4. `isValidAdminNext` accepts any path with prefix `/admin` (not only `/admin` and `/admin/...`)

- **Severity:** minor  
- **Location:** `apps/web/src/lib/adminApi.ts:123-129`  
- **Attack:** `?next=/administrator` or `?next=/admin@evil.com` passes validation (`startsWith('/admin')`). Post-login `navigate` goes to a non-admin route (no matching child under `AdminLayout`).  
- **Impact:** Confusing or blank post-login state; not an external open redirect, but undermines “safe admin paths only.”  
- **Suggested fix:** Require `path === '/admin' || path.startsWith('/admin/')` after normalization (same as finding #2). **Owner:** frontend-developer  

---

### 5. Shared-IP Bearer garbage can 429 all admins on token-check routes (accepted tradeoff)

- **Severity:** minor (documented design; not raised as blocker)  
- **Location:** `apps/server/src/middleware/adminAuth.ts:88-111`  
- **Attack:** On a shared NAT/proxy IP, send 11+ requests to `/api/admin/me` or `/api/admin/news` with `Authorization: Bearer bad.token` (malformed / bad signature).  
- **Impact:** `adminTokenRateLimitKey(ip)` rate-limits **all** Bearer checks from that IP, including valid sessions, for 15 minutes.  
- **Note:** Matches issue #50 deliberate design (do not count expired/revoked tokens). QA should confirm product acceptance behind one corporate egress IP.  

---

## Attacked and held

- **HMAC session tokens:** Single `.` split; tampered payload/signature → `invalid_auth`; wrong secret → `invalid_auth`; expired / revoked user → `unauthorized` without bucket increment (`session.ts:47-95`, `adminAuth.test.ts` behavior).  
- **503 vs 401 when disabled:** `adminAuth` and `POST /login` check `isAdminEnabled()` first → `503 admin_disabled` (`adminAuth.ts:84-86`, `routes/admin.ts:35-37`); no leak of valid tokens when secret missing.  
- **Login contract:** Identical `401 { error: 'invalid_credentials' }` for wrong password vs unknown user; `400 invalid_request` not rate-limited (`routes/admin.test.ts`).  
- **10+1 login lockout:** 10 failures → `401`, 11th → `429` per IP+username; other usernames unaffected (`routes/admin.test.ts`).  
- **Route mounting:** `app.route('/api/admin', …)` before `/api/admin/news` — login and news coexist; no `/api/admin/news/login` hijack (`app.ts:102-103`, integration test).  
- **`ADMIN_TOKEN`:** No matches in worktree product code or `.env.example` (historical reports excluded per scope).  
- **Client session tampering:** Malformed JSON/shape/expired `expiresAt` cleared in `getAdminSession`; news `401` clears session via `clearAdminSession` (`adminApi.ts`, `newsApi.ts`).  
- **Admin layout auth gate:** No session → redirect to `/admin/login?next=…`; `/me` failure `unauthorized` / `admin_disabled` clears session and redirects (`AdminLayout.tsx`).  
- **News API unauthorized:** List load calls `onUnauthorized()` on `NewsApiError` code `unauthorized` (`AdminNewsScreen.tsx:103-105`, `134-135`).  
- **CORS:** `Authorization` allowed (`app.ts:68`).  

---

## QA hints

1. **Login `next` hardening:** After login, try `?next=/admin/../login`, `/admin/%2e%2e/login`, `/administrator`, `/admin//news` — expect safe landing on `/admin` or `/admin/news` only.  
2. **Rate-limit memory:** Script ≥3k unique usernames × one failed login each from one IP; monitor server heap / `failureBuckets` size (if instrumented).  
3. **Timing (optional lab):** Same wrong-password length as a known short `.env` password vs random unknown username; high sample count, same IP, compare latency distributions (not response bodies).  
4. **Shared IP token limit:** 11 malformed Bearer requests then valid admin token on `/api/admin/me` — expect 429 until window reset (confirm acceptable).  
5. **Revoked user:** Login, remove user from `ADMIN_USERS`, restart server, retry `/api/admin/news` and `/api/admin/me` — expect `401` and web redirect to login.  
6. **503 disabled:** Unset `ADMIN_SESSION_SECRET` with `ADMIN_USERS` set — all admin API + login page “Admin is disabled.”  
7. **E2E regression:** Sign out, deep-link `/admin/news`, stale tab with tampered `sessionStorage` JSON.  

---

## Re-review 2026-10-14

### Final verdict

**APPROVE** — Prior major findings are addressed; the tech-lead dummy-password auth bypass is fixed and regression-tested. One **minor** residual on bucket eviction weakening lockouts under extreme volume; no remaining blocker or major issues.

---

### New finding (original review) — **blocker, now fixed**

**Unknown username + internal dummy password returned 200**

- **Severity:** blocker (existed in first review diff; not caught in initial pass)  
- **Location:** `apps/server/src/admin/users.ts` (pre-fix: unknown branch `return safeEqual(password, DUMMY_PASSWORD)`)  
- **Attack:** `POST /api/admin/login` with `{ "username": "not-a-real-user", "password": "<ADMIN_DUMMY_PASSWORD_FOR_TIMING>" }`. When `safeEqual` returned `true`, login issued a signed session token for a username not in `ADMIN_USERS`.  
- **Impact:** Bogus admin session in the browser; `/me` and news still `401` (`verifySessionToken` → `users.has(sub)` false), but contract violation and dangerous if combined with future admin features trusting login success alone.  
- **Fix verified:** Unknown branch runs `passwordsMatch(password, DUMMY_PASSWORD)` for timing parity then **`return false`** (`users.ts:50-52`). Regression: `users.test.ts` (“rejects unknown user even when password equals the internal dummy”) and `routes/admin.test.ts` (“does not authenticate unknown user with the internal dummy password”) — both pass (29/29 admin-related server tests).

---

### Original findings — status

| # | Topic | Status |
|---|--------|--------|
| 1 | Rate-limit map memory growth | **Fixed** — `MAX_BUCKETS = 10_000`, `enforceBucketCapBeforeInsert` drops expired then evicts oldest on new keys (`adminAuth.ts:27-46`, `77-88`); login keys use SHA-256 hex of username (`59-61`). Tests: `adminAuth.test.ts` “failure bucket cap”. |
| 2 | `next` path escape | **Fixed** — `parseSafeAdminNext` / `safeAdminNext` (`adminApi.ts:137-165`); rejects `..`, `%2e`, `/administrator`, `@`, `//`, backslash; normalizes via fixed origin. Evidence: `/admin/../login` → `null` → `/admin`; tests in `adminApi.test.ts`. |
| 3 | Timing / username oracle | **Fixed** — `passwordsMatch` compares 32-byte SHA-256 digests with `timingSafeEqual` only (`users.ts:34-41`); no length short-circuit. |
| 4 | Loose `/admin` prefix | **Fixed** (same as #2). |
| 5 | Shared-IP token 429 | **Accepted** — unchanged by design. |

---

### Residual finding — bucket eviction vs login lockout

- **Severity:** minor  
- **Location:** `apps/server/src/middleware/adminAuth.ts:33-39`, `77-88`  
- **Mechanism:** Login and token failures share one `failureBuckets` map. When at cap, inserting a **new** rate-limit key evicts the **oldest** bucket (any key), wiping its failure count and 429 lockout.  
- **Attack (targeted username `alice`):** (1) Provoke 10 failed logins for `alice` → locked. (2) While the map is still small, perform ~10 000 failed logins each with a **distinct** username (≤128 chars) from the same IP to fill the map. (3) One more distinct username insert evicts the oldest bucket; if `alice`’s bucket was oldest, her lockout is cleared → **10 additional** password attempts before re-lock.  
- **Cost / judgment:** ~10 001 failed login requests per “extra batch” of 10 guesses in the favorable ordering (victim bucket oldest). After re-lock, `alice`’s bucket is re-created as a new map entry (typically at the end), so further evictions require cycling many other keys — brute force remains impractical for strong secrets, but the strict “10 failures per 15 min per IP+username” guarantee can be **softened** under deliberate map-fill. Same eviction can drop `token:${ip}` buckets (collateral). **Not raised as major:** bounded memory is the intended tradeoff; optional hardening would pin live lockout buckets or use a separate cap for login vs token keys. **Owner:** backend-developer (optional follow-up).

---

### Re-review — attacked and held

- Dummy-password login regression (HTTP 401, not 200).  
- `safeAdminNext` rejects prior bypass payloads; accepts `/admin`, `/admin/news`, query/hash.  
- Digest-based credential compare on known and unknown paths.  
- Bucket cap bounded at 10 000 with tested eviction order.  
- No re-open of HMAC session, 503 disabled, route order, or `ADMIN_TOKEN` removal.

---

### QA hints (post-fix)

1. Confirm `POST /login` with dummy password + unknown user → 401 (not 200).  
2. Login with `?next=/admin/../login` → lands on `/admin` after success.  
3. (Optional stress) With instrumentation, 10 050 distinct failed usernames from one IP → map size ≤ 10 000; verify whether an early victim lockout bucket can disappear and allow 11th attempt on that username.
