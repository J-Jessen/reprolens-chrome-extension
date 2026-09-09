# ReproLens public beta promotion kit

Use the official release link in every post:

https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.4

Use the public beta page when the reader should understand the product before downloading:

https://j-jessen.github.io/reprolens-chrome-extension/

Use `assets/reprolens-social-preview.png` as the share image. Do not ask for upvotes. Ask for one concrete test and honest feedback.

## Core description

ReproLens is a local-first Chrome extension that records one browser interaction or short user journey, explains the related handlers, requests, asynchronous work, navigation, and page changes, then builds a privacy-reviewed bug report and Playwright test skeleton.

## Reddit: r/BetaTests and r/betatesters

### Title

Looking for frontend and QA testers: turn one browser interaction into a bug report and Playwright test

### Post

I am looking for developers and QA engineers to test ReproLens, a public-beta Chrome extension for debugging browser behaviour.

Select an element, perform one interaction, and ReproLens builds a local explanation and timeline covering JavaScript handlers, requests, asynchronous work, navigation, and visible page changes. It can also turn a short journey into a privacy-reviewed bug report and Playwright test skeleton.

The first test takes about 15 minutes and does not require your own project:

1. Diagnose one failure in the supplied safe demo.
2. Install the unpacked extension from the official release ZIP.
3. Trace the same failure with ReproLens.
4. Tell me whether it improved your diagnosis and first debugging step.

See the product: https://j-jessen.github.io/reprolens-chrome-extension/

Volunteer for a guided 15-minute session: https://github.com/J-Jessen/reprolens-chrome-extension/issues/new?template=guided-beta-session.yml

Please use only the supplied local demo or a local/staging site you are authorized to inspect. Do not use production or customer data. Traces are processed locally with no automatic upload or analytics.

There is no reward for a positive review. I am looking for specific, critical feedback about what is useful, confusing, or untrustworthy.

## Indie Hackers

### Title

You test ReproLens, I test yours — looking for honest developer-tool feedback

### Post

I have opened the public beta of ReproLens, a local-first Chrome extension that follows one browser interaction through handlers, requests, asynchronous work, and page changes, then creates a reviewed bug report and Playwright test skeleton.

I am looking for frontend, full-stack, and QA builders who can run a focused 15-minute comparison and tell me where the explanation is useful, confusing, or untrustworthy. I am happy to exchange a focused test of your product in return.

See the product and safe demo: https://j-jessen.github.io/reprolens-chrome-extension/

Please test only on local or staging systems and never share production/customer data or an unreviewed trace.

## r/webdev Showoff Saturday

### Title

Showoff Saturday: I built a local-first MV3 tool that traces a click into a bug report and Playwright test

### Post

I have been building ReproLens to test whether browser debugging evidence can be made understandable without pretending that timing proves causality.

The extension uses a user-started `chrome.debugger` session to observe handler frames, request metadata, runtime errors, navigation, asynchronous boundaries, and DOM mutations. It labels direct browser evidence separately from events that were merely observed in the same trace window. Request/response bodies, headers, cookies, form values, and debugger scopes are intentionally excluded.

A trace can become a locally redacted Markdown/JSON bug report and a Playwright test skeleton. The repository includes deterministic fixtures and an automated 31-scenario browser corpus.

I would value feedback on three questions:

1. Is the default explanation clearer than inspecting the same interaction in DevTools?
2. Are the causality and confidence labels trustworthy?
3. Does the generated report or test save meaningful time?

Product, safe demo, and test links: https://j-jessen.github.io/reprolens-chrome-extension/

## Show HN

### Title

Show HN: ReproLens – turn browser interactions into bug reports and Playwright tests

### First comment

I built ReproLens because browser bug reports often describe only the visible symptom, while the useful evidence is split across event listeners, Network, Console, source maps, and page changes.

ReproLens records one user-started interaction or short journey and assembles that evidence locally. Its default explanation is deterministic and conservative: direct relationships are separated from timing-only observations. It can then generate a reviewed bug report and Playwright test skeleton without uploading a trace or storing a GitHub token.

The public site includes a safe demo and short walkthrough; the repository includes the extension release ZIP and automated browser corpus. I would especially value feedback from frontend and QA engineers about explanation accuracy, installation friction, and whether the generated artifacts are actually useful.

https://j-jessen.github.io/reprolens-chrome-extension/

## Personal message

Hi [name] — I have opened the public beta of ReproLens, a Chrome debugging extension that turns one browser interaction into a plain-language explanation, technical trace, safe bug report, and Playwright test skeleton.

Would you be willing to join a focused 15-minute screen-share and tell me whether it improves your diagnosis and first debugging step? You only use the supplied safe demo. There is no signup, backend, analytics, or automatic upload:

https://j-jessen.github.io/reprolens-chrome-extension/

Please use only the supplied demo or a local/staging site you are authorized to inspect.

## Posting sequence

1. Post once in `r/BetaTests` and once in `r/betatesters`, adapting the opening sentence to each community.
2. Send 10 personalized messages to relevant frontend, full-stack, and QA contacts over two days.
3. Offer a genuine product-testing exchange on Indie Hackers.
4. Publish the technical version on the next `r/webdev` Showoff Saturday.
5. Use Show HN after at least three independent testers complete the 10-minute flow without setup help.
6. Prepare Product Hunt only after the first feedback-driven fixes, testimonials, and accurate product screenshots are ready.

Respond to every useful report within one day. Ask one follow-up question at a time, never pressure someone to share a trace, and record only aggregate tester progress in the public repository.
