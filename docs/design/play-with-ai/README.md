# Play with AI — design prototype

A clickable mockup of the paid **Play with AI** mode and the new **Account** page, for the Play with
AI epic ([#75](https://github.com/sea2709/jade-court/issues/75)). Treat it as a REFERENCE MOCKUP,
not production code: the inline styles carry the intended Jade Court colors, type, spacing, and
copy, which the implementation should reproduce in its own components (Tailwind v4 utilities and
`apps/web/src/index.css`), not copy wholesale.

## Contents

- `index.html` — the whole prototype in one page. It embeds the prototype source (a React +
  TypeScript component) plus small stand-ins for the Cursor canvas components it was written
  with, and compiles it in the browser with Babel.

## Screens

Switch screens with the pills at the top, or click inside the mock (sign-in buttons, Buy, the avatar
menu, the model picker, Hint, the chat box).

| Screen                    | Stories                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Play with AI — signed out | [#76](https://github.com/sea2709/jade-court/issues/76), [#83](https://github.com/sea2709/jade-court/issues/83), [#84](https://github.com/sea2709/jade-court/issues/84)                                                         |
| Play with AI — no pass    | [#80](https://github.com/sea2709/jade-court/issues/80), [#84](https://github.com/sea2709/jade-court/issues/84) (no-email variant)                                                                                              |
| Play with AI — playing    | [#81](https://github.com/sea2709/jade-court/issues/81), [#78](https://github.com/sea2709/jade-court/issues/78)                                                                                                                 |
| Play vs Computer — resume | [#82](https://github.com/sea2709/jade-court/issues/82)                                                                                                                                                                         |
| Account page              | [#76](https://github.com/sea2709/jade-court/issues/76), [#80](https://github.com/sea2709/jade-court/issues/80), [#82](https://github.com/sea2709/jade-court/issues/82), [#83](https://github.com/sea2709/jade-court/issues/83) |
| Avatar menu and Sign out  | [#76](https://github.com/sea2709/jade-court/issues/76)                                                                                                                                                                         |

Below the mock, each screen lists how its controls behave and which API from the plan they use.

## Viewing

Open `index.html` directly in a browser. It needs an internet connection: React, Babel, and the
fonts load from public CDNs. State resets on reload.
