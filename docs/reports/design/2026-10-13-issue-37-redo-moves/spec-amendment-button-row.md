# Spec amendment: Take back + Redo on one row (#37 follow-up)

**Date:** 2026-10-13 · **Mode:** Spec amendment (amends §2/§3 of `spec.md`) · **Screen:** `PlayScreen` → "Moves played" card · **Request:** put `↶ Take back move` and `↷ Redo move` on the same row; Restart / New game stay stacked.

## 1. Layout container

Wrap exactly the two buttons in one row inside the existing `card p-4 flex flex-col gap-2`; Restart and New game remain direct children of the card, full-width, in the same order.

```jsx
<div className="flex gap-2">
  <button className="btn btn-ghost btn-sm flex-1 px-2" …>↶ Take back move</button>
  <button className="btn btn-ghost btn-sm flex-1 px-2" …>↷ Redo move</button>
</div>
```

| Decision | Value                                   | Why                                                                                                                                                                                                                |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Row      | `flex gap-2` (8px)                      | Matches the card's own `gap-2` rhythm — the row reads as one item in the existing stack                                                                                                                            |
| Widths   | **`flex-1` (equal)**                    | Mirrored undo ↶ / redo ↷ is a symmetric pair; equal pills signal "these two go together" and suit the bold, rounded Jade Court look. Bonus: widths never depend on font metrics, so no jitter or ragged right edge |
| Padding  | **`px-2` overriding `btn-sm`'s `px-4`** | Needed to fit at 288px (see §2). Utility layer beats `@layer components`, so this is a class-only change — no CSS edits, no new tokens                                                                             |
| Wrap     | keep `.btn`'s `whitespace-nowrap`       | Labels must stay on one line inside the narrow pills                                                                                                                                                               |

## 2. Responsive behavior

Fact-check on the request: the sidebar card does **not** span full width at mobile — `.game-layout-wide` is a fixed `auto 320px` grid at every breakpoint (the page scrolls horizontally below ~1100px; pre-existing, `spec.md` §10). So the card content width is **320 − 2×16 = 288px at 375px, 768px, and 1280px alike**, and 288px is the binding constraint everywhere.

Fit check per pill at `flex-1`: (288 − 8) / 2 = **140px**. Minus 1px borders and `px-2` padding → **122px for text**. "↶ Take back move" in Nunito ExtraBold 14px measures ≈ 113–121px depending on the OS fallback glyph for ↶ (Nunito lacks U+21B6) → **fits; keeping `px-4` would overflow (~155px needed vs 140px)**, hence `px-2`. Worst-case 1em+ symbol-font fallback (~129px) could still bleed ~7px; acceptable risk, and the 375px screenshot is a mandatory review item (§5). Do not shrink the font or change labels/glyphs.

Result: identical rendering at all three breakpoints; no new overflow at 375px.

## 3. States

- Disabled styling is **unchanged** — native `disabled` → existing `.btn:disabled` (`opacity-45`, `cursor-not-allowed`). No visual edit.
- Mixed pair (Take back enabled, Redo disabled — the common case after the computer's first reply): both pills keep **equal width and equal height** (`flex-1`, identical classes; `disabled` alters no box metrics), so top/bottom edges align; opacity is the only difference, which is the intended affordance. Toggling states causes **no layout shift** since widths are metric-independent.
- `focus-visible` jade outline (2px + 2px offset = 4px) fits inside the 8px row gap — siblings never overlap it.

## 4. Out of scope (confirmed)

- Restart and New game: unchanged, still full-width stacked below the pair. (Deliberately not grouped: they are session actions, not a mirrored pair, and a 2×2 grid would put the game-leaving "New game" one tap away from Redo.)
- No changes to labels, ↶/↷ glyphs, `aria-label`s, `title` tooltips, keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y), enable/disable logic, or any behavior. No CSS/token changes. No REST/WS contract changes.

## 5. Design-review checklist

1. **375px**: both buttons on one row inside the card; "↶ Take back move" fully inside its pill — no clipped/overflowing text; the row adds no new horizontal overflow.
2. **Mixed state, 1280px** (Take back enabled / Redo disabled): pills exactly equal width and height, aligned top and bottom; disabled pill at 45% opacity.
3. **Both enabled, 768px** (after a take-back): each label on a single line; 8px gap between pills; pair spans the full card content width.
4. **Keyboard focus** on either button of the pair: full jade outline visible, not clipped by or touching the sibling.
5. **Regression**: Restart and New game remain full-width, stacked, in original order with original `gap-2` spacing below the row.
