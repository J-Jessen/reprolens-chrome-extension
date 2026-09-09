# ReproLens public beta test guide

Thank you for testing ReproLens. Plan for 45–60 minutes. You do not need to change code or investigate failures for us.

## Safety first

- Test only on a local or staging website you are authorized to inspect.
- Do not use real customer records, payment pages, health data, or other sensitive production content.
- The extension does not automatically upload traces or analytics.
- Never attach a raw trace. Use **Review safe export**, inspect the full preview, and share only the redacted export if it is genuinely needed.
- Do not paste credentials, cookies, tokens, private keys, or customer data into a feedback file or message.

Stop testing and contact the owner privately if the browser behaves abnormally or an export exposes sensitive information.

## Install the beta

Start an installation timer before step 1. Stop it when ReproLens opens successfully from the toolbar after step 7. Record the total time and every instruction, permission prompt, or browser message that made you hesitate. Keep this installation feedback separate from your opinion of the trace explanation.

1. Open the official [v0.11.0-beta.4 GitHub release](https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.4) and download `reprolens-v0.11.0-beta.4.zip` from **Assets**. Do not use GitHub's automatic source archive.
2. Extract the ZIP into a folder you will keep for the duration of the beta.
3. Confirm that the folder contains `manifest.json`, `START_HERE.md`, and this guide.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
7. Pin **ReproLens Beta** from Chrome's Extensions menu.

ReproLens requires desktop Chrome 118 or newer.

Chrome shows a debugging banner during a 3.5-second trace. This is expected. The debugger detaches automatically when the trace ends.

When you choose **Select element for one-step trace** or **Record a user journey** on a website for the first time, Chrome asks for access to that website. Approve only the test website. Previously approved websites do not prompt again, and access can be revoked in Chrome's extension settings.

## Part A: first trace

Use the hosted [failed-request demo](https://j-jessen.github.io/reprolens-chrome-extension/demo/failure.html) for the first trace. It uses dummy data and deliberately requests a missing local file. You can use a local or staging page that you are authorized to inspect after completing this comparable first test.

1. Open the hosted failed-request demo and, before installing or opening ReproLens, choose **Send failing request** once.
2. Open ReproLens from the toolbar.
3. Choose **Select element for one-step trace** and approve access to this website if Chrome asks.
4. Move over the page and click the chosen element.
5. Leave **Detect automatically** selected and choose **Record selected interaction**.
6. Perform the same interaction once.
7. Wait for the trace to complete.
8. Before reading ReproLens, look only at the tested page and write three short answers: what happened, what you think caused it, and what you would inspect first in DevTools.
9. Read **What happened** without opening **Technical trace**, then answer the same three questions again.
10. Record what became clearer, what changed, and whether the suggested first check became more specific.
11. Record how long it took from step 2 until you understood the result.
12. Open **Technical trace** and note whether it confirmed or changed your understanding again.

Check whether the result shows the correct interaction and whether the default explanation is understandable without inspecting source code or the technical trace first.

For the focused 15-minute moderated version of this comparison, use [BETA_STUDY_PROTOCOL.md](BETA_STUDY_PROTOCOL.md).

## Part B: real-project scenarios

Test 3–5 safe interactions. Choose as many of these shapes as your application naturally contains:

| Scenario | Example | What to inspect |
|---|---|---|
| Synchronous UI change | Open/close a panel | Handler and DOM mutation |
| Successful request | Load, save, search, or validate | Request, response, duration, and initiator |
| Async update | Debounce, timer, Promise, or animation | Schedule/callback ordering and delayed DOM result |
| Client navigation | Router link, hash, or History API | Navigation event and preceding handler |
| Handled failure | Safe test endpoint returning an error | Failed/non-2xx request and visible error state |
| Keyboard | Enter/Escape/arrow-controlled UI | Correct interaction without a typed key value |
| Field change or form submit | Safe dummy input | Correct event without submitted field values |
| Drag and drop | Dummy local item | Drop handler without dropped payload content |

For every interaction, answer:

1. Did the trace show the behaviour you expected?
2. Before reading **What happened**, what did you believe caused the result and what would you inspect first?
3. After reading **What happened**, did your explanation or first check change?
4. Could you explain the result after reading only **What happened**?
5. Were `Direct link`, `Observed after interaction`, and `Limited evidence` understandable and trustworthy?
6. Did **Primary chain** contain only evidence you considered explicitly connected?
7. Was important evidence missing?
8. Did any event look unrelated or more certain than the evidence justified?
9. Were source locations usable and source-mapped when your project supplies maps?
10. Did this save time compared with your normal DevTools workflow, or mainly create an additional artifact?

## Part C: product controls

Verify these once:

- filter the trace using **Primary chain**, **Handlers**, **Network**, **App network**, **Async**, and **DOM**;
- open **Review safe export** and confirm that private-looking values are masked;
- copy a Markdown report, but do not share it if it contains anything sensitive;
- reopen a trace from local history;
- name two traces, find/filter them, and compare them;
- on React, inspect whether component names and structural context help without exposing values;
- if **Optional on-device AI explanation** is available in Google Chrome 148+, review its exact input, generate once, and compare its value with the deterministic explanation; Brave may not expose Chrome's `LanguageModel` API, and the browser-specific fallback message is an acceptable result;
- save a usefulness and clarity rating in the in-product feedback card, then download the local feedback file and verify no private input is present;
- delete one history item;
- reload the extension and confirm the approved test site still works.

## Part D: complete bug-report workflow

Run one safe journey with at least three steps:

1. Choose **Record a user journey** before the first step.
2. Perform the steps that lead to a visible success or failure on the same approved website.
3. Choose **Stop journey and build report**. Confirm the reproduction steps are in the correct order and no typed value appears.
4. Add an issue title plus expected and actual results, then choose **Build and review safe report**.
5. Read the entire preview. Confirm private-looking URL parameters, email addresses, and named credentials are removed; do not continue if anything sensitive remains.
6. Download the Markdown report and Playwright test. Confirm the test uses `REPLACE_WITH_TEST_VALUE` or a TODO where private input was omitted.
7. If you have a disposable test repository, enter `owner/repository` and open the GitHub draft. Confirm it opens in a new background tab and is not submitted automatically. Close the draft without submitting if you do not want to create an issue.

Note whether the generated report saved meaningful time, whether the steps were reproducible, and how much editing the Playwright test needed before it could run.

## Report a defect

Open the repository's **Beta bug report** issue form for each distinct problem, or complete a copy of `BETA_BUG_REPORT.md` and send it privately to the owner. Use a concise title such as:

`[Beta] Promise callback missing after search click`

Include the beta version, Chrome version, framework, safe reproduction steps, expected result, actual result, and whether the problem repeats. A screenshot or redacted trace is optional, never required.

## Complete the beta

Open the repository's **Beta feedback** issue form, or complete `BETA_FEEDBACK_FORM.md` and send it privately to the owner. Submit it even if you found no defects. Report:

- number and type of interactions tested;
- installation time and installation-only friction;
- time to first useful trace;
- median time to understand the default explanation;
- the diagnosis and first DevTools check before versus after reading **What happened** for at least one successful and one failed trace;
- explanations understood without opening **Technical trace**;
- explanation clarity;
- useful traces versus total traces;
- usefulness and trust ratings;
- the most valuable part;
- the most confusing part;
- whether you would use the product again and for which task.

When finished, remove the extension from `chrome://extensions` and delete the extracted beta folder if you no longer need it.
