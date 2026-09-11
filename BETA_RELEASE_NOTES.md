# ConsoleHawk v0.11.1-beta.1

This public beta introduces the ConsoleHawk name and tests which parts of a more complete, local-first behaviour trace are most useful on real local and staging applications.

## Install and test

1. Download `consolehawk-v0.11.1-beta.1.zip` from **Assets** below. Do not use GitHub's source-code archives.
2. Extract the ZIP and begin with `START_HERE.md` inside the package.
3. Submit sanitized bugs and feedback through the repository's issue forms, or contact the owner privately if a report contains a security or privacy concern.

No GitHub account is required to download the release. A GitHub account is required only to open a public issue or pull request.

## Changes in this build

- Renames the product from ReproLens to ConsoleHawk across the extension, exports, documentation, tester package, public website, repository, media, and release archive.
- Prevents multi-step traces from timing out when Chrome pauses in an interaction handler by resuming the debugger before processing the captured evidence.
- Adds a responsive public beta page with a hosted safe demo, actual product screenshots, a captioned 48-second walkthrough, privacy policy, and focused call to action.
- Adds a 15-minute moderated comparison, guided-session signup, five-day recruitment sequence, and an acquisition scorecard so response rate is measured separately from product value.
- Prepares a Chrome Web Store package, exact-size extension icons, current listing copy, permission justifications, privacy disclosures, reviewer steps, and compliant store images.
- Adds automated desktop, mobile, accessibility, missing-resource, link, and video checks for the public beta site.
- Opens the repository and versioned release for public beta testing while retaining owner-only write access to `main`.
- Adds public issue-based beta reporting, private security-reporting guidance, and explicit evaluation-only source terms.
- Keeps every tester-facing document, recruitment message, and repository access instruction consistently English.
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
