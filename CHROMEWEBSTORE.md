# Chrome Web Store listing — ReproLens Beta

> Last updated: 10 September 2026

Status: **version 0.11.0 submitted on 10 September 2026 and pending Chrome Web Store review; configured to publish automatically as an unlisted item after approval**.

Chrome Web Store draft ID: `hieconkaeihojdnoplogdcfilklglglf`

This is the single source of truth for the first unlisted Chrome Web Store beta. Copy the relevant fields into the Chrome Developer Dashboard without adding claims that are not present here.

## Store listing

**Extension name**

`ReproLens Beta`

**Short description**

`Trace a browser interaction, explain the failure, and create a privacy-reviewed bug report and Playwright test.`

**Detailed description**

```text
ReproLens Beta follows one browser interaction or short user journey and turns the observed evidence into a clear explanation, privacy-reviewed bug report, and Playwright test starting point.

THIS EXTENSION IS FOR BETA TESTING.

FEATURES
• Connect a selected click, keyboard action, input change, form submission, or drop to relevant page code, requests, errors, navigation, and visible page changes.
• Explain an exact failed request or JavaScript error, what it means, and the first relevant debugging check.
• Separate directly connected evidence from events that were only observed afterward.
• Record a short journey and build ordered reproduction steps.
• Review a locally redacted Markdown or JSON bug report before copying or downloading it.
• Open a prefilled GitHub issue draft without storing a GitHub token or submitting the issue automatically.
• Generate a Playwright regression-test starting point with placeholders for uncaptured private input.
• Keep, name, search, compare, import, and delete a bounded local trace history.

HOW TO USE
1. Click ReproLens in the Chrome toolbar to open the side panel.
2. Choose a one-step trace or user journey.
3. Approve access to the current website when Chrome asks.
4. Select the relevant element and perform the interaction once.
5. Read What happened, then open the technical trace only when you need deeper evidence.
6. Review every report or test before copying, downloading, or opening a GitHub draft.

PRIVACY
ReproLens has no backend, analytics, advertising, account system, or automatic upload. Trace processing, history, feedback, and redaction stay in the browser. Website access is requested one origin at a time after a direct user action and can be revoked in Chrome settings. Request and response bodies, headers, cookies, typed characters, form values, and debugger scopes are not intentionally captured.

WHY CHROME SHOWS A DEBUGGING BANNER
Chrome displays its standard debugging banner during a short user-started trace. This temporary access is needed to connect runtime errors, request metadata, source locations, and navigation to the selected interaction. Capture stops automatically.

SUPPORT
Report a public-safe beta problem or request a guided test at:
https://github.com/J-Jessen/reprolens-chrome-extension/issues/new/choose

Never post credentials, private URLs, customer data, raw traces, or unreviewed exports. Use GitHub private vulnerability reporting for a possible security or privacy exposure.

Version 0.11.0 — Public beta with single- and multi-step tracing, diagnostic explanations, local history, reviewed reports, GitHub drafts, and Playwright test generation.
```

**Category**

`Developer Tools`

**Single purpose**

`Turn a user-started browser interaction into reproducible, privacy-reviewed debugging evidence.`

**Primary language**

`English`

## Graphics and assets

| Asset | Dimensions | Status | Filename |
|---|---:|---|---|
| Store icon | 128×128 PNG | Ready | `icons/reprolens-icon-128.png` |
| Screenshot 1 | 1280×800 PNG | Ready | `store-assets/store-screenshot-failure.png` |
| Screenshot 2 | 1280×800 PNG | Ready | `store-assets/store-screenshot-success.png` |
| Screenshot 3 | 1280×800 PNG | Ready | `store-assets/store-screenshot-report.png` |
| Small promo tile | 440×280 PNG | Ready | `store-assets/small-promo-tile.png` |
| Marquee promo tile | 1400×560 | Not required for beta | — |

### Screenshot notes

1. The supplied demo beside the actual explanation for an intentional `404 Not Found` request.
2. The supplied demo beside an actual successful request trace.
3. The same failed trace scrolled to the evidence chain and safe-report workflow.

The screenshots contain no promotional overlays, private websites, customer data, credentials, or unsupported feature claims. Recreate them with `npm run capture:marketing` whenever the side-panel interface changes.

## Permission justifications

| Permission | Type | Justification |
|---|---|---|
| `alarms` | permissions | Enforces automatic time limits for short traces and user journeys even if Chrome suspends and restarts the extension between actions. |
| `debugger` | permissions | During a short user-started trace, observes source locations, runtime errors, request metadata, navigation, and supported asynchronous execution needed to explain what followed the selected interaction. ReproLens detaches automatically when capture ends. |
| `scripting` | permissions | Adds the element selector and its stylesheet only after the user starts a trace and grants the current website access. |
| `sidePanel` | permissions | Displays trace controls, explanations, local history, reviewed reports, and generated test output in Chrome's side panel. |
| `storage` | permissions | Keeps preferences, bounded trace history, optional beta feedback, and privacy-sanitized current-session state locally in the extension. |
| `tabs` | permissions | Identifies the active tab and its URL so ReproLens can ask for the exact website origin and associate evidence with the correct tab. |
| `http://*/*` | optional host permission | Lets the user grant one explicitly selected HTTP origin for a local or authorized test site. There is no required host access or always-on page recorder. |
| `https://*/*` | optional host permission | Lets the user grant one explicitly selected HTTPS origin for an authorized website. ReproLens does not silently expand access to other origins. |

## Privacy and data use

**Does the extension handle user data?** Yes. It handles the minimum website and interaction evidence needed for a user-started trace. The developer does not receive this data.

| Data type | Handled? | Automatically transmitted off-device? | Purpose | Shared with third parties? |
|---|---|---|---|---|
| Personally identifiable information | No | No | Not used | No |
| Health information | No | No | Not used | No |
| Financial information | No | No | Not used | No |
| Authentication information | No | No | Intentionally excluded and redacted from exports | No |
| Personal communications | No | No | Message contents are not captured | No |
| Location | No | No | Not used | No |
| Web history | Yes | No | Page, navigation, request, WebSocket, and source-map URLs observed only during a user-started trace | Only if the user explicitly opens a reviewed GitHub draft containing a URL |
| User activity | Yes | No | Record the selected interaction or bounded journey without typed or submitted values | Only through an explicit reviewed export action |
| Website content | Yes | No | Selected-element context and summaries of visible changes needed to explain the result | Only through an explicit reviewed export action |

### Data-use certification

- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to the extension's single purpose.
- [x] Data is not used for creditworthiness or lending purposes.
- [x] Data is not transferred to the developer automatically.
- [x] There is no analytics, advertising, account system, or cloud AI fallback.

The dashboard disclosure must match [PRIVACY.md](PRIVACY.md) and the live privacy page exactly.

## Privacy policy

**Privacy policy URL**

`https://j-jessen.github.io/reprolens-chrome-extension/privacy.html`

## Distribution

- Visibility: `Unlisted`
- Regions: `All regions`
- Testing label: The manifest name ends in `Beta`, and the detailed description states that the extension is for beta testing.

An unlisted item can be installed by anyone with its Chrome Web Store URL but does not appear in store search results.

## Developer information

- Publisher name: `ReproLens`
- Contact email: `CPHAutomations@gmail.com` (verified in the dashboard)
- Support URL: `https://github.com/J-Jessen/reprolens-chrome-extension/issues/new/choose`
- Homepage URL: `https://j-jessen.github.io/reprolens-chrome-extension/`

## Reviewer test instructions

1. Install the submitted package in desktop Chrome 118 or newer.
2. Open `https://j-jessen.github.io/reprolens-chrome-extension/demo/failure.html`.
3. Click the extension action to open the side panel.
4. Choose **Select element for one-step trace**, approve access to that website, and select **Send failing request**.
5. Leave **Detect automatically** selected, choose **Record selected interaction**, and select the page button once.
6. Expect Chrome's standard debugging banner for approximately 3.5 seconds.
7. Confirm that **What happened** identifies the `404 Not Found` request, explains its meaning, names a first check, and separates directly connected evidence from later observations.
8. Open **Technical trace** and confirm that timing, source locations, evidence labels, and filters remain available.
9. Open `https://j-jessen.github.io/reprolens-chrome-extension/demo/multi-step.html`, start a user journey, and perform the three instructed interactions.
10. Stop the journey, add dummy expected and actual behaviour, and build the safe report.
11. Confirm that the Markdown, JSON, GitHub-draft, and Playwright controls remain disabled until the report preview is built.
12. Review the report, download the Playwright test, and confirm that the dummy input value is replaced with a visible placeholder.
13. Enter `J-Jessen/reprolens-chrome-extension` as the test repository and confirm that GitHub opens an unsubmitted issue draft without requesting a token.
14. Confirm under Chrome's extension settings that access can be revoked for the demo origin.

No account, payment, customer data, production website, or special hardware is needed. The deterministic explanation works without the optional on-device model.

## Packaging and verification

Create the exact upload package with:

```bash
npm run check
npm run test:e2e
npm run package:cws
unzip -t artifacts/reprolens-cws-v0.11.0.zip
```

Upload `artifacts/reprolens-cws-v0.11.0.zip`. The package contains only the files explicitly listed in `scripts/package-extension.js`. It excludes repository metadata, demos, tests, source maps, documentation, development dependencies, and this submission file.

## Final submission checklist

- [x] Manifest V3 with a narrow single purpose.
- [x] Extension name matches the listing.
- [x] All permissions and optional host access are individually justified.
- [x] Website access is optional and granted per origin.
- [x] Runtime icons exist at every declared size.
- [x] Three current 1280×800 screenshots and a 440×280 promo tile exist.
- [x] Public beta site and privacy-policy source are ready for deployment.
- [x] Reviewer test steps use a safe, public demo.
- [x] Reproducible runtime-only Web Store package command exists.
- [x] Register or select the permanent Chrome Web Store developer account (`ReproLens`).
- [x] Enable two-step verification on that Google account.
- [x] Choose and verify the monitored public support email.
- [x] Confirm the public beta site and privacy URL after GitHub Pages deployment.
- [x] Run the reviewer workflow against the exact ZIP in a clean Chrome profile.
- [x] Upload the exact version 0.11.0 ZIP to the Chrome Web Store draft.
- [x] Complete and save the privacy questionnaire.
- [x] Save the unlisted distribution settings and reviewer test instructions.
- [x] Upload the required 128×128 store icon and all three current screenshots.
- [x] Review the final draft and submit it for review.

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| `0.11.0` | 10 September 2026 | Submitted the verified runtime-only package, listing, required store media, privacy disclosures, unlisted distribution settings, and reviewer instructions to the Chrome Web Store. | Pending review |
| `0.10.0` | 6 September 2026 | Added multi-step recording, reviewed bug reports, GitHub drafts, and Playwright test generation. | GitHub beta |
| `0.9.0` | 6 September 2026 | Added expanded diagnostics, local feedback, history comparison, and optional on-device explanation. | GitHub beta |

## Known limitations and review notes

- Chrome displays its standard debugging banner during a trace.
- Opening DevTools on the same tab detaches ReproLens's temporary debugging session.
- Browser evidence can prove some relationships directly; events observed only in the same short time window remain labelled as observations.
- Source locations depend on what the page and its source maps expose.
- The optional on-device explanation is unavailable on unsupported Chrome versions, devices, profiles, and other Chromium browsers. The deterministic explanation remains available.
- There is no rejection history because the item has not been submitted.
