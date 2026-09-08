# Project instructions

## Project language

- Use English for all product UI, documentation, tester materials, release notes, issue templates, and repository-facing text.
- Treat non-English product-facing text as a release blocker.

## Browser policy

- Target desktop Chrome 118 and newer. The minimum exists because an active `chrome.debugger` session keeps the Manifest V3 service worker alive from Chrome 118 onward.
- Prefer web platform features that are Baseline Widely available within this browser policy.
- Before changing HTML, CSS, or client-side JavaScript, run the installed Modern Web Guidance search and apply every relevant retrieved guide.
- For extension changes, follow the installed Chrome Extensions skill and Manifest V3 guidance.

## Verification

- Run `npm run check` for every code change.
- Run `npm run test:e2e` for runtime, permission, tracing, or side-panel changes.
- Keep the production package limited to the files listed in `scripts/package-extension.js`.
