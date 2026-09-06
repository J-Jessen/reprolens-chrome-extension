# Behaviour Tracer private beta test guide

Thank you for testing Behaviour Tracer. Plan for 45–60 minutes. You do not need to change code or investigate failures for us.

## Safety first

- Test only on a local or staging website you are authorized to inspect.
- Do not use real customer records, payment pages, health data, or other sensitive production content.
- The extension does not automatically upload traces or analytics.
- Never attach a raw trace. Use **Review safe export**, inspect the full preview, and share only the redacted export if it is genuinely needed.
- Do not paste credentials, cookies, tokens, private keys, or customer data into a feedback file or message.

Stop testing and contact the owner privately if the browser behaves abnormally or an export exposes sensitive information.

## Install the beta

1. Save the `behaviour-tracer-v0.8.0-beta.1.zip` file supplied directly by the owner.
2. Extract the ZIP into a folder you will keep for the duration of the beta.
3. Confirm that the folder contains `manifest.json`, `START_HER.md`, and this guide.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
7. Pin **Behaviour Tracer Beta** from Chrome's Extensions menu.

Behaviour Tracer requires desktop Chrome 118 or newer.

Chrome shows a debugging banner during a 3.5-second trace. This is expected. The debugger detaches automatically when the trace ends.

When you choose **Select element** on a website for the first time, Chrome asks for access to that website. Approve only the test website. Previously approved websites do not prompt again, and access can be revoked in Chrome's extension settings.

## Part A: first trace

1. Open a local or staging page with a button or link that has a visible result.
2. Open Behaviour Tracer from the toolbar.
3. Choose **Select element** and approve access to this website if Chrome asks.
4. Move over the page and click the chosen element.
5. Choose **Record one click**.
6. Perform the same interaction once.
7. Wait for the trace to complete.
8. Read **What happened** without opening **Technical trace**. In one sentence, write what you believe the interaction did.
9. Record how long it took from step 2 until you understood the result.
10. Open **Technical trace** and note whether it confirmed or changed your understanding.

Check whether the result shows the correct interaction and whether the default explanation is understandable without inspecting source code or the technical trace first.

## Part B: real-project scenarios

Test 3–5 safe interactions. Choose as many of these shapes as your application naturally contains:

| Scenario | Example | What to inspect |
|---|---|---|
| Synchronous UI change | Open/close a panel | Handler and DOM mutation |
| Successful request | Load, save, search, or validate | Request, response, duration, and initiator |
| Async update | Debounce, timer, Promise, or animation | Schedule/callback ordering and delayed DOM result |
| Client navigation | Router link, hash, or History API | Navigation event and preceding handler |
| Handled failure | Safe test endpoint returning an error | Failed/non-2xx request and visible error state |

For every interaction, answer:

1. Did the trace show the behaviour you expected?
2. Could you explain the result after reading only **What happened**?
3. Were `Direct link`, `Observed after click`, and `Limited evidence` understandable and trustworthy?
4. Did **Primary chain** contain only evidence you considered explicitly connected?
5. Was important evidence missing?
6. Did any event look unrelated or more certain than the evidence justified?
7. Were source locations usable and source-mapped when your project supplies maps?
8. Did this save time compared with your normal DevTools workflow?

## Part C: product controls

Verify these once:

- filter the trace using **Primary chain**, **Handlers**, **Network**, **App network**, **Async**, and **DOM**;
- open **Review safe export** and confirm that private-looking values are masked;
- copy a Markdown report, but do not share it if it contains anything sensitive;
- reopen a trace from local history;
- delete one history item;
- reload the extension and confirm the approved test site still works.

## Report a defect

Make a copy of `BETA_BUG_REPORT.md`, complete it for one distinct problem, and return it through the same private channel that delivered the beta. Use a concise title such as:

`[Beta] Promise callback missing after search click`

Include the beta version, Chrome version, framework, safe reproduction steps, expected result, actual result, and whether the problem repeats. A screenshot or redacted trace is optional, never required.

## Complete the beta

Complete `BETA_FEEDBACK_FORM.md` and return it through the same private channel. Submit it even if you found no defects. Report:

- number and type of interactions tested;
- time to first useful trace;
- median time to understand the default explanation;
- explanations understood without opening **Technical trace**;
- explanation clarity;
- useful traces versus total traces;
- usefulness and trust ratings;
- the most valuable part;
- the most confusing part;
- whether you would use the product again and for which task.

When finished, remove the extension from `chrome://extensions` and delete the extracted beta folder if you no longer need it.
