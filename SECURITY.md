# Security policy

## Supported version

Only the latest version on `main` is currently supported while the extension is in proof-of-concept and private-beta development.

## Reporting a vulnerability

Do not open a public issue containing credentials, private trace data, or an undisclosed vulnerability. Use GitHub's private vulnerability reporting for this repository when available, or contact the repository owner privately.

Include the extension version, Chrome version, reproduction steps, and a redacted trace if it is needed. Never attach raw cookies, authorization headers, tokens, or customer data.

## Security boundary

The extension has no required host access and no always-on content script. It requests an optional grant for the exact active HTTP or HTTPS origin from a direct user action, injects the picker on demand, and never expands that grant to unrelated hosts automatically.

It uses Chrome's `debugger` permission for short, user-initiated traces. It detaches after trace completion and does not evaluate page code except for scoped framework inspection and temporary async instrumentation. Exported data is redacted as defense in depth, but users are required to review it before sharing.
