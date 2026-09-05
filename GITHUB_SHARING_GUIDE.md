# Sharing the private GitHub repository with beta testers

The repository is currently private and owned by the personal account `J-Jessen`.

## Important access limitation

GitHub personal-account repositories do not provide a read-only collaborator role. Invited collaborators can read the private repository, download private releases, create issues, and also push changes. Only invite identified testers you trust, ask them to use Issues rather than pushing code, and remove access when their beta participation ends.

If testers should never receive source or write access, do not invite them to this repository. Send the installable beta ZIP through a separate controlled channel, or later move distribution to an organization/repository setup with a suitable read-only role.

## Information to collect

For each accepted tester, collect:

- their exact GitHub username;
- a contact method you already trust;
- confirmation that the account belongs to the person you invited.

Never ask for their password, personal access token, recovery codes, or SSH private key.

## Invite a tester

1. Sign in to GitHub and open `https://github.com/J-Jessen/behavior-trace-chrome-extension`.
2. Select **Settings** under the repository name.
3. In the left sidebar under **Access**, select **Collaborators**.
4. Select **Add people**.
5. Search for the tester's exact GitHub username or verified email address.
6. Confirm the correct profile and choose **Add [name] to this repository**.
7. Tell the tester to accept the invitation from GitHub's email or notification.
8. After acceptance, ask them to confirm they can see the repository's **Releases** and **Issues** pages.

## Message to send after access is granted

> Du har nu adgang til det private Behaviour Tracer-repository.
>
> Start her: [BETA_TEST_GUIDE.md](https://github.com/J-Jessen/behavior-trace-chrome-extension/blob/main/BETA_TEST_GUIDE.md)
>
> Download kun den beta-version, guiden linker til under **Releases → Assets**. Brug GitHub **Issues** til fejl og feedback. Undlad at pushe commits eller ændre repository-indstillinger.
>
> Del aldrig credentials, cookies, tokens, private keys, kundedata eller rå traces. Gennemgå altid eksport-previewet først.

## What the tester does

1. Accept the GitHub invitation.
2. Open the repository.
3. Read `BETA_TEST_GUIDE.md`.
4. Open **Releases** and select the specified pre-release.
5. Download the `behaviour-tracer-....zip` asset, not GitHub's automatic source-code archive.
6. Submit problems using **Issues → New issue → Beta bug report**.
7. Submit the final evaluation using **Issues → New issue → Beta feedback**.

## Remove access after the beta

1. Open the repository's **Settings → Collaborators** page.
2. Find the tester.
3. Choose **Remove** and confirm.
4. Record only that access was removed; do not store unnecessary personal data in the repository.

Removing access prevents future repository access, but it cannot delete source code or release files the collaborator already downloaded. Ask testers to delete local copies when the beta ends.

## Troubleshooting

- **Invitation not received:** verify the username, ask the tester to check GitHub notifications, then cancel and resend if necessary.
- **Release returns 404:** the invitation is probably not accepted or the tester is signed into a different GitHub account.
- **Tester cannot open Issues:** confirm they are listed as an accepted collaborator and that repository Issues remain enabled.
- **Wrong person invited:** remove access immediately, then invite the verified account.
