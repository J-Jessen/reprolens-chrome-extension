# Private beta plan

This plan turns Behaviour Tracer into a small, controlled product test. The extension remains local-first: it does not upload traces, analytics, or tester activity.

## Objective

Determine whether Behaviour Tracer reliably saves developers time when they need to understand what one browser interaction caused.

The expanded `0.10.0` beta also compares feature-level usefulness. Testers rate the deterministic explanation, technical evidence, React context, Worker/frame context, history comparison, multi-step recording, safe bug report, GitHub draft, Playwright output, optional local AI, and feedback flow separately so the next roadmap is based on observed value rather than feature count.

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
2. Collect only name, email or preferred contact, role, primary framework, and test availability. Testers do not receive GitHub repository access in Round 1.
3. Send the invitation message and the complete beta ZIP through a private, access-controlled channel.
4. Give each tester the same beta ZIP. Never ask them to build from `main` or download from the private repository.
5. Ask testers to return one copy of `BETA_BUG_REPORT.md` per defect and one completed `BETA_FEEDBACK_FORM.md` through the same private channel.
6. Create sanitized GitHub issues internally and triage them daily using the labels `beta-bug`, `beta-feedback`, `privacy-review`, and `blocked`.
7. Stop a test immediately if a trace contains a secret or unauthorized personal/customer data. Remove the attachment and follow the privacy response below.
8. At the end of each round, record totals in the scorecard below and publish the go/no-go decision in a GitHub issue.

## Triage rules

| Priority | Definition | Response target |
|---|---|---|
| P0 | Credential exposure, data loss, or extension prevents normal browser use | Stop beta and respond immediately |
| P1 | Installation or core trace flow is blocked for multiple testers | Fix before the next tester |
| P2 | Trace is materially wrong, misleading, or misses common evidence | Fix or document before Round 2 ends |
| P3 | Friction, wording, visual, or uncommon compatibility issue | Add to the prioritized backlog |

Do not ask a tester to post a raw trace publicly. If a trace is required, they must use **Review safe export**, confirm the preview, and return only the redacted export through the agreed private channel.

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
