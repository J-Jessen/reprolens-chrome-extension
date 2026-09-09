# Public beta plan

This plan turns ReproLens into a focused public product test. The extension remains local-first: it does not upload traces, analytics, or tester activity.

## Objective

Determine whether ReproLens reliably saves developers time when they need to understand what one browser interaction caused.

The expanded `0.11.0` beta also compares feature-level usefulness. Testers rate the deterministic explanation, technical evidence, React context, Worker/frame context, history comparison, multi-step recording, safe bug report, GitHub draft, Playwright output, optional local AI, and feedback flow separately so the next roadmap is based on observed value rather than feature count.

The first acquisition milestone is 40 relevant personal invitations, 8 replies, and 5 completed guided sessions. The product milestone is evaluated after those sessions; lack of response before the acquisition milestone is not treated as evidence that the product lacks value.

The beta is successful when all of these are true:

- at least 6 testers are recruited and at least 4 complete the test;
- at least 20 real interactions are tested across 3 or more codebases;
- at least 80% of submitted traces are rated useful by the tester;
- median installation and first-trace time is under 10 minutes;
- at least 80% of default explanations are understood correctly without opening the technical trace;
- median time to explain the observed behaviour is under 30 seconds after capture completes;
- at least 70% of completing testers rate the product 4 or 5 out of 5 for usefulness;
- no unredacted credentials, customer data, or other privacy incidents are shared;
- every blocking defect is either fixed or explicitly documented before a wider beta;
- every tested feature has a recorded usefulness rating or an explicit “not available/tested” result;
- the final decision names the top two features to invest in and at least one area to simplify, defer, or remove.

## Tester profile

Recruit a deliberately mixed group:

- 2 frontend developers working primarily with React;
- 1 frontend developer using another framework or plain JavaScript;
- 1 full-stack developer who regularly diagnoses browser/network behaviour;
- 1 QA or test-automation engineer;
- 1 developer unfamiliar with the project, to expose onboarding assumptions.

Prefer people who can test on a local or staging application they are authorized to inspect. Avoid production customer systems during the first round.

## Two-round schedule

### Round 1: observed acquisition, usability, and correctness

- Duration: 7 days.
- Testers: 5 people recruited through 40 personalized invitations, beginning with the founder's direct network.
- Format: focused 15-minute screen-share sessions using only the supplied public demo.
- Goal: measure response, installation, time to a correct likely cause, explanation trust, and critical trace-quality problems.
- Exit: complete five sessions using `BETA_STUDY_PROTOCOL.md` and apply the decision rules in `OUTREACH_SCORECARD.md`.

### Round 2: product value

- Duration: 7 days after Round 1 fixes.
- Testers: 3–5 additional people who did not receive live setup help.
- Goal: validate independent onboarding and usefulness on unfamiliar applications.
- Exit: evaluate the success criteria above and make a continue/narrow/stop decision.

## Operating procedure

1. Recruit testers using [TESTER_RECRUITMENT.md](TESTER_RECRUITMENT.md) and record aggregate progress in [OUTREACH_SCORECARD.md](OUTREACH_SCORECARD.md).
2. Run the first five calls using [BETA_STUDY_PROTOCOL.md](BETA_STUDY_PROTOCOL.md).
3. Collect only name or preferred contact, role, primary framework, and test availability from testers who join the structured study. Anonymous public testers may participate without providing contact details.
4. Direct every tester to the hosted safe demo. Until the Web Store beta is approved, use the official `v0.11.0-beta.4` release asset rather than a source archive or development build from `main`.
5. Ask testers to submit one sanitized public issue per defect and one final feedback issue. They may use the included Markdown forms instead if they prefer to send feedback privately.
6. Triage public reports daily using the labels `beta-bug`, `beta-feedback`, `beta-session`, `privacy-review`, and `blocked`. Remove sensitive content immediately and move security or privacy reports to GitHub's private vulnerability-reporting flow.
7. Stop a test immediately if a trace contains a secret or unauthorized personal/customer data. Remove the attachment and follow the privacy response below.
8. At the end of each round, record totals in the scorecard below and publish the go/no-go decision in a GitHub issue.

## Triage rules

| Priority | Definition | Response target |
|---|---|---|
| P0 | Credential exposure, data loss, or extension prevents normal browser use | Stop beta and respond immediately |
| P1 | Installation or core trace flow is blocked for multiple testers | Fix before the next tester |
| P2 | Trace is materially wrong, misleading, or misses common evidence | Fix or document before Round 2 ends |
| P3 | Friction, wording, visual, or uncommon compatibility issue | Add to the prioritized backlog |

Do not ask a tester to post a raw trace publicly. If evidence is required, the tester must use **Review safe export**, confirm the complete preview, and share only the minimum redacted excerpt or file needed. Security and privacy concerns belong in [private vulnerability reporting](https://github.com/J-Jessen/reprolens-chrome-extension/security/advisories/new), never a normal issue.

## Privacy response

If sensitive data is shared:

1. remove the attachment or message content as soon as possible;
2. tell the tester what was removed;
3. advise rotation of an exposed credential;
4. create a separate sanitized issue describing only the redaction failure pattern;
5. mark it `privacy-review` and block further beta testing until the failure is understood.

## Round scorecard

| Metric | Round 1 | Round 2 | Target |
|---|---:|---:|---:|
| Invited testers |  |  | 6+ total |
| Completed testers |  |  | 4+ total |
| Real interactions tested |  |  | 20+ total |
| Useful traces |  |  | 80%+ |
| Median time to first trace |  |  | <10 min |
| Explanations understood without technical trace |  |  | 80%+ |
| Median time to understand result |  |  | <30 sec |
| Usefulness ratings of 4–5 |  |  | 70%+ |
| P0 incidents |  |  | 0 |
| Open P1 blockers |  |  | 0 |

## Decision after Round 2

- **Continue:** success criteria are met; prioritize the highest-frequency P2/P3 issues.
- **Narrow:** the product is valuable only for a clear framework, environment, or debugging task; focus the roadmap there.
- **Stop and reassess:** fewer than 80% of traces are useful or the output repeatedly implies causality that the evidence does not support.
