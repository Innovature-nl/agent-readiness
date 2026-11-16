# Security policy

## Reporting a vulnerability

Report a vulnerability privately through GitHub: **Security** tab, **Report a vulnerability**. Please do not open a public issue.

Include what you found, how to reproduce it and which version or commit you used.

## Scope

Agent Readiness runs locally. The areas that matter most:

- The dashboard server, which listens on 127.0.0.1 and can clone and scan repositories with your `gh` login.
- The AI checks, which send repository content to the configured LLM.
- Reading untrusted repositories: a scanned repository must never cause code execution.
