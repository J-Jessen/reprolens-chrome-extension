# Behaviour Tracer architecture

## Product boundary

The proof of concept is organized around one claim:

> For one user click, can the browser automatically assemble a useful, honest behavioural trace?

It deliberately excludes authentication, teams, cloud storage, AI explanations, integrations, screenshot editing, responsive tools, and general-purpose DevTools features. It retains only bounded, user-controlled local trace history.

## Runtime components

```text
Website
  └─ content.js + content.css (injected on demand after an optional per-origin grant)
     ├─ element picker
     ├─ interaction marker
     └─ MutationObserver
            │ runtime messages
            ▼
background.js (MV3 service worker)
  ├─ trace session state machine
  ├─ chrome.debugger / CDP
  │  ├─ DOMDebugger: click listener breakpoint
  │  ├─ EventBreakpoints/DOMDebugger: timer instrumentation when available
  │  ├─ Runtime: trace-scoped MAIN-world timer fallback
  │  ├─ Debugger: paused call frames
  │  ├─ Debugger: asynchronous call stacks
  │  ├─ Network: requests, responses, and initiator stacks
  │  ├─ Runtime/Log: exceptions and console warnings/errors
  │  └─ Page: top-frame and same-document navigation
  └─ trace-core.js
     ├─ normalization
     ├─ local source-map resolution
     ├─ privacy-safe React component detection
     ├─ confidence scoring
     ├─ explicit relationship graph and deterministic primary chain
     ├─ chronological timeline
     └─ deterministic summary
            │ state updates
            ▼
panel.html / panel.js
  ├─ plain-language explanation (default)
  ├─ progressively disclosed technical trace
  └─ reviewed JSON and Markdown export
```

## Session state machine

```text
idle → selected → attaching → armed → recording → processing → complete
                         └──────────────────────────────→ error
```

- `selected`: picker has returned stable element metadata.
- `armed`: debugger is attached and click listener breakpoint is active.
- `recording`: the content script observed the next click; the 3.5-second window is running.
- `processing`: debugger detaches and evidence is normalized.
- `complete`: immutable timeline is ready for display/export.

The raw active session remains in service-worker memory because it contains short-lived CDP metadata. Chrome 118+ keeps the worker alive while `chrome.debugger` is attached. A privacy-sanitized snapshot of visible selected, completed, or error state is stored in `chrome.storage.session` so the panel can recover after a later worker restart; raw debugger objects and script inventory are never persisted there.

## Evidence model

Each timeline item contains:

```json
{
  "id": "network-0",
  "kind": "request",
  "atMs": 70,
  "title": "POST https://example.test/api/cart",
  "detail": "Fetch",
  "parentId": "handler-0",
  "relationType": "request-from-handler",
  "relationshipEvidence": "explicit",
  "primaryChain": true,
  "confidence": 0.88,
  "confidenceLabel": "strong"
}
```

Confidence semantics:

- `direct / 100%`: the browser instrumented the interaction, listener boundary, or timer boundary directly.
- `strong / 70–94%`: close temporal relationship with stronger browser evidence, but no complete async lineage.
- `correlated / 40–69%`: occurred inside the trace window and may be related.
- `possible / <40%`: weak timing-only association.

The UI must never rewrite a correlated event as proven causality. The primary chain begins at the interaction and follows only explicit parent relationships with strong or direct confidence; timing-only correlations remain outside it.

Timer capture is capability-based. The service worker first attempts the current `EventBreakpoints` CDP domain, then its deprecated `DOMDebugger` predecessor. If neither exists, it installs a trace-scoped MAIN-world `setTimeout` wrapper, collects only timing metadata and error-stack locations, and restores the native function when the trace ends or after a 10-second safety timeout.

## Why the side panel

The interaction happens on the normal page, while the result remains visible beside it. A DevTools panel is intentionally avoided because a `chrome.debugger` client is detached when DevTools attaches to the same target.

## Security and privacy boundary

- No data leaves the browser in the current private beta.
- No host is granted at install time and no content script runs until the user approves the active origin.
- Captured HTML is capped at 2,000 characters.
- Text is capped at 160 characters.
- Request bodies, response bodies, cookies, headers, storage values, and form values are not captured.
- Public trace serialization removes debugger scope chains, remote object IDs, receiver objects, return values, and internal script inventory while retaining source locations and async-parent evidence.
- The debugger detaches automatically after the short trace window.

Any future network or AI feature requires a new explicit, reviewed data boundary; the current extension has neither.

## Version 0.7 foundations

- Private beta distribution that does not require tester access to the source repository.
- Semantic landmarks, native controls, visible focus, live status, dialog labelling, responsive light/dark color schemes, and reduced-motion handling.
- Safe DOM construction for imported and captured trace content; no dynamic `innerHTML` rendering.
- Static picker and badge styles in an injected stylesheet, with only geometry passed through CSS custom properties.
- Chrome 118 minimum and privacy-sanitized session-state recovery for Manifest V3 lifecycle resilience.
- Automated policy, markup, CSP, accessibility, keyboard-focus, packaging, and 26-scenario trace checks.

## Version 0.8 foundations

- A deterministic explanation model that groups evidence as user action, page code, data request, page result, navigation, and detected problems.
- Plain-language relationship labels: `Starting point`, `Direct link`, `Observed after click`, and `Limited evidence`.
- A usability-first side-panel hierarchy with the explanation visible by default and technical evidence plus export tools behind native disclosure controls.
- Narrow-panel, keyboard, light/dark, overflow, and accessibility verification against completed real traces.

## Product roadmap

0. ✅ Add timeline filters, strong-evidence emphasis, and request/response grouping.
1. ✅ Extend async lineage beyond the original `setTimeout` path with intervals, animation frames, Promise continuations, queued microtasks, and privacy-safe Worker/WebSocket lifecycles.
2. Extend the React adapter beyond component ownership only after defining safe state/props redaction.
3. ✅ Distinguish same-origin application requests from cross-origin page traffic.
4. ✅ Add trace quality diagnostics and coverage metrics.
5. Add optional AI explanation over a user-reviewed, redacted trace.

## Completed 0.2 foundations

- Trace quality and coverage diagnostics.
- Same-origin/cross-origin network classification, duration, and failure visibility.
- Timeline filtering and request/response grouping.
- Explicit redacted JSON and Markdown export with preview.
- Bounded local history with disable, deletion, clearing, and schema-validated import.
- Automated runtime packaging and tag-based GitHub releases.

## Version 0.4 foundations

- Schema version 2 with unique trace IDs and explicit event relationship, capture-method, and privacy metadata.
- Local, non-destructive migration of schema version 1 imports.
- Standalone Promise and microtask boundaries through a trace-scoped MAIN-world hook.
- Privacy-safe Worker creation and message-direction events without message content.

## Version 0.5 foundations

- Deterministic primary-chain classification from explicit parent relationships, never timing alone.
- A dedicated primary-chain timeline filter and additive relationship-evidence metadata.
- Stronger provider-token, named-credential, and private-key redaction for explicit exports.
- A visible 5 MB local-history budget in addition to the 25-trace count limit.

## Version 0.6 foundations

- Optional per-origin HTTP/HTTPS access requested from a direct user action.
- On-demand, idempotent picker injection instead of an always-on content script.
- Automated manifest-policy checks that prevent broad required host access from returning unnoticed.

## Validation harness

`demo-corpus/` provides deliberately small pages for failure, navigation, and minification edge cases. `corpus-evaluator.js` converts each copied trace into explicit pass/fail checks; `CORPUS.md` is the human-readable run matrix. This keeps the 80% go/no-go decision tied to repeatable evidence rather than subjective screenshots.
