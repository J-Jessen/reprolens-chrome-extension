# ConsoleHawk 15-minute guided beta study

Use this script for the first five observed sessions. The objective is to measure whether ConsoleHawk improves a developer's first debugging decision, not whether the interface receives compliments.

## Before the call

- Use desktop Chrome 118 or newer.
- Open the [public beta page](https://j-jessen.github.io/consolehawk-chrome-extension/) and the safe demo only.
- Do not request access to the participant's work application, production data, credentials, or private source code.
- Ask before recording the call. The product test does not require a recording.
- Prepare two comparable failure tasks. Alternate their order between participants so ConsoleHawk does not always receive the second, more familiar attempt.

## Metrics

Record aggregate results without names or contact details:

- invitation source;
- installation completed without help;
- installation time;
- time to a correct likely cause with DevTools;
- time to a correct likely cause with ConsoleHawk;
- time to a usable bug report in each workflow;
- whether the first debugging check changed after reading **What happened**;
- explanation trust from 1 to 5;
- whether the participant wants to use ConsoleHawk again on an authorized local or staging project.

## Session script

### Minute 0–2: context

Say:

> Thank you for helping. I am testing the product, not you. Please think aloud and tell me whenever wording, permissions, or a result makes you hesitate. We will use only the supplied safe demo.

Ask:

1. What is your current development or QA role?
2. How often do you investigate frontend request or JavaScript failures?
3. Which browser tools do you normally check first?

### Minute 2–6: baseline task

Give the participant one safe failure and ask them to investigate it using their normal DevTools workflow.

Do not guide their debugging. Stop when they state a likely cause and first fix/check. Record time, correctness, and what evidence they used.

### Minute 6–9: installation

Ask the participant to install ConsoleHawk from the unlisted Web Store link. Until that link is approved, use the official GitHub release ZIP and record that this was the developer-mode path.

Do not help unless they are blocked. Record every hesitation separately from explanation feedback.

### Minute 9–13: ConsoleHawk task

Give the participant the comparable second failure.

Before they read ConsoleHawk, ask them to state:

1. What happened?
2. What is the likely cause?
3. What would you inspect first?

After they read **What happened**, ask the same questions. Record what changed. Then ask them to build and review the safe bug report.

### Minute 13–15: decision questions

Ask:

1. What, if anything, became faster or more specific?
2. Which statement did you trust least, and why?
3. Did ConsoleHawk save work or mainly add another artifact?
4. Would you use it again on an authorized local or staging project?
5. What is the single most important reason you might not use it?

Do not pitch or defend the product during these answers.

## Directional success thresholds after five sessions

- Four participants install without help in two minutes or less through the Web Store path.
- At least three reach the correct likely cause at least 30% faster with ConsoleHawk.
- Four understand the difference between directly connected and later-observed evidence.
- At least two ask to try ConsoleHawk again on an authorized local or staging project.
- No participant exposes production, customer, credential, or private trace data.

Five sessions are directional evidence, not a statistically significant comparison.

## Decision rules

| Result | Interpretation | Next action |
|---|---|---|
| Fewer than 8 replies from 40 relevant invitations | Target or message is weak | Rewrite the promise or narrow the role/problem |
| Replies but fewer than 5 sessions | Trust or commitment is too high | Offer a shorter call and require no preparation |
| Sessions but repeated install failure | Distribution is the blocker | Fix Web Store installation and permission explanation |
| Correct understanding but no time saved | Readability alone is insufficient | Test report and Playwright value separately |
| Faster diagnosis and repeat-use requests | Early value signal | Run five additional real-project sessions |

## After each session

Within one day:

1. Add only aggregate metrics to `OUTREACH_SCORECARD.md`.
2. Fix the most repeated onboarding problem before the next cohort when the change is low risk.
3. Send a short thank-you and, if promised, record eligibility for the founding-tester benefit privately.
4. Never publish the participant's identity, employer, application, or trace.
