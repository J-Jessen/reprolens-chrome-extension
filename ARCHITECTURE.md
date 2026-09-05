# Version 0.1 architecture

## Product boundary

Version 0.1 proves one claim only:

> For one user click, can the browser automatically assemble a useful, honest behavioural trace?

It deliberately excludes authentication, teams, history, cloud storage, AI explanations, integrations, screenshot editing, responsive tools, and general-purpose DevTools features.

## Runtime components

```text
Website
  └─ content.js
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
     ├─ chronological timeline
     └─ deterministic summary
            │ state updates
            ▼
panel.html / panel.js
  └─ controls, live state, trace presentation, JSON export
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

## Evidence model

Each timeline item contains:

```json
{
  "id": "network-0",
  "kind": "request",
  "atMs": 70,
  "title": "POST https://example.test/api/cart",
  "detail": "Fetch",
  "confidence": 0.88,
  "confidenceLabel": "strong"
}
```

Confidence semantics:

- `direct / 100%`: the browser instrumented the interaction, listener boundary, or timer boundary directly.
- `strong / 70–94%`: close temporal relationship with stronger browser evidence, but no complete async lineage.
- `correlated / 40–69%`: occurred inside the trace window and may be related.
- `possible / <40%`: weak timing-only association.

The UI must never rewrite a correlated event as proven causality.

Timer capture is capability-based. The service worker first attempts the current `EventBreakpoints` CDP domain, then its deprecated `DOMDebugger` predecessor. If neither exists, it installs a trace-scoped MAIN-world `setTimeout` wrapper, collects only timing metadata and error-stack locations, and restores the native function when the trace ends or after a 10-second safety timeout.

## Why the side panel

The interaction happens on the normal page, while the result remains visible beside it. A DevTools panel is intentionally avoided because a `chrome.debugger` client is detached when DevTools attaches to the same target.

## Security and privacy boundary

- No data leaves the browser in version 0.1.
- Captured HTML is capped at 2,000 characters.
- Text is capped at 160 characters.
- Request bodies, response bodies, cookies, headers, storage values, and form values are not captured.
- Public trace serialization removes debugger scope chains, remote object IDs, receiver objects, return values, and internal script inventory while retaining source locations and async-parent evidence.
- The debugger detaches automatically after the short trace window.

Before any AI feature, version 0.2 needs a visible redaction preview and an explicit send action.

## Version 0.2, only after technical validation

1. Extend async lineage beyond the current `setTimeout` path to promises, intervals, animation frames, workers, and WebSockets.
2. Extend the React adapter beyond component ownership only after defining safe state/props redaction.
3. Distinguish first-party application requests from background page traffic.
4. Add trace quality diagnostics and coverage metrics.
5. Add optional AI explanation over a user-reviewed, redacted trace.

## Validation harness

`demo-corpus/` provides deliberately small pages for failure, navigation, and minification edge cases. `corpus-evaluator.js` converts each copied trace into explicit pass/fail checks; `CORPUS.md` is the human-readable run matrix. This keeps the 80% go/no-go decision tied to repeatable evidence rather than subjective screenshots.
