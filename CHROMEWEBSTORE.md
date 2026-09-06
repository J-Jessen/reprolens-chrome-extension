# Chrome Web Store submission

Status: **not submitted**. The extension is currently distributed as a private beta archive. This file is the source of truth for a future Chrome Web Store submission.

Last updated: 6 September 2026 · Current extension version: `0.10.0`

## Listing

- Product name: `Behaviour Tracer`
- Category: `Developer Tools`
- Language: `English`
- Summary: `Record browser behaviour, explain failures, and create a safe bug report, GitHub draft, and Playwright test.`
- Single purpose: Help a developer turn user-started browser behaviour into reproducible, privacy-reviewed debugging evidence.

### Detailed description

Behaviour Tracer lets a developer trace one interaction or record a complete user journey of clicks/taps, named control keys, input changes, form submissions, and drops. It then explains what followed. For failures, it identifies the request method and destination or JavaScript error, explains the HTTP, browser-network, CORS, cancellation, or runtime problem, suggests the first relevant check, and connects the failure to source code and a visible page result when browser evidence supports those links. Complete technical timing and source details remain available when needed.

React traces can show the owning component path plus capped prop names/types and state shape without capturing values. Supported Chrome versions can also attach related Worker and cross-origin iframe contexts to observe request/error/handler metadata without reading messages or frame content. Local history supports naming, search, quality/problem filters, and comparison of two traces.

An optional second opinion uses Chrome's on-device language model on supported Chrome 148+ desktop devices. The user can review the complete redacted input first. Unsupported browsers and Chrome profiles receive a specific local troubleshooting message instead; there is no cloud AI fallback. Private-beta usefulness and clarity feedback is stored locally, redacted before storage, and downloaded only on request.

Completed traces can become locally redacted Markdown or JSON bug reports with reproducible steps and user-supplied expected/actual behaviour. A user may download the report, generate a Playwright test skeleton with privacy-safe placeholders, or open a prefilled GitHub issue draft. No GitHub token is requested or stored, and GitHub never receives the report unless the user explicitly opens the draft and then chooses whether to submit it.

Tracing begins only after an explicit action in the extension side panel. Processing, source-map resolution, history, and export redaction happen locally in the browser. The extension has no backend, analytics, account system, advertising, or automatic upload.

Chrome displays its standard debugging banner during the short trace because deep runtime observation uses the `chrome.debugger` API. The debugger detaches automatically when capture ends.

## Permission justifications

- `alarms`: Enforces automatic safety limits for short traces and multi-step recordings even if Chrome suspends and restarts the extension's background process.
- `debugger`: Observes call frames, asynchronous events, request metadata, runtime errors, navigation, and supported related Worker/frame contexts during a short user-started trace. It detaches automatically.
- `scripting`: Injects the element picker and its static stylesheet after the user grants access to the active website.
- `sidePanel`: Hosts the extension controls and trace results in Chrome's side panel.
- `storage`: Stores user preferences (including the last repository name, never a token), a bounded local history, optional local beta feedback, and a safe public snapshot of the current tab's trace state.
- `tabs`: Reads the active tab ID and URL so the extension can request access to exactly that website and associate a trace with the correct tab.
- Optional `http://*/*` and `https://*/*`: Allows Chrome to offer per-website access. The extension requests only the active page's exact origin after the user chooses **Select element for one-step trace**, **Record selected interaction**, or **Record a user journey**; it has no required host access and no always-on content script.

## Data-use disclosure

The Web Store privacy questionnaire must disclose local handling of:

- website content: selected-element text and capped HTML plus DOM mutation summaries;
- user activity: the single interaction or bounded multi-step journey the user explicitly asks the extension to trace, excluding typed characters, input values, submitted values, and dropped data;
- web history: page, navigation, request, WebSocket, and source-map URLs observed during that trace;
- diagnostics: console warnings, runtime errors, source locations, and trace-quality diagnostics.

None of this data is sold, used for advertising, used for credit decisions, or transferred to the developer. Exports happen only after an explicit copy or download action. If the user chooses **Open draft GitHub issue**, the reviewed report is placed in a GitHub issue-draft URL and is therefore transmitted to GitHub when that tab loads; the extension does not submit the issue. The complete disclosure must remain consistent with `PRIVACY.md` and the shipped code.

## Reviewer test instructions

1. Install the submitted package in desktop Chrome 118 or newer.
2. Open a normal HTTP or HTTPS test page and click the extension action to open the side panel.
3. Choose **Select element for one-step trace**, approve access to that website, and click a page element.
4. Leave **Detect automatically** selected or choose a specific interaction, choose **Record selected interaction**, then perform that interaction again.
5. Expect Chrome's debugging banner for approximately 3.5 seconds.
6. Confirm that **What happened** gives a step-by-step explanation while **Technical trace** is closed by default.
7. Open **Technical trace** and confirm that complete timings, source locations, filters, and evidence labels remain available.
8. Confirm that **Review safe export** opens a redacted preview.
9. Choose **Record a user journey**, perform two or more interactions, stop the journey, and confirm the captured steps appear in order.
10. Add expected/actual behaviour, build the safe bug report, and confirm Markdown, JSON, and Playwright downloads are available only after preview.
11. Enter a test repository as `owner/repository`; confirm a prefilled GitHub draft opens in a background tab and no issue is submitted automatically.
12. Confirm under extension site settings that access can be revoked per website.
13. Optionally review the exact AI input and try the local explanation on a supported Chrome 148+ device; the normal explanation must remain available without it.

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

- `0.10.0` · 6 September 2026 — Added bounded multi-step journey recording, redacted bug-report generation, review-first GitHub issue drafts without stored tokens, and Playwright regression-test generation with privacy-safe placeholders.
- `0.9.0` · 6 September 2026 — Added five interaction types, expanded error diagnoses, privacy-safe React shape, deeper Worker/frame metadata, searchable/comparable history, optional on-device AI with browser/model diagnostics, clearer and more accessible local beta feedback controls, and a 31-scenario browser corpus.
- `0.8.0` · 6 September 2026 — Added diagnostic failed-request explanations, targeted first checks, progressive technical disclosure, explicit uncertainty wording, and narrow-panel usability verification.
- `0.7.1` · 6 September 2026 — Added Modern Web Guidance alignment, accessibility checks, safe DOM rendering, and Manifest V3 session recovery.
