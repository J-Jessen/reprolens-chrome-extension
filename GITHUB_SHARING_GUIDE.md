# Beta distribution and future GitHub access

The repository is private and owned by the personal account `J-Jessen`. The selected Round 1 distribution method is a beta ZIP sent directly to each tester. Testers do not receive repository access.

## Selected Round 1 method

1. Open the private [v0.8.0-beta.2 release](https://github.com/J-Jessen/behavior-trace-chrome-extension/releases/tag/v0.8.0-beta.2).
2. Download `behaviour-tracer-v0.8.0-beta.2.zip` from **Assets**. Do not download GitHub's automatic source archive.
3. Send the ZIP through an access-controlled channel already associated with the tester, such as a restricted cloud share, direct email, or encrypted messenger.
4. Send the acceptance message from `TESTER_RECRUITMENT.md`.
5. Ask the tester to return completed bug and feedback forms through the same channel.
6. Revoke the shared-file link after the round and ask the tester to remove the extension and delete the ZIP and extracted folder.

Do not create a public download link. The ZIP necessarily contains the JavaScript and other files Chrome executes, so it prevents repository/history access but does not make client-side extension code secret.

## Important access limitation

GitHub personal-account repositories do not provide a read-only collaborator role. Invited collaborators can read the private repository, download private releases, create issues, and also push changes. Only invite identified testers you trust, ask them to use Issues rather than pushing code, and remove access when their beta participation ends.

If testers should not receive repository history or write access, do not invite them to this repository. Send the installable beta ZIP through a separate controlled channel, as selected for Round 1.

## Information to collect for a future contributor

Only if someone later becomes a code contributor, collect:

- their exact GitHub username;
- a contact method you already trust;
- confirmation that the account belongs to the person you invited.

Never ask for their password, personal access token, recovery codes, or SSH private key.

## Invite a future contributor

1. Sign in to GitHub and open `https://github.com/J-Jessen/behavior-trace-chrome-extension`.
2. Select **Settings** under the repository name.
3. In the left sidebar under **Access**, select **Collaborators**.
4. Select **Add people**.
5. Search for the contributor's exact GitHub username or verified email address.
6. Confirm the correct profile and choose **Add [name] to this repository**.
7. Tell the contributor to accept the invitation from GitHub's email or notification.
8. After acceptance, ask them to confirm they can see the repository.

## Message to send to a future contributor

> Du har nu adgang til det private Behaviour Tracer-repository.
>
> Start her: [CONTRIBUTING.md](https://github.com/J-Jessen/behavior-trace-chrome-extension/blob/main/CONTRIBUTING.md)
>
> Brug en separat branch og pull request til foreslåede ændringer. Undlad at pushe direkte til `main` eller ændre repository-indstillinger.
>
> Del aldrig credentials, cookies, tokens, private keys, kundedata eller rå traces.

## What a future contributor does

1. Accept the GitHub invitation.
2. Open the repository.
3. Read `CONTRIBUTING.md`.
4. Create a separate branch for each change.
5. Run the required automated tests.
6. Open a pull request for review instead of pushing to `main`.

## Remove contributor access

1. Open the repository's **Settings → Collaborators** page.
2. Find the contributor.
3. Choose **Remove** and confirm.
4. Record only that access was removed; do not store unnecessary personal data in the repository.

Removing access prevents future repository access, but it cannot delete source code or release files the collaborator already downloaded. Ask contributors to delete local copies when access ends.

## Troubleshooting

- **Invitation not received:** verify the username, ask the contributor to check GitHub notifications, then cancel and resend if necessary.
- **Repository returns 404:** the invitation is probably not accepted or the contributor is signed into a different GitHub account.
- **Contributor cannot open Issues:** confirm they are listed as an accepted collaborator and that repository Issues remain enabled.
- **Wrong person invited:** remove access immediately, then invite the verified account.
