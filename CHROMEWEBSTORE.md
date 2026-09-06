# Chrome Web Store submission

Status: **not submitted**. The extension is currently distributed as a private beta archive. This file is the source of truth for a future Chrome Web Store submission.

Last updated: 6 September 2026 · Current extension version: `0.8.0`

## Listing

- Product name: `Behaviour Tracer`
- Category: `Developer Tools`
- Language: `English`
- Summary: `Select an element, perform one interaction, and see a plain-language explanation with an optional technical trace.`
- Single purpose: Help a developer understand the observable browser behaviour caused by one user-started interaction.

### Detailed description

Behaviour Tracer lets a developer select an element on a website, perform one click, and see a plain-language explanation of what followed. It organizes the result as the user's action, page code, data requests, page changes, navigation, and problems. Complete technical timing and source details remain available when needed.

Tracing begins only after an explicit action in the extension side panel. Processing, source-map resolution, history, and export redaction happen locally in the browser. The extension has no backend, analytics, account system, advertising, or automatic upload.

Chrome displays its standard debugging banner during the short trace because deep runtime observation uses the `chrome.debugger` API. The debugger detaches automatically when capture ends.

## Permission justifications

- `debugger`: Observes call frames, asynchronous events, request metadata, runtime errors, and navigation during a short user-started trace. It detaches automatically.
- `scripting`: Injects the element picker and its static stylesheet after the user grants access to the active website.
- `sidePanel`: Hosts the extension controls and trace results in Chrome's side panel.
- `storage`: Stores user preferences, a bounded local history, and a safe public snapshot of the current tab's trace state.
- `tabs`: Reads the active tab ID and URL so the extension can request access to exactly that website and associate a trace with the correct tab.
- Optional `http://*/*` and `https://*/*`: Allows Chrome to offer per-website access. The extension requests only the active page's exact origin after the user chooses **Select element** or **Record one click**; it has no required host access and no always-on content script.

## Data-use disclosure

The Web Store privacy questionnaire must disclose local handling of:

- website content: selected-element text and capped HTML plus DOM mutation summaries;
- user activity: the one interaction the user explicitly asks the extension to trace;
- web history: page, navigation, request, WebSocket, and source-map URLs observed during that trace;
- diagnostics: console warnings, runtime errors, source locations, and trace-quality diagnostics.

None of this data is sold, used for advertising, used for credit decisions, or transferred to the developer or another server by the extension. Exports happen only after an explicit copy or download action. The complete disclosure must remain consistent with `PRIVACY.md` and the shipped code.

## Reviewer test instructions

1. Install the submitted package in desktop Chrome 118 or newer.
2. Open a normal HTTP or HTTPS test page and click the extension action to open the side panel.
3. Choose **Select element**, approve access to that website, and click a page element.
4. Choose **Record one click**, then click the selected element again.
5. Expect Chrome's debugging banner for approximately 3.5 seconds.
6. Confirm that **What happened** gives a step-by-step explanation while **Technical trace** is closed by default.
7. Open **Technical trace** and confirm that complete timings, source locations, filters, and evidence labels remain available.
8. Confirm that **Review safe export** opens a redacted preview.
9. Confirm under extension site settings that access can be revoked per website.

No account, payment, external service, or special hardware is required.

## Packaging and verification

Run:

```bash
npm run check
npm run test:e2e
npm run build
```

Upload only the ZIP produced from `dist/`. It contains extension runtime files and third-party license notices, not demos, tests, beta documents, repository metadata, or development dependencies. Verify the ZIP in a clean Chrome profile before submission.

## Submission blockers

- [ ] Choose and monitor a public support email address.
- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL and enter that URL in the listing.
- [ ] Create final 16, 32, 48, and 128 px extension icons and declare them in `manifest.json`.
- [ ] Create at least one accurate 1280×800 or 640×400 screenshot; avoid unsupported claims and promotional overlays.
- [ ] Decide whether the first Web Store release is private, unlisted, or public.
- [ ] Complete the Web Store privacy questionnaire using the disclosures above.
- [ ] Run the reviewer workflow against the exact upload ZIP in a clean Chrome profile.

Do not submit until each blocker is complete.

## Version history

- `0.8.0` · 6 September 2026 — Added the default plain-language explanation, progressive technical disclosure, explicit uncertainty wording, and narrow-panel usability verification.
- `0.7.1` · 6 September 2026 — Added Modern Web Guidance alignment, accessibility checks, safe DOM rendering, and Manifest V3 session recovery.
