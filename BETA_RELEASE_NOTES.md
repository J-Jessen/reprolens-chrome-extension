# Behaviour Tracer v0.7.1-beta.1

This private beta tests whether one-click behaviour traces save developers time on real local and staging applications.

## Install and test

1. The owner downloads `behaviour-tracer-v0.7.1-beta.1.zip` from **Assets** below. Do not use GitHub's source-code archives.
2. The owner sends the ZIP directly to each selected tester through a private, access-controlled channel.
3. The tester begins with `START_HER.md` inside the ZIP and returns completed forms through the same private channel.

Testers do not need or receive GitHub repository access.

## Changes in this build

- Aligns the side panel with current Modern Web Guidance for semantics, keyboard use, focus, status announcements, color schemes, reduced motion, and safe DOM rendering.
- Moves injected overlay presentation to a static stylesheet and keeps website access explicitly per origin.
- Adds Chrome 118+ lifecycle handling and privacy-sanitized session-state recovery.
- Adds automated extension-policy and Web Store-readiness checks; the full browser corpus still covers 26 scenarios.

Chrome asks for access to each website when it is first selected. Approve only a local or staging website you are authorized to inspect.

## Safety

Do not test with production customer data. Never share credentials, cookies, tokens, private keys, raw traces, or an export you have not reviewed. The extension processes and stores traces locally and does not upload analytics.
