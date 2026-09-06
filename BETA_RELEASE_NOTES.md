# Behaviour Tracer v0.9.0-beta.1

This private beta tests which parts of a more complete, local-first behaviour trace are most useful on real local and staging applications.

## Install and test

1. The owner downloads `behaviour-tracer-v0.9.0-beta.1.zip` from **Assets** below. Do not use GitHub's source-code archives.
2. The owner sends the ZIP directly to each selected tester through a private, access-controlled channel.
3. The tester begins with `START_HER.md` inside the ZIP and returns completed forms through the same private channel.

Testers do not need or receive GitHub repository access.

## Changes in this build

- Records click/tap, keyboard, input-change, form-submit, and drop interactions with automatic detection by default; field, key, and drop payload values are not captured.
- Explains HTTP errors, browser transport failures, CORS blocks, cancellations, and common JavaScript error types with a concrete first check.
- Shows a privacy-safe React component path, prop names/types, and state shape without capturing values.
- Captures request/error/handler metadata inside supported Worker and cross-origin iframe contexts without reading Worker messages or iframe body content.
- Adds names, search, quality/problem filters, and two-trace comparison to local history.
- Adds an optional Chrome on-device AI second opinion over the exact redacted input shown to the user; there is no cloud fallback.
- Adds local per-trace usefulness and clarity feedback with redaction, download, and clear controls.
- Retains the progressive layout, explicit evidence labels, complete technical trace, safe exports, per-website access, and local-only processing.
- Expands automated browser validation from 26 to 31 scenarios and verifies the new history, feedback, accessibility, narrow-panel, and 200% text flows.

Chrome asks for access to each website when it is first selected. Approve only a local or staging website you are authorized to inspect.

## Safety

Do not test with production customer data. Never share credentials, cookies, tokens, private keys, raw traces, or an export you have not reviewed. The extension processes and stores traces locally and does not upload analytics.
