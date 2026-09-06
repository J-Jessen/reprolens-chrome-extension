# Validation corpus

The corpus contains 31 distinct interaction shapes. A case passes only when every evaluator check succeeds; the product threshold is at least 80% useful traces across 20 or more interactions.

| ID | Scenario | Status |
|---|---|---|
| `react-timer` | React delegated handler, fetch, timer, state render | PASS |
| `native-success` | Native listener and successful fetch | PASS |
| `fetch-failure` | Handled 404 and console error | PASS |
| `navigation` | History API same-document navigation | PASS |
| `minified-map` | Minified bundle with source map | PASS |
| `minified-no-map` | Minified bundle without source map | PASS |
| `keyboard-interaction` | Keyboard action without typed-character capture | PASS |
| `change-interaction` | Input change without field-value capture | PASS |
| `submit-interaction` | Form submission without submitted-value capture | PASS |
| `drop-interaction` | Drop event without payload capture | PASS |
| `cross-origin-iframe` | Related iframe requests and errors without frame content | PASS |
| `dom-text` | Text mutation | PASS |
| `dom-attribute` | Attribute mutation | PASS |
| `dom-add` | Node insertion | PASS |
| `dom-remove` | Node removal | PASS |
| `timer-zero` | Zero-delay timer | PASS |
| `timer-delayed` | Delayed timer | PASS |
| `timer-interval` | Repeating interval callback | PASS |
| `animation-frame` | Animation frame callback | PASS |
| `promise-chain` | Promise continuation chain | PASS |
| `queue-microtask` | Queued microtask | PASS |
| `worker-message` | Worker lifecycle plus internal request/error metadata without message content | PASS |
| `fetch-get` | Successful GET | PASS |
| `fetch-post` | Successful POST | PASS |
| `fetch-404` | Handled 404 response | PASS |
| `parallel-fetch` | Parallel requests | PASS |
| `websocket-message` | WebSocket lifecycle without message content | PASS |
| `console-warning` | Console warning | PASS |
| `sync-error` | Uncaught synchronous exception | PASS |
| `hash-navigation` | Hash navigation | PASS |
| `history-replace` | History API replacement | PASS |

Run the complete corpus locally with:

```bash
npm run test:e2e
```

The runner starts its own fixture server and headless Chrome, loads the unpacked extension, selects each target, performs the interaction, collects the trace, and evaluates every check. It exits with status 0 only when all cases pass. `CORPUS_CASE=minified-map npm run test:e2e` runs one case while debugging.

GitHub Actions runs the same end-to-end corpus on every push and pull request, so no manual browser work is required.

## Automated result

- Executed: 31 interactions
- Passed: 31
- Useful-trace rate: 100%
- Decision: the predefined minimum sample and useful-trace threshold are satisfied.
