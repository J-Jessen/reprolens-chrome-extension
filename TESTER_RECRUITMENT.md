# Tester recruitment kit

The first objective is five observed sessions, not broad awareness. Public posts remain useful background credibility, but the first participants should be recruited manually and offered a guided 15-minute test with no project preparation.

## Narrow tester profile

Prioritize people who meet both conditions:

1. They currently work as a frontend developer, full-stack developer, QA/test automation engineer, or engineering lead.
2. They investigate JavaScript failures, failed browser requests, difficult reproduction steps, or Playwright regressions at least occasionally.

For the first session, they need only desktop Chrome 118 or newer. Do not require access to a work application. The supplied public demo is the safest first experience.

## Five-day sourcing plan

Find eight relevant people per day, in this order:

1. Former colleagues, classmates, clients, meetup contacts, and friends who write or test frontend code.
2. One introduction from every suitable warm contact.
3. Active participants in frontend, JavaScript, React, QA, and Playwright Discord communities where direct messages are permitted.
4. People publicly discussing a concrete frontend request, JavaScript, or reproduction problem on GitHub, LinkedIn, Indie Hackers, or developer forums.
5. Local developer and testing meetups whose organizers allow a short testing request.

Personalize the opening sentence around the person's role or the problem they discussed. Do not automate direct messages, scrape private contact data, or send the same unsolicited pitch repeatedly.

Track only aggregate totals in `OUTREACH_SCORECARD.md`. Keep names and contact details in a private system controlled by the project owner.

## Primary invitation — guided test

> Hi [name] — I noticed that you work with [specific frontend or testing context]. I am testing whether a Chrome extension can help developers identify the cause of a browser failure faster than DevTools alone.
>
> Would you be open to a focused 15-minute screen-share test? You will use a supplied safe demo, so there is no project setup, production access, or private data involved. I am looking for honest evidence about where the tool helps, confuses, or adds no value.
>
> You can see the product first here: https://j-jessen.github.io/reprolens-chrome-extension/

Do not include the founding-tester benefit in the first paragraph. If the person asks what they receive, say:

> Participants who complete the structured test will receive 12 months of free access if ReproLens launches as a paid product. The benefit is for completed, honest testing—not positive feedback.

## Short Discord message

> I am looking for frontend or QA developers for a 15-minute screen-share test of ReproLens. It follows one browser interaction into the relevant handler, request/error, page result, safe bug report, and Playwright test starting point.
>
> The session uses a supplied demo—no work project, production data, or preparation. I specifically want to learn whether it finds the likely cause faster than DevTools alone.
>
> Overview and volunteer link: https://j-jessen.github.io/reprolens-chrome-extension/

## Message for someone discussing a relevant bug

> Hi [name] — I saw your note about [specific publicly discussed browser problem]. I am not contacting you to sell anything. I am testing a local-first Chrome tool that tries to connect one failing interaction to its handler, request/error, and visible result.
>
> I would value a 15-minute comparison against normal DevTools using a supplied demo. No private application or data is needed. Would that be useful enough to try?

## Positive-response message

> Thank you. The test takes about 15 minutes and uses only the supplied safe demo. Nothing needs to be installed before the call. Please use the public volunteer form so we can coordinate without posting personal contact details:
>
> https://github.com/J-Jessen/reprolens-chrome-extension/issues/new?template=guided-beta-session.yml

## Follow-up after three days

> Hi [name] — one quick follow-up in case the earlier message was buried. The ReproLens test is 15 minutes, uses a supplied demo, and requires no access to your project. If it is not relevant, no reply is needed.

Send only one follow-up. Do not pressure non-responders.

## Session and completion

Run the call using `BETA_STUDY_PROTOCOL.md`. Afterward, ask for the structured beta feedback only if the participant is comfortable submitting public-safe results.

> Thank you—your observations were genuinely useful. If you are comfortable doing so, you can submit sanitized feedback here. Never include credentials, customer data, private URLs, raw traces, or an export you have not reviewed:
>
> https://github.com/J-Jessen/reprolens-chrome-extension/issues/new?template=beta-feedback.yml

## Stop and change rules

- After 40 relevant invitations with fewer than 8 replies, change the target or promise before sending more.
- If people reply but will not book, reduce perceived risk and commitment.
- If sessions book but installation repeatedly fails, prioritize Web Store distribution and onboarding.
- If participants understand the explanation but do not save time, test bug-report and Playwright value separately before building more tracing features.
- If at least two of the first five ask to use ReproLens again on an authorized local or staging project, recruit the next five from the most enthusiastic role/profile.
