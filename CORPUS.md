# Validation corpus

The first corpus slice contains six distinct interaction shapes. A case passes only when every evaluator check succeeds; the overall product threshold remains at least 80% useful traces across 20 or more interactions.

| ID | Scenario | Target | Status |
|---|---|---|---|
| `react-timer` | React delegated handler, fetch, timer, state render | `http://127.0.0.1:4175/` | PASS — validated on 0.1.5 |
| `native-success` | Native listener and successful fetch | `http://127.0.0.1:4173/` | PASS — 7/7 checks on 0.1.7 |
| `fetch-failure` | Handled 404 and console error | `http://127.0.0.1:4176/fetch-failure.html` | PASS — 8/8 checks on 0.1.6 |
| `navigation` | History API same-document navigation | `http://127.0.0.1:4176/navigation.html` | PASS — 6/6 checks on 0.1.6 |
| `minified-map` | Minified handler with source map | `http://127.0.0.1:4176/minified-map.html` | PASS — 6/6 checks on 0.1.7 |
| `minified-no-map` | Minified handler without source map | `http://127.0.0.1:4176/minified-no-map.html` | PASS — 6/6 checks on 0.1.7 |

For each case, select the scenario button, record one click, copy the completed JSON, save it as `trace.json`, and run:

```bash
node corpus-evaluator.js <scenario-id> trace.json
```

The command exits with status 0 only when every required piece of evidence is present and prints the failed checks otherwise.

## Round 1 result

- Executed: 6 interactions
- Passed: 6
- Useful-trace rate: 100%
- Decision: promising, but not a final go; 14 additional interactions are required to reach the predefined minimum sample of 20.
