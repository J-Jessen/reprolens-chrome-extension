# Privacy

Last updated: 6 September 2026

Behaviour Tracer is local-first. Trace collection, source-map resolution, quality scoring, history, and export redaction run inside the browser extension. The project has no backend, analytics, account system, or automatic upload.

## Website access

The extension has no required website host permissions and no always-on content script. When the user chooses **Select element** or **Record one click**, Chrome requests optional access to that exact HTTP or HTTPS origin and the extension injects its picker on demand. A grant persists for that website until the user revokes it in Chrome's extension settings. Access is never expanded automatically to unrelated hosts.

## Data collected during a trace

- Selected element metadata, capped text, and capped outer HTML.
- JavaScript function names and source locations exposed by Chrome DevTools Protocol.
- Request URL, method, resource type, status, timing, and initiator locations.
- WebSocket URL, lifecycle, direction, opcode, and payload length; message contents are not retained.
- DOM mutation summaries, navigation URLs, console warnings, and runtime exceptions.

Request and response bodies, HTTP headers, cookies, storage values, form values, debugger scopes, and remote runtime objects are not intentionally captured.

## Local history

Completed traces can be retained in `chrome.storage.local`, with a maximum of 25 traces and a 5 MB application budget. The oldest traces are evicted automatically when either limit is reached, and current usage is visible in the side panel. History can be disabled or cleared from the side panel. Uninstalling the extension removes its local storage according to Chrome's extension-storage behaviour.

The extension also keeps a privacy-sanitized snapshot of the current trace in `chrome.storage.session`. This allows the side panel to recover safe UI state if its Manifest V3 service worker restarts. Session storage is cleared when the browser session ends, and the snapshot for a tab is removed when that tab closes. Raw debugger objects and script metadata are not written to session storage.

## Export

JSON and Markdown exports are explicit user actions. The export layer masks sensitive URL parameters, email addresses, bearer/JWT-like credentials, common provider-key formats, PEM private keys, named credentials embedded in text, known secret fields, and DOM value attributes. A full JSON preview is shown before download. Pattern-based redaction cannot guarantee that every form of private data is detected, so users must review an export before sharing it.

No trace is sent anywhere by the extension.
