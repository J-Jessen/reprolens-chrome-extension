# Tester recruitment kit

## Where to find the first testers

Use warm, relevant contacts first. The objective is useful observation, not a large mailing list.

1. Ask 3–5 frontend or full-stack developers you already know from work, former projects, study, meetups, or professional groups.
2. Ask each suitable contact for one introduction to a developer who regularly debugs browser behaviour.
3. Post a short request in relevant Danish or local frontend, React, JavaScript, QA, or test-automation communities where recruitment posts are allowed.
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

> Hej [navn] — jeg tester et nyt Chrome-værktøj til frontend-debugging. Man vælger et element, udfører ét klik, og får en lokal tidslinje over handler, netværk, async-kald og DOM-ændringer.
>
> Jeg leder efter få udviklere/QA-profiler, der vil bruge 45–60 minutter på en privat beta på en lokal eller staging-side, de selv må inspicere. Værktøjet uploader ikke traces eller analytics. Hvis du vælger at dele et trace, skal du først gennemgå den redigerede eksport.
>
> Testen består af installation, et kort demo-flow, 3–5 interaktioner i et rigtigt projekt og en struktureret feedbackformular. Du behøver ikke rette kode eller have GitHub-adgang.
>
> Har du lyst til at deltage inden [dato]? Hvis ja, sender jeg en samlet beta-ZIP gennem en privat kanal.

## Copy-ready community post

> **Søger 3–5 frontend/QA-testere til privat Chrome-extension-beta**
>
> Jeg bygger Behaviour Tracer: vælg et element, udfør ét klik, og se den observerede kæde af JavaScript-handlers, requests, async-grænser, navigation og DOM-ændringer. Alt behandles lokalt; der er ingen automatisk upload eller analytics.
>
> Jeg søger især React/JavaScript/frontend/full-stack/QA-profiler med adgang til en lokal eller staging-webapp. Testen tager 45–60 minutter. Du modtager en beta-ZIP direkte, og repositoryet deles ikke. Ingen produktions- eller kundedata må bruges.
>
> Skriv en privat besked med din rolle, primære framework og om du kan teste inden [dato].

## Acceptance message

> Tak — du passer godt til testen. Jeg sender dig nu beta-ZIP-filen gennem vores private kanal. Pak den ud, og begynd med `START_HER.md`.
>
> Brug kun den vedlagte beta-version v0.7.1-beta.1. Repositoryet og udviklingsbranchen skal ikke bruges.
>
> Vigtigt: test kun på lokale eller staging-systemer, du har tilladelse til at inspicere. Del aldrig rå credentials, cookies, tokens, kundedata eller en eksport, du ikke selv har gennemgået.

## Follow-up after three days

> Hej [navn] — en kort opfølgning på Behaviour Tracer-betaen. Er du kommet i gang, eller er installation blokeret? Hvis noget stopper dig, kan du udfylde `BETA_BUG_REPORT.md` og sende den tilbage gennem samme private kanal. Der er ingen forventning om, at du sender et trace, hvis du er i tvivl om indholdet.

## Completion message

> Tak for testen. Husk at sende den udfyldte `BETA_FEEDBACK_FORM.md` tilbage, også hvis alt fungerede. Når betaen slutter, kan du slette den udpakkede mappe og fjerne udvidelsen via `chrome://extensions`.

## Outreach tracker

Keep personal contact data outside the repository. Track only aggregate progress here or in a private system:

| Stage | Target |
|---|---:|
| Personalized invitations sent | 10–15 |
| Qualified acceptances | 6–8 |
| Round 1 completions | 3 |
| Total completions | 4+ |
