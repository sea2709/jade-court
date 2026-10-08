# Requirements — Learn Xiangqi with AI (interactive learning + paid tier)

| | |
| --- | --- |
| **Status** | Draft for review |
| **Owner** | Dang |
| **Last updated** | 2026-10-07 |
| **Related** | [#31 coach chat + streaming](https://github.com/sea2709/jade-court/issues/31), [#33 lessons removed](https://github.com/sea2709/jade-court/issues/33), [#28 multi-provider LLM](https://github.com/sea2709/jade-court/issues/28) |

---

## 1. Summary

Turn `/learn` from a single coached game into an **interactive learning product**: a guided path of short, hands-on lessons, coached games where Master Lin asks questions before giving answers, post-game reviews, and drills generated from the student's own mistakes. Progress is saved to an account.

LLM calls cost money per token, so AI-written coaching becomes a **paid feature with a free allowance**. Everything the engine can do without an LLM (move legality, verdicts, template coach text, basic lessons) stays free. Payments use **Stripe Checkout + Customer Portal**, and the server is the only source of truth for what a user is allowed to use.

## 2. Where we are today

What exists (and what this spec builds on):

- `/learn` (`apps/web/src/screens/LearnScreen.tsx`): student plays Red against an LLM opponent (`POST /api/ai/move`, negamax fallback). Master Lin chat gives per-move feedback, hints, and free-text answers via `/api/coach/*` and their `/stream` SSE variants.
- The **engine decides, the LLM explains**: `AI.gradeMove` (depth-2 negamax, centipawn loss → great/good/ok/inaccuracy/mistake/blunder) and `AI.bestMove` produce the facts; prompts in `packages/xiangqi-engine/src/llm/prompts.ts` forbid the LLM from contradicting them. Template text in `Coach.*` is the fallback.
- Difficulty (Gentle / Firm / Tough) only changes the opponent and greeting; grading, hints and coach wording ignore it.

Gaps that matter for this feature:

| Gap | Why it matters |
| --- | --- |
| No accounts (`authMiddleware` always sets `user = null`; only a random `x-guest-id`) | Can't charge, save progress, or enforce quotas per person. |
| Rate limit is in-memory, keyed on the client-chosen guest id | Trivially bypassed; resets on restart. Can't be the basis for paid quotas. |
| Learn games, chat and progress are never persisted | No history, no review, no drills, no progress tracking. |
| Streaming only works on Gemini; OpenAI/Anthropic stream routes silently return template text | If we charge, paying users on those providers would get template text. **Must be fixed before launch.** |
| Token usage is only console-logged | No cost visibility, no per-user metering, no budget cap. |
| No repetition / perpetual-check rules in the engine | Lessons and reviews must avoid positions where this matters, or the engine must add them. |
| Grading is depth-2 negamax | Fine for beginners; weak for "Tough". Pikafish grading is a Pro upgrade candidate. |

## 3. Goals and non-goals

**Goals**

1. A beginner can go from "I don't know how the pieces move" to finishing a full game with understanding, inside the app.
2. Learning is **interactive**: the student acts on the board in almost every step; the coach responds to what they actually did.
3. AI coaching is sustainable: revenue covers LLM + payment costs with margin.
4. Free users get real value and a clear reason to upgrade; paid users never hit a surprise wall mid-lesson.

**Non-goals (this release)**

- Native iOS/Android apps (see §9.8 — app stores would require in-app purchase).
- Paid features in Play vs Computer or Friends rooms (they stay free; Pikafish/negamax have no per-call cost).
- Human coaches, marketplaces, tournaments, ratings/ELO.
- Voice coaching.

## 4. Users and personas

| Persona | Need | Likely tier |
| --- | --- | --- |
| **Curious beginner** — knows Western chess or nothing | Learn rules and basic tactics without feeling stupid | Free → converts after a few lessons |
| **Returning casual player** — knows rules, loses a lot | Understand *why* moves are bad; fix recurring mistakes | Pro |
| **Parent / teacher** — sets up for a child | Safe, patient explanations; visible progress | Pro (annual) |

## 5. Learning experience — functional requirements

Requirement IDs: `LRN-xx`. Priority: **P0** = launch blocker, **P1** = launch target, **P2** = later.

### 5.1 Learn home (`/learn`)

- **LRN-01 (P0)** `/learn` becomes a hub with: "Continue" (resume last lesson/game), the learning path, "Coached game", "Review my games", "Practice my mistakes", and an allowance indicator (§7.4).
- **LRN-02 (P0)** Guests can open `/learn` and start Unit 1 without signing in. Saving progress and any AI-written coaching beyond the guest trial (§7.2) requires sign-in.
- **LRN-03 (P1)** Placement check on first visit: 4–6 board positions ("Which piece can capture?", "Find the check") plus "I'm new / I know the rules / I play regularly". Result sets the starting unit and default coach difficulty. Skippable.

### 5.2 Learning path (interactive lessons)

Lessons were removed in #33 because they were static pages that duplicated the coach. The new lessons are different: **every step is a board task the engine verifies, and the coach reacts to what the student did.**

- **LRN-10 (P0)** Path structure (initial content; ~5 min per lesson):

  | Unit | Lessons | Free? |
  | --- | --- | --- |
  | 1. The board & pieces | River & palace, General & Advisor, Elephant, Horse (and hobbling), Chariot, Cannon (screens), Soldier | **Free** |
  | 2. Capturing & check | Safe vs unsafe captures, giving check, escaping check, flying general | Free |
  | 3. Checkmate patterns | Double chariot, horse-chariot, cannon-backed, smothered general | Pro |
  | 4. Tactics | Fork, pin, discovered attack, cannon screen tricks, overloaded defender | Pro |
  | 5. Opening principles | Central cannon, screen horse, developing chariots, common traps | Pro |
  | 6. Endgames | Chariot vs advisors, horse+soldier, basic draws | Pro |

- **LRN-11 (P0)** A lesson is a sequence of **steps**. Step types:
  - **Explain** — short coach message + highlighted squares/arrows. Student taps "Got it".
  - **Do** — "Move the Horse to attack the Chariot." The board allows only the side to move; the engine checks the result against the step's goal.
  - **Find** — "Find the move that gives checkmate." Multiple correct answers allowed (any move satisfying the goal, e.g. `gameStatus === 'checkmate'`).
  - **Predict** — "What will Black do next?" Student taps a piece/destination; coach compares with the engine's best reply.
  - **Quiz** — multiple choice about the position ("Which piece is pinned?").
- **LRN-12 (P0)** Lesson content is **authored data**, not LLM-generated: start FEN, side to move, goal type (`reach-square`, `capture`, `give-check`, `checkmate`, `win-material ≥ N cp`, `exact-move`, `any-of`), accepted moves, scripted opponent replies, and template coach text. Stored in `apps/web/src/content/lessons/` (or `packages/xiangqi-engine` if the server validates). Lessons must never depend on repetition rules.
- **LRN-13 (P0)** Wrong attempt handling: 1st wrong → template nudge (free). 2nd wrong → **AI explanation of why that move fails** (paid action, template for free users). 3rd wrong → offer "Show me" which plays the answer with explanation. The step is still marked complete but with a "needed help" flag.
- **LRN-14 (P1)** "Ask Master Lin" is available inside any lesson step, with the step's position and goal as context (paid action).
- **LRN-15 (P1)** Each lesson ends with a 1–3 star result (no help / some help / shown the answer) and unlocks the next lesson. Units unlock sequentially; users may skip ahead after a short unit test.
- **LRN-16 (P2)** Lesson authoring tool or JSON schema validation script so new lessons can be added without code changes.

### 5.3 Coached game (today's Learn game, improved)

- **LRN-20 (P0)** Keep the current flow: per-move feedback, hints, ask, take back, new game.
- **LRN-21 (P0)** **Coaching style** selector replaces the bare difficulty dropdown in the chat header:
  - *Guide me* — feedback after every move, hints offered proactively after a mistake.
  - *Quiz me* (Socratic) — before revealing a hint, coach first asks a guiding question ("Your Chariot is undefended. What is attacking it?"). Student answers by tapping a square or typing; then the hint is revealed.
  - *Just watch* — feedback only on inaccuracies or worse; no unsolicited messages.
- **LRN-22 (P0)** Difficulty must affect coaching, not just the opponent: pass `difficulty` into feedback/hint/ask prompts (vocabulary and depth of explanation), and grade with depth 2 for beginner, 3 for intermediate, Pikafish (if configured) for advanced/Pro.
- **LRN-23 (P1)** **Think-first prompts**: at critical moments (engine sees a swing ≥ 150 cp available, or the student is in danger), coach says "Careful — there's something important here. Take your time." without revealing the move. Max once every 5 moves.
- **LRN-24 (P1)** **Take back with lesson**: after a mistake/blunder, "Take back" shows a one-line reason and offers "Try again" (student replays from that position).
- **LRN-25 (P1)** Learn opponent defaults to the **engine** (negamax/Pikafish tuned to difficulty) with an optional LLM comment, instead of the LLM choosing moves. Halves LLM calls per game (§8.1) and plays more consistently. LLM-chosen moves remain an option for "personality" later.
- **LRN-26 (P0)** On game end, show a game-over card (result, accuracy %, counts of great/good/…/blunder) with "Review this game" and "Play again".

### 5.4 Post-game review

- **LRN-30 (P1)** Review screen: move list, board scrubber, and an eval bar driven by engine evaluation.
- **LRN-31 (P1)** Engine picks the **3 key moments** (largest eval swings by the student). For each, coach explains what happened, what was better, and the underlying idea (paid; free users get verdict + best move with template text).
- **LRN-32 (P1)** Summary card: one strength, one theme to practice (mapped to a lesson/tactic tag), suggested next lesson.
- **LRN-33 (P2)** Ask questions about any move in the review.

### 5.5 Practice my mistakes (drills)

- **LRN-40 (P1)** Every student move graded *mistake* or *blunder* (in coached games or reviews) saves a drill: position before the move, the student's move, the engine's best move, tags.
- **LRN-41 (P1)** Drill flow: "You played X here last time. Find something better." Accept any move within 30 cp of the best. Spaced repetition: correct → next in 3 days, then 7, 21; wrong → tomorrow.
- **LRN-42 (P2)** Tag mistakes by motif (hanging piece, missed capture, missed check defense, etc.) using simple engine heuristics, to feed the progress view.

### 5.6 Progress

- **LRN-50 (P0)** Persist per user: lesson completion + stars, coached games (moves, verdicts, result), drills queue.
- **LRN-51 (P1)** Progress screen: path completion, accuracy trend over last 10 games, blunders per game trend, streak (days with ≥1 lesson/game/drill).
- **LRN-52 (P1)** Guest progress is stored in `localStorage` and **merged into the account on sign-in**.

### 5.7 Coach behavior rules (all modes)

- **LRN-60 (P0)** Engine remains the source of truth. LLM output must not contradict the verdict, suggest a different move than the engine's hint, or invent rules. Keep the existing prompt constraints and add the lesson goal to the context.
- **LRN-61 (P0)** Every AI-written message has a template fallback. A failed or timed-out LLM call shows template text and **is not charged** (§7.3).
- **LRN-62 (P0)** Coach tone: patient, encouraging, never mocking; short (≤ 3 sentences in-game, ≤ 6 in reviews). Use Chinese piece names alongside English on first mention per session.
- **LRN-63 (P1)** Free-text ask: refuse off-topic requests politely; strip/ignore prompt-injection attempts; max 500 chars (existing); conversation history capped per session.

## 6. Accounts — functional requirements

Payment requires identity. The original plan (`README`, plan doc) already chose **Clerk**; this spec assumes it.

- **ACC-01 (P0)** Sign in with Google, Apple, or email magic link via Clerk. Web uses `@clerk/clerk-react`; server verifies the Clerk session JWT in `authMiddleware` and sets `c.get('user')`.
- **ACC-02 (P0)** On first authenticated request, upsert a `users` document (§10.1).
- **ACC-03 (P0)** Guest id remains for anonymous use (rooms, guest trial). On sign-in, guest progress and the guest's used trial are linked to the user.
- **ACC-04 (P0)** Account settings: display name, delete account (deletes progress, cancels subscription, anonymizes usage ledger), export my data (JSON).
- **ACC-05 (P1)** Age: users must confirm they're 13+ (or have parent consent) at sign-up; under-13 accounts not supported in v1.

## 7. Payments — functional requirements

### 7.1 What costs money and what doesn't

The rule: **if it calls an LLM, it's a metered "AI action". If it's engine or template only, it's free and unlimited.**

| Feature | Free (no LLM) | AI action (metered) |
| --- | --- | --- |
| Move legality, verdict label, centipawn loss | ✅ | |
| Template coach text, piece tips | ✅ | |
| Units 1–2 lessons (template coach) | ✅ | |
| Units 3–6 lessons | | Pro only |
| AI-written move feedback | | 1 action |
| AI-written hint | | 1 action |
| Ask Master Lin (free text) | | 1 action |
| AI explanation of a wrong lesson attempt | | 1 action |
| Post-game review (3 key moments + summary) | | 3 actions (one call per moment, summary bundled) |
| LLM opponent move/comment | | 0 if engine opponent (default, LRN-25); 1 if LLM opponent |
| Pikafish-graded feedback (advanced) | | Pro only |

### 7.2 Plans

Prices are **starting proposals** to validate against measured token costs (§8).

| Plan | Price | AI actions | Content |
| --- | --- | --- | --- |
| **Guest** (no account) | Free | 15 total per device (one taste of a coached game) | Units 1–2, coached games with template coach |
| **Free** (signed in) | Free | **30 per day** (≈ one fully coached game), resets 00:00 user's local time | Units 1–2, coached games, review with template text, drills |
| **Pro monthly** | **$5.99 / month** | Unlimited, fair use **400/day** | Everything, Pikafish grading, full AI reviews |
| **Pro annual** | **$47.99 / year** (~33% off) | Same as monthly | Same as monthly |

- **PAY-01 (P0)** Plans above; prices and limits are config (`BILLING_*` env / DB), not hard-coded.
- **PAY-02 (P1)** **7-day free trial** of Pro for first-time subscribers, card required at checkout (reduces trial abuse). One trial per user.
- **PAY-03 (P2)** **AI credit packs** (e.g. 300 actions for $2.99, never expire) for users who don't want a subscription. Consumed after the daily free allowance.
- **PAY-04 (P2)** Promo codes / coupons via Stripe (launch discount, teachers).

### 7.3 Metering rules

- **PAY-10 (P0)** Metering is **server-side only**. The client shows remaining allowance but never decides it.
- **PAY-11 (P0)** An action is charged **only when the LLM returns usable output**. Charging flow: reserve 1 action before the call (reject with 402 if none left) → on success commit → on timeout/error/template fallback release. Reservations expire after 60 s.
- **PAY-12 (P0)** Streaming: charge when the first token arrives. If the stream errors before any token, release. If it errors mid-stream, keep the charge (partial text was delivered) — but log it for monitoring.
- **PAY-13 (P0)** Fair-use cap for Pro (400/day): on hitting it, coaching continues with template text and a non-blocking notice; no hard error. Alert ops if any user hits it 3 days in a row.
- **PAY-14 (P0)** Abuse limits independent of plan: keep a per-user rate limit (e.g. 30 requests / minute) and add a per-IP limit for guests. Move rate-limit + quota state to MongoDB (or Redis if added) so it survives restarts and multiple server instances.
- **PAY-15 (P0)** **Mid-lesson grace**: if a user runs out during a lesson or game, the current lesson/game continues with template coaching. Never block a move or the board.
- **PAY-16 (P0)** Global kill switch: `LLM_DAILY_BUDGET_USD`. When estimated spend for the day exceeds it, all users fall back to template text and ops is alerted. Paying users are protected first: the switch applies to Free/Guest at 80% of budget, everyone at 100%.

### 7.4 Paywall and upgrade UX

- **PAY-20 (P0)** Allowance indicator on the Learn hub and in the coach chat header: "18 AI coach replies left today" (Free) / "Pro" badge (Pro). Tapping opens the plans sheet.
- **PAY-21 (P0)** When a Free user hits 0: the coach posts a **system bubble** — "You've used today's AI coaching. I'll keep helping with quick tips. Upgrade to Pro for unlimited explanations." — with "See Pro" and "Not now". Shown once per day, not on every move.
- **PAY-22 (P0)** Locked Pro lessons show a lock icon and a preview of the first step; tapping "Unlock" opens the plans sheet.
- **PAY-23 (P0)** Plans sheet: Free vs Pro comparison, monthly/annual toggle, trial note, "Continue to payment". Requires sign-in first (Clerk modal), then returns to the sheet.
- **PAY-24 (P0)** After successful payment, return to the exact screen the user came from with a "Welcome to Pro" toast; allowance indicator updates without reload.
- **PAY-25 (P1)** "Manage subscription" in account settings opens the Stripe Customer Portal (change plan, update card, cancel, invoices).

### 7.5 Payment flow (Stripe)

```text
Web (/learn)                    Server (Hono)                         Stripe
────────────                    ─────────────                         ──────
"Continue to payment"
  │  POST /api/billing/checkout {plan}
  │──────────────────────────────▶ verify Clerk JWT
  │                                get/create Stripe customer
  │                                create Checkout Session ───────────▶
  │◀────────────────────────────── { url }
  │  redirect to Stripe Checkout ─────────────────────────────────────▶ card / Apple Pay / Google Pay
  │                                                                    │
  │                                POST /api/billing/webhook ◀────────│ checkout.session.completed,
  │                                verify signature, dedupe event id   │ customer.subscription.*,
  │                                update subscriptions + entitlement  │ invoice.paid / payment_failed
  │◀─ redirect to success_url (/learn?checkout=success)
  │  GET /api/billing/entitlement (poll ≤ 10 s until plan = pro)
  │──────────────────────────────▶ read entitlement from DB
```

- **PAY-30 (P0)** Use **Stripe Checkout (hosted)** and **Stripe Customer Portal** — no card data touches our server or PWA (keeps PCI scope at SAQ A).
- **PAY-31 (P0)** Entitlement is granted **only from webhooks**, never from the success redirect. The success page polls `GET /api/billing/entitlement`.
- **PAY-32 (P0)** Webhook handler: verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`; store processed `event.id` in `stripe_events` and skip duplicates; handle out-of-order events by re-fetching the subscription from Stripe and using its current state.
- **PAY-33 (P0)** Events handled:

  | Event | Action |
  | --- | --- |
  | `checkout.session.completed` | Link Stripe customer ↔ user; fetch subscription; set plan |
  | `customer.subscription.created` / `updated` | Sync status, plan, `current_period_end`, `cancel_at_period_end` |
  | `customer.subscription.deleted` | Downgrade to Free |
  | `invoice.paid` | Extend period; clear `past_due` |
  | `invoice.payment_failed` | Mark `past_due`; show in-app banner "Update your card" |
  | `customer.subscription.trial_will_end` | In-app notice 3 days before trial ends |

- **PAY-34 (P0)** Status → access mapping:

  | Stripe status | Access |
  | --- | --- |
  | `trialing`, `active` | Pro |
  | `past_due` | Pro for a **7-day grace period**, with banner; then Free |
  | `canceled` with `cancel_at_period_end` | Pro until `current_period_end`, then Free |
  | `unpaid`, `incomplete_expired`, `canceled` | Free |

- **PAY-35 (P0)** Downgrade never deletes progress. Pro lessons already completed stay completed but are read-only (can review, can't replay with AI) until re-subscribed.
- **PAY-36 (P1)** Taxes via **Stripe Tax** (or choose a merchant-of-record provider; see §12). Prices displayed tax-inclusive where required (EU/UK).
- **PAY-37 (P1)** Refund policy: full refund on request within 14 days of first charge (covers EU withdrawal right); handled manually from the Stripe dashboard, which fires `charge.refunded` → log only; cancellation via portal.
- **PAY-38 (P1)** Emails (receipts, failed payment, trial ending) sent by Stripe's built-in emails in v1.

## 8. Cost model (must validate before setting final prices)

### 8.1 Rough per-game estimate

Assumptions: a coached game ≈ 40 student moves; each LLM call ≈ 1,500 input tokens (system prompt + board + history) and ≈ 200 output tokens; 40 feedback + 5 hints + 5 asks = 50 calls (engine opponent) or 90 calls (LLM opponent).

| Model (current defaults) | ≈ cost per game, engine opponent | ≈ cost per game, LLM opponent |
| --- | --- | --- |
| `gpt-4o-mini` | ~$0.02 | ~$0.03 |
| `claude-sonnet-4` | ~$0.35 | ~$0.60 |
| Gemini / Gemma | lowest (verify current pricing / free tier limits) | |

These figures are back-of-envelope. **Measure real numbers** with `LLM_LOG_TOKENS=1` over 20 real games per provider before locking prices.

### 8.2 Implications

- Free tier (30 actions/day) on a mini-class model costs roughly **$0.01–0.02 per active free user per day**.
- Pro at 400 actions/day max on `gpt-4o-mini` ≈ $0.15/day worst case ≈ $4.50/month — close to the $5.99 price after Stripe fees (~$0.47). Typical users will use far less, but the fair-use cap must stay.
- A Sonnet-class model is **not viable as the default** at $5.99. Options: use a mini/flash model for in-game feedback and a stronger model only for post-game review.
- **COST-01 (P0)** Record `{userId, route, provider, model, inputTokens, outputTokens, estimatedUsd}` for every LLM call in the usage ledger.
- **COST-02 (P1)** Per-route model selection: `LLM_MODEL_FEEDBACK`, `LLM_MODEL_REVIEW`, etc., falling back to `LLM_MODEL`.
- **COST-03 (P1)** Trim prompt history (send last N plies + FEN instead of full history) to cut input tokens.

## 9. Non-functional requirements

1. **Latency** — first streamed token p50 < 1.5 s, p95 < 4 s. Template fallback shown if no token in 6 s (keep `LLM_TIMEOUT_MS` as the hard stop).
2. **Streaming parity** — all three providers (Gemini, OpenAI, Anthropic) must implement real streaming before paid launch; a stream that falls back to template must emit `done{source:'template'}` so it isn't charged.
3. **Reliability** — webhook endpoint returns 2xx within 5 s; heavy work done after acknowledging. Stripe retries are idempotent (PAY-32).
4. **Security** — entitlement and quota checks on every metered route (middleware, not per-route copy-paste); Clerk JWT verified server-side; CORS updated for the production origin; Stripe secret and webhook secret only on the server (no `VITE_` prefix).
5. **Privacy** — store coach chat transcripts for 30 days (for reviews and debugging), then delete. Don't send user identity (email/name) to LLM providers. Privacy policy lists LLM providers as subprocessors.
6. **Accessibility** — lesson steps operable by keyboard (arrow keys + Enter on the board), coach messages in an `aria-live="polite"` region, color is never the only verdict signal (emoji + label already help).
7. **Offline / PWA** — Units 1–2 lessons and template coaching work offline; AI features show "You're offline — using quick tips".
8. **App stores** — if the PWA is later wrapped for iOS/Android, digital subscriptions must use Apple/Google in-app purchase. Keep entitlement logic provider-agnostic (`source: 'stripe' | 'apple' | 'google'`) so this can be added.

## 10. Data model (MongoDB)

### 10.1 Collections

```ts
// users
{ _id, clerkId, email, displayName, createdAt,
  guestIds: string[],                 // merged guest identities
  learn: { startingUnit, coachStyle, difficulty } }

// entitlements — one per user, the only thing metered routes read
{ userId, plan: 'free' | 'pro',
  source: 'stripe',                   // later: 'apple' | 'google'
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none',
  currentPeriodEnd, graceUntil?, trialUsed: boolean,
  stripeCustomerId?, stripeSubscriptionId?, updatedAt }

// usage_daily — fast quota check
{ userId | guestId, day: 'YYYY-MM-DD', used, reserved }   // unique (subject, day)

// usage_ledger — one row per LLM call, for cost + audit
{ userId?, guestId?, route, provider, model,
  inputTokens, outputTokens, estimatedUsd,
  charged: boolean, outcome: 'ok' | 'timeout' | 'error' | 'template', at }

// stripe_events — idempotency
{ _id: eventId, type, processedAt }

// lesson_progress
{ userId, lessonId, stars, completedAt, neededHelp: boolean }

// learn_games
{ userId, startedAt, endedAt, result, difficulty, coachStyle,
  moves: [{ move, side, verdict, lossCp }], reviewGeneratedAt? }

// drills
{ userId, fen, side, playedMove, bestMove, tags, dueAt, interval, streak }
```

## 11. API changes (`apps/server`)

### 11.1 New routes

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/me` | user | Profile + entitlement + today's allowance |
| `GET /api/billing/entitlement` | user | `{ plan, status, currentPeriodEnd, allowance: { used, limit, resetsAt } }` |
| `POST /api/billing/checkout` | user | `{ plan: 'pro_monthly' \| 'pro_annual' }` → `{ url }` |
| `POST /api/billing/portal` | user | → `{ url }` for Stripe Customer Portal |
| `POST /api/billing/webhook` | Stripe signature | Raw body; no JSON middleware before signature check |
| `GET/PUT /api/learn/progress` | user | Lesson progress; `PUT` also handles guest merge |
| `POST /api/learn/games`, `GET /api/learn/games/:id` | user | Save / fetch coached games |
| `POST /api/coach/review` (+ `/stream`) | user/guest | Post-game key-moment explanations |
| `GET /api/learn/drills/due`, `POST /api/learn/drills/:id/attempt` | user | Drill queue |

### 11.2 Changes to existing routes

- All `/api/coach/*`, `/api/ai/move` (and `/api/opponent/move` when provider is `llm`) go through a new **`meterAiAction` middleware**: resolve subject (user or guest) → check entitlement + allowance → reserve → run → commit/release.
- Out of allowance response:
  - One-shot routes: `402 { error: 'quota_exceeded', plan, allowance, upgradeUrl: '/learn?plans=1' }`.
  - Stream routes: emit `meta{ quota: 'exceeded' }`, stream **template** text, `done{ source: 'template' }` — so the UI keeps working (PAY-15).
- Every metered response includes the remaining allowance (`X-AI-Remaining` header for JSON, `meta.allowance` for SSE) so the UI updates without polling.
- Lesson-aware context: feedback/hint/ask accept optional `lesson: { id, stepGoal }` and `coachStyle`.

### 11.3 New env vars (`.env.example`)

```bash
# Auth
CLERK_SECRET_KEY=
VITE_CLERK_PUBLISHABLE_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_ANNUAL=
BILLING_FREE_DAILY_ACTIONS=30
BILLING_GUEST_TOTAL_ACTIONS=15
BILLING_PRO_DAILY_FAIR_USE=400
BILLING_PAST_DUE_GRACE_DAYS=7
APP_BASE_URL=http://localhost:5173

# Cost guardrails
LLM_DAILY_BUDGET_USD=
```

Local webhook testing: `stripe listen --forward-to localhost:3001/api/billing/webhook`.

## 12. Open questions

1. **Stripe vs merchant of record (Paddle / Lemon Squeezy)?** Stripe is cheaper and more flexible, but we then own VAT/sales-tax registration. A merchant of record handles global tax for ~5% + fees — attractive for a solo project.
2. **Pricing and currency** — USD only at launch, or local pricing (e.g. VND) for target markets?
3. **Daily allowance vs. "N free coached games per day"** — actions are fairer to cost; games are easier to understand. Recommendation: meter actions internally, *display* as "about 1 coached game left today".
4. **Default LLM provider for production** — pick based on §8 measurements; likely a mini/flash model for in-game, stronger for reviews.
5. **Engine rules** — add repetition / perpetual-check rules before endgame lessons and reviews, or exclude those positions?
6. **Family / classroom plans** — demand from teachers/parents? (P2)

## 13. Delivery phases

Each phase is a set of GitHub issues; suggested order respects dependencies.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0. Foundations** | Clerk auth (ACC-01..03), MongoDB persistence for users/progress, streaming for OpenAI + Anthropic, usage ledger (COST-01), persistent rate limiting | Signed-in user's coached game is saved; token cost per game measured for each provider |
| **1. Interactive learning (free)** | Learn hub, lesson engine + Units 1–2, coaching styles, game-over card, difficulty-aware coaching, engine opponent default | Beginner can finish Units 1–2 and a coached game; all free, AI actions metered but not limited |
| **2. Paid tier** | Entitlements, `meterAiAction`, allowance UI, paywall, Stripe Checkout/Portal/webhooks, trial, budget kill switch | End-to-end test-mode purchase → Pro unlocked via webhook; cancel → downgrade at period end; failed payment → grace → Free |
| **3. Pro content** | Units 3–6, post-game review, drills with spaced repetition, progress screen, Pikafish grading | Pro user can review a game and practice mistakes |
| **4. Growth** | Credit packs, promo codes, placement check, lesson authoring tooling | — |

## 14. Acceptance criteria (launch)

- [ ] Guest can complete Unit 1 offline-capable with template coaching and never sees a payment wall for free content.
- [ ] Free user sees the allowance count drop only when an AI-written message actually arrives; timeouts and template fallbacks don't reduce it.
- [ ] Free user at 0 allowance can still finish the current game/lesson with template coaching; upgrade prompt appears once.
- [ ] Changing `x-guest-id` or restarting the server does not reset a signed-in user's allowance.
- [ ] Stripe test-mode purchase unlocks Pro within 10 s of returning from Checkout, with no reload.
- [ ] Replaying the same webhook event twice has no extra effect.
- [ ] Canceling in the Customer Portal keeps Pro until period end, then downgrades automatically; progress is kept.
- [ ] `invoice.payment_failed` shows a banner and keeps Pro for 7 days, then downgrades.
- [ ] No Stripe secret, webhook secret, or Clerk secret is present in the web bundle.
- [ ] LLM coach never contradicts the engine verdict in a 50-position spot check.
- [ ] Measured LLM cost per Pro user at the fair-use cap is below the net subscription price.

## 15. Success metrics

| Metric | Target (first 3 months) |
| --- | --- |
| Unit 1 completion (of users who start it) | ≥ 60% |
| D7 retention of signed-in learners | ≥ 25% |
| Free → Pro conversion (of signed-in learners) | 3–5% |
| Trial → paid conversion | ≥ 40% |
| LLM cost as % of net revenue | ≤ 35% |
| Coach messages served by template fallback due to errors (paid users) | < 2% |
