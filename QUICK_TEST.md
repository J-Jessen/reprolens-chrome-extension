# Try ConsoleHawk in 10 minutes

This short test uses ConsoleHawk's safe public demo. It does not require a repository clone, terminal command, production website, or customer data.

Prefer a guided first test? [Volunteer for a focused 15-minute session](https://github.com/J-Jessen/consolehawk-chrome-extension/issues/new?template=guided-beta-session.yml). Nothing needs to be installed before the call.

## 1. Install the public beta

Start a timer before downloading the ZIP. Stop it when ConsoleHawk opens successfully from the Chrome toolbar. Keep the installation time and any unclear instruction or permission prompt separate from your feedback about the trace itself.

1. Download `consolehawk-v0.11.1-beta.1.zip` from the [official release](https://github.com/J-Jessen/consolehawk-chrome-extension/releases/tag/v0.11.1-beta.1). Do not use GitHub's automatic source archive.
2. Extract the ZIP.
3. Open `chrome://extensions` in desktop Chrome 118 or newer.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Pin **ConsoleHawk Beta** from Chrome's Extensions menu.

## 2. Open the safe demo

Open the hosted [successful-request demo](https://j-jessen.github.io/consolehawk-chrome-extension/demo/) in Chrome.

If GitHub Pages is unavailable, use this local fallback from a clone of the repository:

```bash
git clone https://github.com/J-Jessen/consolehawk-chrome-extension.git
cd consolehawk-chrome-extension
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

If port 4173 is already in use, replace `4173` with `4174` in both the command and browser address.

Open `http://127.0.0.1:4173/index.html` only when using the fallback.

## 3. Record one successful request

1. Open ConsoleHawk from the Chrome toolbar.
2. Choose **Select element for one-step trace** and approve access to the demo website if Chrome asks.
3. Select **Complete order** on the demo page.
4. Leave **Detect automatically** selected.
5. Choose **Record selected interaction**.
6. Click **Complete order** again and wait for the trace to finish.
7. Before reading ConsoleHawk, look only at the demo page and write down: what happened, what you think caused it, and what you would inspect first in DevTools.

Chrome shows a debugging banner briefly while the trace is active. This is expected.

## 4. Check the result

Read **What happened** without opening **Technical trace**, then answer:

1. How did your explanation change from what you wrote before reading the trace?
2. Did the explanation connect the handler, request, and visible result clearly?
3. Did it make your first debugging check more specific?
4. Would this have saved time compared with your normal debugging workflow, or mainly added another artifact?

If you have another three minutes, repeat the same before/after exercise on the hosted [failed-request demo](https://j-jessen.github.io/consolehawk-chrome-extension/demo/failure.html) using **Send failing request**. Use `http://127.0.0.1:4173/failure.html` when running locally. Before reading ConsoleHawk, record your likely cause and first DevTools check. The explanation should identify the deliberate `404 Not Found` request and suggest a concrete first check; note exactly what it changed or clarified.

## 5. Send safe feedback

Use the repository's [beta issue forms](https://github.com/J-Jessen/consolehawk-chrome-extension/issues/new/choose). Never post credentials, cookies, tokens, private URLs, customer data, raw traces, or unreviewed exports.

Include the installation time and installation-only friction separately from the successful and failed trace before/after answers. This prevents setup problems from being mistaken for explanation problems.

For the complete 45–60 minute evaluation, continue with `BETA_TEST_GUIDE.md`. Testers who complete the full evaluation and provide honest feedback will receive 12 months of free access if ConsoleHawk launches as a paid product. The reward is for completed testing, not positive feedback.
