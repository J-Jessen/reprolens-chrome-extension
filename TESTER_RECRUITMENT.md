# Tester recruitment kit

## Where to find the first testers

Use warm, relevant contacts first. The objective is useful observation, not a large mailing list.

1. Ask 3–5 frontend or full-stack developers you already know from work, former projects, study, meetups, or professional groups.
2. Ask each suitable contact for one introduction to a developer who regularly debugs browser behaviour.
3. Post a short request in relevant frontend, React, JavaScript, QA, or test-automation communities where recruitment posts are allowed.
4. Use LinkedIn to contact people whose current role clearly matches the tester profile. Personalize the first sentence and do not mass-message.
5. Recruit the second structured round only after the first three testers can install and complete the core flow without a call.

Stop active recruitment when 6–8 qualified testers have accepted. Additional people may still use the public beta and submit sanitized feedback.

## Screening questions

Ask structured-study participants these questions before they begin:

1. What is your current development or QA role?
2. Which browser frameworks do you work with most often?
3. Do you have a local or staging web application you are authorized to inspect?
4. Can you spend 45–60 minutes testing within the next seven days?
5. Are you comfortable installing an unpacked Chrome extension from an official GitHub release ZIP?
6. Will you avoid production customer data and review every exported trace before sharing it?

Qualify testers who answer yes to questions 3–6 and fit at least one role in [BETA.md](BETA.md#tester-profile).

## Copy-ready personal invitation

> Hi [name] — I am testing a new Chrome tool for frontend debugging. You select an element, perform one interaction, and receive a local explanation and timeline covering handlers, network activity, asynchronous work, and page changes.
>
> I am looking for developers and QA engineers who can spend 45–60 minutes testing the public beta on a local or staging website they are authorized to inspect. The tool does not upload traces or analytics. If you choose to share evidence, you must review the redacted export first.
>
> The test covers installation, a short demo flow, 3–5 interactions in a real project, and structured feedback. You do not need to fix code.
>
> Would you like to participate by [date]? The release and complete test guide are available here: https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.3

## Copy-ready community post

> **Looking for frontend and QA testers for a public Chrome extension beta**
>
> I am building ReproLens: record one interaction or a short user journey, understand the observed chain of JavaScript handlers, requests, asynchronous boundaries, navigation, and page changes, then create a privacy-reviewed bug report and Playwright test skeleton. Everything is processed locally; there is no automatic upload or analytics. GitHub opens only as an unsubmitted draft. I especially want to learn which parts genuinely save developers time.
>
> I am looking for React, JavaScript, frontend, full-stack, and QA professionals with access to a local or staging web application. Testing takes 45–60 minutes. Production or customer data must not be used.
>
> Download the public beta and begin with `START_HERE.md`: https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.3
>
> If you join the structured test, send me your role, primary framework, and whether you can test by [date]. Sanitized public feedback is also welcome through the repository's issue forms.

## Acceptance message

> Thank you — you are a good fit for this test. Download `reprolens-v0.11.0-beta.3.zip` from Assets on the official release page, extract it, and begin with `START_HERE.md`:
>
> https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.3
>
> Do not use GitHub's Source code archive or a development build from `main`.
>
> Important: test only on local or staging systems that you are authorized to inspect. Never share raw credentials, cookies, tokens, customer data, private URLs, or an export that you have not reviewed yourself.

## Follow-up after three days

> Hi [name] — a quick follow-up on the ReproLens beta. Have you been able to begin, or is installation blocked? If something stops you, use the repository's Beta bug report form or complete `BETA_BUG_REPORT.md`. You are not expected to share a trace if you are uncertain about its contents.

## Completion message

> Thank you for testing. Please submit the Beta feedback issue form or return a completed `BETA_FEEDBACK_FORM.md`, even if everything worked. When you finish, delete the extracted folder and remove the extension through `chrome://extensions` if you no longer need it.

## Outreach tracker

Keep personal contact data outside the repository. Track only aggregate progress here or in a private system:

| Stage | Target |
|---|---:|
| Personalized invitations sent | 10–15 |
| Qualified acceptances | 6–8 |
| Round 1 completions | 3 |
| Total completions | 4+ |
