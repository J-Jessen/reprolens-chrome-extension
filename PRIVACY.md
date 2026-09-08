# Privacy

Last updated: 6 September 2026

ReproLens is local-first. Trace collection, source-map resolution, quality scoring, history, and export redaction run inside the browser extension. The project has no backend, analytics, account system, or automatic upload.

## Website access

The extension has no required website host permissions and no always-on content script. When the user chooses **Select element for one-step trace**, **Record selected interaction**, or **Record a user journey**, Chrome requests optional access to that exact HTTP or HTTPS origin and injects its recorder on demand. A grant persists for that website until the user revokes it in Chrome's extension settings. Access is never expanded automatically to unrelated hosts, and a journey stops if the tab leaves the granted origin.

## Data collected during a trace

- Selected element metadata, capped text, and capped outer HTML.
- JavaScript function names and source locations exposed by Chrome DevTools Protocol.
- Request URL, method, resource type, status, timing, and initiator locations.
- WebSocket URL, lifecycle, direction, opcode, and payload length; message contents are not retained.
- DOM mutation summaries, navigation URLs, console warnings, and runtime exceptions.
- Interaction type and a named control key such as Enter or Escape. Typed characters, input values, submitted form values, and dropped data are not captured.
- React component names, prop names/types, and state-slot shapes. Prop and state values are not captured.
- Worker and cross-origin iframe execution metadata plus internal request/error/handler evidence when Chrome exposes a related target. Worker messages and iframe body content are not captured.
- For a multi-step journey, up to 30 supported interaction summaries, their order, selectors, timestamps, and same-origin page URLs for up to two minutes.

Request and response bodies, HTTP headers, cookies, storage values, form values, debugger scopes, and remote runtime objects are not intentionally captured.

## Local history

Completed traces can be retained in `chrome.storage.local`, with a maximum of 25 traces and a 5 MB application budget. The oldest traces are evicted automatically when either limit is reached, and current usage is visible in the side panel. History can be disabled or cleared from the side panel. Uninstalling the extension removes its local storage according to Chrome's extension-storage behaviour.

The extension also keeps a privacy-sanitized snapshot of the current trace in `chrome.storage.session`. This allows the side panel to recover safe UI state if its Manifest V3 service worker restarts. Session storage is cleared when the browser session ends, and the snapshot for a tab is removed when that tab closes. Raw debugger objects and script metadata are not written to session storage.

## Reports, GitHub, and test generation

JSON and Markdown trace exports are explicit user actions. Bug reports additionally combine the redacted evidence with issue title, expected result, actual result, and optional notes entered by the user. Playwright output uses captured selectors but replaces uncaptured/private input with visible placeholders. The export layer masks sensitive URL parameters, email addresses, bearer/JWT-like credentials, common provider-key formats, PEM private keys, named credentials embedded in text, known secret fields, and DOM value attributes. A full report preview is shown before report-sharing controls are enabled. Pattern-based redaction cannot guarantee that every form of private data is detected, so users must review every export before sharing it.

No trace is sent anywhere automatically. Download and clipboard actions remain local. If the user explicitly chooses **Open draft GitHub issue**, the reviewed Markdown report is encoded into a GitHub issue-draft URL and is transmitted to GitHub when the new tab loads. The issue is not submitted automatically. The extension requests and stores no GitHub authentication token. Only the repository name is retained locally as a convenience.

## Optional on-device AI

The deterministic explanation works without AI. On supported Chrome 148+ desktop devices, the user may explicitly request an additional explanation from Chrome's on-device language model. The complete redacted input is shown for review before use. It contains a compact deterministic explanation, privacy-safe framework shape, and at most 40 normalized events. Model output is kept only in side-panel session storage for the current browser session. The extension has no cloud AI fallback and sends no AI prompt to the developer.

## Public-beta feedback

Usefulness rating, clarity rating, selected useful area, an optional capped comment, trace ID, and timestamp are stored only in `chrome.storage.local`. Common email and credential patterns are redacted before storage. Feedback is not uploaded; downloading it is a separate user action, and all feedback can be cleared from the side panel.
