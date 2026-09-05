# Behaviour Tracer PoC

Current build: **0.1.8**

A local-first Chrome Manifest V3 proof-of-concept for the product hypothesis:

> Select an element → perform one interaction → inspect what happened.

This is an instrumentation experiment, not a production extension. It tests whether a useful trace can be assembled from a selected DOM element, JavaScript event-listener pauses, network traffic, runtime exceptions, navigation, and DOM mutations.

## What version 0.1 does

1. Selects an element visually on any normal `http(s)` page.
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

All trace processing is local. Version 0.1 has no backend, analytics, login, or AI call.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `behaviour-tracer-poc` directory.
4. Open or reload a normal website after installing.
5. Click the extension icon to open its side panel.

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

The automated corpus starts a fixture server and headless Chrome, loads the unpacked extension, runs all 20 interactions, and evaluates each captured trace:

```bash
npm run test:e2e
```

The full matrix and fixed pass criteria are in `CORPUS.md`. Set `CORPUS_CASE` to an ID from that file to run a single scenario.

## Test

```bash
npm test
```

GitHub Actions runs the same test suite and rebuilds the checked-in React demo on every push and pull request.

## Project structure

- Extension runtime: root-level `manifest.json`, service worker, content script, side panel, and trace modules.
- `tests/`: deterministic Node tests for trace normalization, source maps, privacy, React ownership, and corpus evaluation.
- `demo/`: native listener and successful fetch target.
- `demo-react/`: React delegation, fetch, timer, and source-map target.
- `demo-corpus/`: deterministic mutation, timer, network, error, navigation, and minification fixtures.
- `e2e/`: the browser runner that drives the extension without manual interaction.
- `CORPUS.md`: automated validation matrix and current go/no-go evidence.

## Known limits

- A request is “direct” only when its CDP initiator stack matches a captured click-handler frame. Other requests are assigned lower confidence from their initiator evidence and timing. Time proximity is not proof of causality.
- Framework event delegation can expose a framework dispatcher rather than the authored handler.
- Available source maps are fetched and applied locally. Missing, inaccessible, malformed, or unsupported maps fall back to deployed JavaScript locations.
- Timer capture prefers CDP instrumentation. On Chrome builds without `EventBreakpoints`, the extension temporarily wraps the page's MAIN-world `setTimeout` during the trace and restores it on completion or automatically after 10 seconds.
- Public state and copied JSON retain function names, deployed locations, source-mapped locations, and async parents, but remove CDP `callFrameId`, scope objects, receiver objects, and return values.
- Promise continuations are retained through CDP async stacks when Chrome supplies them, but they do not yet appear as standalone timeline events. WebSockets and workers are not yet correlated.
- Same-document History API and fragment navigation are captured through `Page.navigatedWithinDocument` when the connected Chrome build exposes that experimental event.
- Cross-origin iframes and browser-internal pages are outside this PoC.
- Opening DevTools on the traced tab detaches `chrome.debugger`.
- The extension requests broad host access for the experiment, including local source-map fetching. A production version should use optional, per-site access where technically possible and explain the debugger permission before activation.

## Go/no-go test

Run the PoC against a test corpus of at least 20 interactions:

- native DOM listener;
- React delegated listener;
- async fetch success/failure;
- timer-delayed mutation;
- client-side navigation;
- production/minified bundle with and without source maps.

Proceed only if at least 80% produce a trace that saves a developer meaningful manual inspection. If the output repeatedly collapses to HTML/CSS plus unrelated requests, stop or narrow the product to owned/local codebases.
