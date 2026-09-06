# ReproLens v0.11.0-beta.1

This private beta tests which parts of a more complete, local-first behaviour trace are most useful on real local and staging applications.

## Install and test

1. The owner downloads `reprolens-v0.11.0-beta.1.zip` from **Assets** below. Do not use GitHub's source-code archives.
2. The owner sends the ZIP directly to each selected tester through a private, access-controlled channel.
3. The tester begins with `START_HER.md` inside the ZIP and returns completed forms through the same private channel.

Testers do not need or receive GitHub repository access.

## Changes in this build

- Renames the product to ReproLens across the extension, exports, documentation, tester package, and release archive.
- Records a complete user journey of up to 30 supported interactions for up to two minutes on one approved website.
- Turns completed evidence into a locally redacted Markdown/JSON bug report with reproduction steps and expected/actual behaviour.
- Opens a reviewable GitHub issue draft without requesting or storing a GitHub token; the extension never submits the issue.
- Generates a Playwright test skeleton with captured selectors, non-production placeholders for private values, and a visible-result assertion when the trace supports one.
- Records click/tap, keyboard, input-change, form-submit, and drop interactions with automatic detection by default; field, key, and drop payload values are not captured.
- Explains HTTP errors, browser transport failures, CORS blocks, cancellations, and common JavaScript error types with a concrete first check.
- Shows a privacy-safe React component path, prop names/types, and state shape without capturing values.
- Captures request/error/handler metadata inside supported Worker and cross-origin iframe contexts without reading Worker messages or iframe body content.
- Adds names, search, quality/problem filters, and two-trace comparison to local history.
- Adds an optional Chrome on-device AI second opinion over the exact redacted input shown to the user; there is no cloud fallback.
- Adds local per-trace usefulness and clarity feedback with redaction, download, and clear controls.
- Labels what ratings 1 and 5 mean, enlarges the rating and feedback controls, and visually distinguishes download from destructive clearing.
- Replaces the generic unavailable-AI message with browser-, profile-, model-, storage-, and hardware-specific next checks.
- Retains the progressive layout, explicit evidence labels, complete technical trace, safe exports, per-website access, and local-only processing.
- Expands automated browser validation from 26 to 31 scenarios and verifies the new history, feedback, accessibility, narrow-panel, and 200% text flows.
- Fixes narrow-panel wrapping for ratings and long comparison values at 200% text size in headful Linux Chrome.
- Keeps the demo background continuous when navigating between successful and failed request pages.

Chrome asks for access to each website when it is first selected. Approve only a local or staging website you are authorized to inspect.

## Safety

Do not test with production customer data. Never share credentials, cookies, tokens, private keys, raw traces, or an export you have not reviewed. The extension processes and stores traces locally and does not upload analytics.
