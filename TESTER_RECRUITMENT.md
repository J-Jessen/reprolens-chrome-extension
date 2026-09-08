# Tester recruitment kit

## Where to find the first testers

Use warm, relevant contacts first. The objective is useful observation, not a large mailing list.

1. Ask 3–5 frontend or full-stack developers you already know from work, former projects, study, meetups, or professional groups.
2. Ask each suitable contact for one introduction to a developer who regularly debugs browser behaviour.
3. Post a short request in relevant frontend, React, JavaScript, QA, or test-automation communities where recruitment posts are allowed.
4. Use LinkedIn to contact people whose current role clearly matches the tester profile. Personalize the first sentence and do not mass-message.
5. Recruit the second round only after the first three testers can install and complete the core flow without a call.

Stop recruiting when 6–8 qualified testers have accepted. A small responsive group is more useful than many passive sign-ups.

## Screening questions

Ask these before sending the beta kit:

1. What is your current development or QA role?
2. Which browser frameworks do you work with most often?
3. Do you have a local or staging web application you are authorized to inspect?
4. Can you spend 45–60 minutes testing within the next seven days?
5. Are you comfortable installing an unpacked Chrome extension from a ZIP file supplied directly by the owner?
6. Will you avoid production customer data and review every exported trace before sharing it?

Qualify testers who answer yes to questions 3–6 and fit at least one role in [BETA.md](BETA.md#tester-profile).

## Copy-ready personal invitation

> Hi [name] — I am testing a new Chrome tool for frontend debugging. You select an element, perform one interaction, and receive a local explanation and timeline covering handlers, network activity, asynchronous work, and page changes.
>
> I am looking for a small group of developers and QA engineers who can spend 45–60 minutes testing a private beta on a local or staging website they are authorized to inspect. The tool does not upload traces or analytics. If you choose to share a trace, you must review the redacted export first.
>
> The test covers installation, a short demo flow, 3–5 interactions in a real project, and a structured feedback form. You do not need to fix code or have GitHub access.
>
> Would you like to participate by [date]? If so, I will send you a complete beta ZIP through a private channel.

## Copy-ready community post

> **Looking for 3–5 frontend or QA testers for a private Chrome extension beta**
>
> I am building ReproLens: record one interaction or a short user journey, understand the observed chain of JavaScript handlers, requests, asynchronous boundaries, navigation, and page changes, then create a privacy-reviewed bug report and Playwright test skeleton. Everything is processed locally; there is no automatic upload or analytics. GitHub opens only as an unsubmitted draft. We especially want to learn which parts genuinely save developers time.
>
> I am particularly looking for React, JavaScript, frontend, full-stack, and QA professionals with access to a local or staging web application. Testing takes 45–60 minutes. You receive the beta ZIP directly; repository access is not required. Production or customer data must not be used.
>
> Send me a private message with your role, primary framework, and whether you can test by [date].

## Acceptance message

> Thank you — you are a good fit for this test. I am sending the beta ZIP through our private channel. Extract it and begin with `START_HERE.md`.
>
> Use only the supplied beta version, v0.11.0-beta.2. Do not use the repository or development branch.
>
> Important: test only on local or staging systems that you are authorized to inspect. Never share raw credentials, cookies, tokens, customer data, or an export that you have not reviewed yourself.

## Follow-up after three days

> Hi [name] — a quick follow-up on the ReproLens beta. Have you been able to begin, or is installation blocked? If something stops you, complete `BETA_BUG_REPORT.md` and return it through the same private channel. You are not expected to share a trace if you are uncertain about its contents.

## Completion message

> Thank you for testing. Please return the completed `BETA_FEEDBACK_FORM.md`, even if everything worked. When the beta ends, delete the extracted folder and remove the extension through `chrome://extensions`.

## Outreach tracker

Keep personal contact data outside the repository. Track only aggregate progress here or in a private system:

| Stage | Target |
|---|---:|
| Personalized invitations sent | 10–15 |
| Qualified acceptances | 6–8 |
| Round 1 completions | 3 |
| Total completions | 4+ |
