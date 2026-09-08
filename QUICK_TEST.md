# Try ReproLens in 10 minutes

This short test uses ReproLens's safe local demo. It does not require a production website or customer data.

## 1. Install the public beta

1. Download `reprolens-v0.11.0-beta.3.zip` from the [official release](https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.3). Do not use GitHub's automatic source archive.
2. Extract the ZIP.
3. Open `chrome://extensions` in desktop Chrome 118 or newer.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
6. Pin **ReproLens Beta** from Chrome's Extensions menu.

## 2. Start the safe demo

Clone the repository and run its static demo server:

```bash
git clone https://github.com/J-Jessen/reprolens-chrome-extension.git
cd reprolens-chrome-extension
python3 -m http.server 4173 --bind 127.0.0.1 --directory demo
```

If port 4173 is already in use, replace `4173` with `4174` in both the command and browser address.

Open `http://127.0.0.1:4173/index.html`.

## 3. Record one successful request

1. Open ReproLens from the Chrome toolbar.
2. Choose **Select element for one-step trace** and approve access to `http://127.0.0.1:4173` if Chrome asks.
3. Select **Complete order** on the demo page.
4. Leave **Detect automatically** selected.
5. Choose **Record selected interaction**.
6. Click **Complete order** again and wait for the trace to finish.

Chrome shows a debugging banner briefly while the trace is active. This is expected.

## 4. Check the result

Without opening **Technical trace**, answer:

1. Could you understand what the click did?
2. Did the explanation connect the handler, request, and visible result clearly?
3. Would this have saved time compared with your normal debugging workflow?

If you have another three minutes, repeat the flow on `http://127.0.0.1:4173/failure.html` using **Send failing request**. The explanation should identify the deliberate `404 Not Found` request and suggest a concrete first check.

## 5. Send safe feedback

Use the repository's [beta issue forms](https://github.com/J-Jessen/reprolens-chrome-extension/issues/new/choose). Never post credentials, cookies, tokens, private URLs, customer data, raw traces, or unreviewed exports.

For the complete 45–60 minute evaluation, continue with `BETA_TEST_GUIDE.md`. Testers who complete the full evaluation and provide honest feedback will receive 12 months of free access if ReproLens launches as a paid product. The reward is for completed testing, not positive feedback.
