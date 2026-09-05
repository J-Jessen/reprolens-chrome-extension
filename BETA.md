# Private beta plan

This plan turns Behaviour Tracer into a small, controlled product test. The extension remains local-first: it does not upload traces, analytics, or tester activity.

## Objective

Determine whether Behaviour Tracer reliably saves developers time when they need to understand what one browser interaction caused.

The beta is successful when all of these are true:

- at least 6 testers are recruited and at least 4 complete the test;
- at least 20 real interactions are tested across 3 or more codebases;
- at least 80% of submitted traces are rated useful by the tester;
- median installation and first-trace time is under 10 minutes;
- at least 70% of completing testers rate the product 4 or 5 out of 5 for usefulness;
- no unredacted credentials, customer data, or other privacy incidents are shared;
- every blocking defect is either fixed or explicitly documented before a wider beta.

## Tester profile

Recruit a deliberately mixed group:

- 2 frontend developers working primarily with React;
- 1 frontend developer using another framework or plain JavaScript;
- 1 full-stack developer who regularly diagnoses browser/network behaviour;
- 1 QA or test-automation engineer;
- 1 developer unfamiliar with the project, to expose onboarding assumptions.

Prefer people who can test on a local or staging application they are authorized to inspect. Avoid production customer systems during the first round.

## Two-round schedule

### Round 1: usability and correctness

- Duration: 7 days.
- Testers: 3 people from the founder's direct network.
- Goal: find installation, permission, comprehension, and critical trace-quality problems.
- Exit: no known blocker prevents a tester from installing, selecting an element, recording, reviewing, and reporting feedback.

### Round 2: product value

- Duration: 7 days after Round 1 fixes.
- Testers: 3–5 additional people who did not receive live setup help.
- Goal: validate independent onboarding and usefulness on unfamiliar applications.
- Exit: evaluate the success criteria above and make a continue/narrow/stop decision.

## Operating procedure

1. Recruit testers using [TESTER_RECRUITMENT.md](TESTER_RECRUITMENT.md).
2. Collect only name, email or preferred contact, GitHub username if repository access is needed, role, primary framework, and test availability.
3. Send the invitation message and [BETA_TEST_GUIDE.md](BETA_TEST_GUIDE.md).
4. Give each tester the same beta release. Never ask them to build from `main`.
5. Ask testers to open one GitHub issue per defect and one final beta feedback issue.
6. Triage incoming issues daily using the labels `beta-bug`, `beta-feedback`, `privacy-review`, and `blocked`.
7. Stop a test immediately if a trace contains a secret or unauthorized personal/customer data. Remove the attachment and follow the privacy response below.
8. At the end of each round, record totals in the scorecard below and publish the go/no-go decision in a GitHub issue.

## Triage rules

| Priority | Definition | Response target |
|---|---|---|
| P0 | Credential exposure, data loss, or extension prevents normal browser use | Stop beta and respond immediately |
| P1 | Installation or core trace flow is blocked for multiple testers | Fix before the next tester |
| P2 | Trace is materially wrong, misleading, or misses common evidence | Fix or document before Round 2 ends |
| P3 | Friction, wording, visual, or uncommon compatibility issue | Add to the prioritized backlog |

Do not ask a tester to post a raw trace publicly. If a trace is required, they must use **Review export**, confirm the preview, and attach only the redacted export to the private repository issue.

## Privacy response

If sensitive data is shared:

1. remove the attachment or issue content as soon as possible;
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
| Usefulness ratings of 4–5 |  |  | 70%+ |
| P0 incidents |  |  | 0 |
| Open P1 blockers |  |  | 0 |

## Decision after Round 2

- **Continue:** success criteria are met; prioritize the highest-frequency P2/P3 issues.
- **Narrow:** the product is valuable only for a clear framework, environment, or debugging task; focus the roadmap there.
- **Stop and reassess:** fewer than 80% of traces are useful or the output repeatedly implies causality that the evidence does not support.
