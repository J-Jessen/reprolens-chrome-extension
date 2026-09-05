# Behaviour Tracer PoC

Current build: **0.7.0**

Private beta: **v0.7.0-beta.1**

A local-first Chrome Manifest V3 proof-of-concept for the product hypothesis:

> Select an element → perform one interaction → inspect what happened.

This is an instrumentation experiment, not a production extension. It tests whether a useful trace can be assembled from a selected DOM element, JavaScript event-listener pauses, network traffic, runtime exceptions, navigation, and DOM mutations.

## What the current build does

1. Requests persistent access only to the current website when the user selects an element, then injects the picker on demand.
2. Arms a single-click trace from the side panel.
3. Attaches Chrome DevTools Protocol through `chrome.debugger`.
4. Pauses and immediately resumes at click event listeners, retaining useful call frames.
5. Observes requests, responses, console warnings/errors, exceptions, top-frame navigation, and DOM mutations for 3.5 seconds.
6. Builds a chronological timeline with explicit causality confidence.
7. Resolves available source maps locally and shows authored source locations.
8. Detects the nearest owning React component without exporting props or state.
9. Instruments `setTimeout` scheduling and callbacks with asynchronous call stacks. If Chrome does not expose the experimental CDP breakpoint domain, a temporary local MAIN-world hook is used automatically.
10. Produces a deterministic summary and schema-versioned, privacy-sanitized JSON export.
11. Scores trace coverage and shows concrete diagnostics for missing evidence, incomplete responses, timer fallbacks, and source-map failures.
12. Labels every observed network event as same-origin, cross-origin, or unknown-origin relative to the traced page.
13. Builds a deterministic primary chain from explicit event relationships, offers a dedicated filter, and keeps timing-only correlations outside that chain.
14. Keeps up to 25 completed traces within a 5 MB local budget, with visible usage, automatic oldest-first eviction, history disable, delete, clear, and version-validated JSON import controls.
15. Provides reviewed, automatically redacted JSON downloads and redacted Markdown reports.
16. Correlates Promise-parented network initiators and privacy-safe WebSocket lifecycle/frame metadata without storing message content.
17. Uses trace schema version 2 with explicit relationship, capture-method, and privacy metadata plus local migration of version 1 imports.

All trace processing is local. The current build has no backend, analytics, login, or AI call.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Run `npm run build`, then choose **Load unpacked** and select the generated `dist` directory. A GitHub release archive can be extracted and loaded the same way.
4. Open a normal website and click the extension icon to open its side panel.
5. Choose **Select element** and approve that website the first time. Previously approved websites do not prompt again.

Chrome will show a debugging banner while a 3.5-second trace is active. This is expected: deep runtime tracing requires the `debugger` permission.

## Run the deterministic demo

Run this command from the project root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

Then open exactly `http://127.0.0.1:4173/`, select **Complete order**, choose **Record one click**, and click the button again.

Expected evidence:

- a direct click interaction;
- one or more click-listener frames, including `submitOrder` when Chrome exposes that frame;
- `GET /order.json?traceDemo=1` and its `200` response;
- button and result DOM mutations.

## Run the React delegation demo

The second test target uses React 19 with a delegated `onClick`, an authored async handler, a fetch request, and a timer-delayed state update.

```bash
python3 -m http.server 4175 --bind 127.0.0.1 --directory demo-react
```

Open `http://127.0.0.1:4175/`, select **Complete React order**, record one click, and click it again.

Expected evidence:

- a direct click interaction;
- React's delegated event dispatcher as the browser listener boundary;
- `handleReactCheckout` in the request initiator stack;
- `GET /order.json?reactTrace=1` and its `200` response;
- `setTimeout scheduled · handleReactCheckout()` followed by `setTimeout callback · applyConfirmedOrder()`;
- immediate React state mutations followed by a delayed final render around 280 ms later.

The checked-in `app.js.map` maps the handler, timer schedule, and callback frames back to `src/main.jsx` when Chrome exposes those generated frames.

## Run the validation corpus

The automated corpus starts a fixture server and headless Chrome, loads the unpacked extension, runs all 26 interactions, and evaluates each captured trace:

```bash
npm run test:e2e
```

The full matrix and fixed pass criteria are in `CORPUS.md`. Set `CORPUS_CASE` to an ID from that file to run a single scenario.

## Test

```bash
npm test
```

GitHub Actions runs the same test suite and rebuilds the checked-in React demo on every push and pull request.
After the tests pass, CI also creates an installable `behaviour-tracer-extension` artifact containing runtime files only. A matching `v*` tag creates a GitHub release archive automatically.

The private beta plan, recruitment messages, tester instructions, and repository access guide are in `BETA.md`, `TESTER_RECRUITMENT.md`, `BETA_TEST_GUIDE.md`, and `GITHUB_SHARING_GUIDE.md`.
Privacy and security details are documented in `PRIVACY.md` and `SECURITY.md`. Contribution and verification requirements are in `CONTRIBUTING.md`.
The versioned export contract and migration rules are documented in `TRACE_SCHEMA.md`.

## Project structure

- Extension runtime: root-level `manifest.json`, service worker, content script, side panel, and trace modules.
- `tests/`: deterministic Node tests for trace normalization, source maps, privacy, React ownership, and corpus evaluation.
- `demo/`: native listener and successful fetch target.
- `demo-react/`: React delegation, fetch, timer, and source-map target.
- `demo-corpus/`: deterministic mutation, timer, network, error, navigation, and minification fixtures.
- `e2e/`: the browser runner that drives the extension without manual interaction.
- `CORPUS.md`: automated validation matrix and current go/no-go evidence.

## Known limits

- A request is “direct” only when its CDP initiator stack matches a captured click-handler frame. The primary chain follows explicit parent relationships; timing-only correlations remain visible but are excluded. Time proximity is not proof of causality.
- Framework event delegation can expose a framework dispatcher rather than the authored handler.
- Available source maps are fetched and applied locally. Missing, inaccessible, malformed, or unsupported maps fall back to deployed JavaScript locations.
- Timer capture prefers CDP instrumentation. On Chrome builds without `EventBreakpoints`, the extension temporarily wraps the page's MAIN-world `setTimeout` during the trace and restores it on completion or automatically after 10 seconds.
- Public state and copied JSON retain function names, deployed locations, source-mapped locations, and async parents, but remove CDP `callFrameId`, scope objects, receiver objects, and return values.
- Promise continuations, queued microtasks, `setTimeout`, `setInterval`, and `requestAnimationFrame` boundaries are explicit when the browser or trace-scoped fallback exposes them. Worker and WebSocket lifecycle/message direction are captured without content; code running inside Workers is not yet inspected.
- Same-document History API and fragment navigation are captured through `Page.navigatedWithinDocument` when the connected Chrome build exposes that experimental event.
- Cross-origin iframes and browser-internal pages are outside this PoC.
- Site access is granted to one exact HTTP or HTTPS origin at a time. Cross-origin source maps may remain unavailable until their own host is explicitly supported; tracing does not silently expand access.
- Opening DevTools on the traced tab detaches `chrome.debugger`.
- The extension declares HTTP and HTTPS hosts as optional and requests only the active website from a direct **Select element** or **Record one click** action. Chrome's extension settings can revoke previously granted sites.

## Go/no-go test

Run the PoC against a test corpus of at least 20 interactions:

- native DOM listener;
- React delegated listener;
- async fetch success/failure;
- timer-delayed mutation;
- client-side navigation;
- production/minified bundle with and without source maps.

Proceed only if at least 80% produce a trace that saves a developer meaningful manual inspection. If the output repeatedly collapses to HTML/CSS plus unrelated requests, stop or narrow the product to owned/local codebases.
