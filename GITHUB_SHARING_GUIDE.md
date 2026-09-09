# Public beta distribution and GitHub contribution guide

The repository and its versioned beta releases are public. Anyone can inspect the source, download a release, and read public issues without being added as a collaborator. Public visibility does not give visitors write access.

## Send testers the correct link

Share the official [v0.11.0-beta.4 release](https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.4).

Ask each tester to:

1. download `reprolens-v0.11.0-beta.4.zip` from **Assets**;
2. avoid GitHub's automatically generated **Source code** archives;
3. extract the ZIP and begin with `START_HERE.md`;
4. test only on an authorized local or staging website;
5. use the public issue forms only for sanitized bugs and feedback.

No GitHub account is needed to download the release. A GitHub account is needed to create an issue or pull request.

## What public access allows

Visitors can read and fork the repository, download releases, and suggest changes through pull requests. They cannot push to this repository, change settings, publish releases, or merge pull requests unless the owner explicitly grants collaborator access.

ReproLens is source-available for beta evaluation and is not currently open source. The allowed evaluation use and restrictions are stated in `LICENSE.md`. Public source reduces distribution friction, but it cannot technically prevent someone from copying files they can view.

## Safe public reporting

Use the repository's **Beta bug report** and **Beta feedback** issue forms for ordinary sanitized reports.

Never put credentials, cookies, tokens, customer data, private URLs, raw traces, or unreviewed exports in a public issue. Use [private vulnerability reporting](https://github.com/J-Jessen/reprolens-chrome-extension/security/advisories/new) for an undisclosed vulnerability, a privacy failure, or accidental sensitive-data exposure.

## Accept changes without granting write access

An external contributor should:

1. fork the public repository;
2. create a branch in their fork;
3. follow `CONTRIBUTING.md` and run the required checks;
4. open a pull request against `J-Jessen/reprolens-chrome-extension:main`;
5. wait for review and automated checks.

The owner reviews and merges acceptable pull requests. Contributors do not need collaborator access for this workflow.

## Grant collaborator access only when necessary

Only add a trusted ongoing maintainer when they genuinely need direct repository access. Collect their exact GitHub username, confirm the account belongs to them, and require branch-plus-pull-request work. Never ask for a password, personal access token, recovery code, or SSH private key.

To add a maintainer:

1. Open the repository's **Settings**.
2. Under **Access**, open **Collaborators**.
3. Choose **Add people** and select the verified account.
4. Ask the maintainer to accept GitHub's invitation.
5. Remove access when the maintenance relationship ends.

## Copy-ready tester message

> Thanks for helping test ReproLens. Download the installable ZIP from the official v0.11.0-beta.4 release and begin with `START_HERE.md` inside the extracted folder:
>
> https://github.com/J-Jessen/reprolens-chrome-extension/releases/tag/v0.11.0-beta.4
>
> Choose the file named `reprolens-v0.11.0-beta.4.zip` under Assets, not a Source code archive. Test only on a local or staging site you are authorized to inspect. Never post credentials, customer data, private URLs, raw traces, or unreviewed exports in a public issue.
