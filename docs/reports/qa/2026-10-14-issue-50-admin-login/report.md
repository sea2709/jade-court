# QA report — Issue #50 admin login & `/admin` shell

**Date:** 2026-10-14  
**Worktree:** `issue-50-admin-login`  
**Issue:** [#50 — Admin panel with username/password login](https://github.com/sea2709/jade-court/issues/50)

## Verdict

**PASS**

No blocker or major product defects found. Manual API and browser checks match the issue contract and acceptance criteria. Adversarial re-review items (dummy-password login, `next` hardening, digest-based credential compare) behave as fixed.

---

## CI status (developer-reported)

Developers report all green with zero errors/warnings:

| Check | Status |
|--------|--------|
| `pnpm lint` | Reported pass |
| `pnpm format:check` | Reported pass |
| `pnpm typecheck` | Reported pass |
| `pnpm test:coverage` | Reported pass (480 unit tests: engine 77, server 227, web 176) |
| `pnpm test:e2e` | Reported pass (33 specs) |

**QA spot-check (not full CI re-run):**

- Server admin suite: `src/routes/admin.test.ts`, `src/admin/users.test.ts`, `src/admin/session.test.ts`, `src/middleware/adminAuth.test.ts` — **37/37 passed** locally.
- New/changed behavior has dedicated tests: `adminApi.test.ts`, `AdminLoginScreen.test.tsx`, `AdminLayout.test.tsx`, `e2e/admin-login.spec.ts`, updated `admin-news.spec.ts` / `newsApi.test.ts` / `AdminNewsScreen.test.tsx`.
- Static grep of `it(`/`test(` in `*.test.ts(x)` under engine/server/web ≈347 cases (Vitest/CI total 480 includes nested/dynamic cases); e2e spec files sum to **33** `test(` blocks — matches developer claim.

---

## Acceptance criteria

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Valid login → `/admin`, News via nav | **Pass** | Playwright capture + manual flow; [04-dashboard-desktop.png](screenshots/04-dashboard-desktop.png), [05-news-shell-desktop.png](screenshots/05-news-shell-desktop.png) |
| Wrong / unknown user → 401 `invalid_credentials` (same body) | **Pass** | `curl` POST `/api/admin/login`; UI [03-login-invalid-credentials.png](screenshots/03-login-invalid-credentials.png) |
| 10 failures IP+username → 429 on 11th; other usernames OK | **Pass** | Live API: 10×401 then 429 for `ratelimit-user`; `other-user` still 401 on same attempt |
| Missing `ADMIN_USERS` or `ADMIN_SESSION_SECRET` → 503 + login copy | **Pass** | API 503 `admin_disabled` with secret cleared; UI [12-login-admin-disabled.png](screenshots/12-login-admin-disabled.png) |
| Tampered / expired / revoked token → 401 + redirect login | **Pass** | API: crafted past-`exp` token → 401 `unauthorized`; client past `expiresAt` → login [13-expired-session-redirect.png](screenshots/13-expired-session-redirect.png); malformed storage [11-tampered-session-redirect.png](screenshots/11-tampered-session-redirect.png); revoked user covered in `session.test.ts` + `routes/admin.test.ts` |
| Sign out; logged-out `/admin/*` → `/admin/login?next=...` | **Pass** | [07-logged-out-redirect-news.png](screenshots/07-logged-out-redirect-news.png) |
| `ADMIN_TOKEN` removed (excl. historical `docs/reports/`) | **Pass** | `rg ADMIN_TOKEN` over worktree excluding `docs/reports/` → no matches |
| CI green | **Pass** | Per developer report + spot-check above |

---

## Verified behaviors

### API (`localhost:3001`)

- **Login success:** `POST /api/admin/login` `{admin, admin-dev-pass}` → 200 `{token, username, expiresAt}`; `Cache-Control: no-store`.
- **401:** wrong password, unknown user, dummy password + unknown user (adversarial hint #1) — all `invalid_credentials`.
- **400:** bad JSON → `invalid_request` (not counted toward login limiter per tests).
- **429:** per IP+username after 10 failed logins; separate username unaffected.
- **503:** `ADMIN_SESSION_SECRET=` with users set → login and `/me` return `admin_disabled`.
- **GET /me:** Bearer valid token → 200 `{username}`; missing/tampered Bearer → 401; expired signed token → 401 `unauthorized`.
- **News auth:** Bearer session on `GET /api/admin/news` → 200 with list (MongoDB connected in this env).
- **Token limiter (shared IP):** 11 malformed Bearer requests to `/api/admin/me` → 429; subsequent valid token also 429 until window reset — **accepted design** (adversarial #5).

### Web (`localhost:5173`)

- Login form copy: empty fields, invalid credentials, disabled admin (screenshots below).
- Dashboard + shell: header “Jade Court · Admin”, username, Sign out, nav “News”, Jade Court styling desktop/mobile.
- `?next=` hardening: `/admin/news` after login; traversal `?next=/admin/../login` lands on `/admin` after sign-in ([10-next-traversal-blocked.png](screenshots/10-next-traversal-blocked.png)).
- Already-authenticated visit to `/admin/login?next=/admin/news` redirects to news ([09-next-safe-admin-news.png](screenshots/09-next-safe-admin-news.png)).
- **`noindex`:** present on admin routes (`noindex` on news shell); **0** `robots` meta on home after leaving admin.
- **Public site:** no `/admin` link on home ([08-home-no-admin-link.png](screenshots/08-home-no-admin-link.png)).
- **Console:** no errors observed during Playwright capture runs.

---

## Bugs

None filed — all exercised flows matched spec.

---

## Known design notes (not defects)

1. **Shared-IP Bearer garbage limiter** — 11+ malformed tokens from one IP rate-limits all Bearer checks from that IP for ~15 minutes (confirmed live). Documented in issue #50.
2. **Bucket cap eviction** — adversarial re-review residual (minor): at 10k buckets, oldest eviction can soften a strict 10-failure lockout under extreme map-fill; accepted tradeoff for bounded memory.

---

## Not tested

- **Full CI matrix** — relied on developer report + targeted admin test run (per QA scope).
- **Login 429 UI** — API verified; did not force 429 in browser (would require 11 submits or waiting on window).
- **Revoked user live restart** — HTTP-level restart on `:3001` was unreliable with parallel `pnpm dev` processes; behavior verified via `session.test.ts`, `routes/admin.test.ts`, and client redirect paths for invalid/expired session.
- **Pikafish / LLM** — unrelated to admin; unchanged.
- **`news_storage_unavailable` UI** — MongoDB connected; public 503 path not exercised.

---

## QA artifacts

This pass adds only `report.md` and the PNG files under `screenshots/` in this folder (no helper scripts or other repo paths).

---

## Screenshots

| File | Description |
|------|-------------|
| [01-login-desktop.png](screenshots/01-login-desktop.png) | Login, 1280px |
| [02-login-mobile.png](screenshots/02-login-mobile.png) | Login, iPhone 13 width |
| [03-login-invalid-credentials.png](screenshots/03-login-invalid-credentials.png) | Wrong credentials alert |
| [03b-login-empty-fields.png](screenshots/03b-login-empty-fields.png) | Empty submit validation |
| [04-dashboard-desktop.png](screenshots/04-dashboard-desktop.png) | Dashboard after login |
| [05-news-shell-desktop.png](screenshots/05-news-shell-desktop.png) | News under admin shell |
| [06-dashboard-mobile.png](screenshots/06-dashboard-mobile.png) | Dashboard mobile |
| [06b-news-shell-mobile.png](screenshots/06b-news-shell-mobile.png) | News shell mobile |
| [07-logged-out-redirect-news.png](screenshots/07-logged-out-redirect-news.png) | Deep link `/admin/news` when logged out |
| [08-home-no-admin-link.png](screenshots/08-home-no-admin-link.png) | Public home |
| [09-next-safe-admin-news.png](screenshots/09-next-safe-admin-news.png) | After login, safe `?next=/admin/news` |
| [10-next-traversal-blocked.png](screenshots/10-next-traversal-blocked.png) | Traversal `?next=/admin/../login` → `/admin` |
| [11-tampered-session-redirect.png](screenshots/11-tampered-session-redirect.png) | Malformed `sessionStorage` → login |
| [12-login-admin-disabled.png](screenshots/12-login-admin-disabled.png) | 503 disabled copy |
| [13-expired-session-redirect.png](screenshots/13-expired-session-redirect.png) | Client expired `expiresAt` → login |
