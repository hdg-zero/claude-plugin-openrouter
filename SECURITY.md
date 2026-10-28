# Security policy

## Supported versions

Only the latest released version receives security fixes.

| Version | Supported |
| --- | --- |
| 0.1.x | ✅ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/hdg-zero/claude-plugin-openrouter/security/advisories/new). Include:

- a description of the issue and its impact,
- steps to reproduce (tool name, arguments and model, **without your API key**),
- the plugin version and your Node.js version.

You can expect an acknowledgement within 5 working days and a status update within 14 days. Once a fix is released, we will credit you in the advisory unless you prefer to remain anonymous.

## Scope

In scope:

- leaking the API key (logs, tool output, files),
- writing files outside the output directory or the path explicitly requested,
- sending local files or data to OpenRouter without being asked to,
- protocol-level issues in the MCP server.

Out of scope: vulnerabilities in OpenRouter, in model providers or in Claude Code themselves. Please report those to the respective vendor.

## Handling API keys

- Keep your key in an environment variable or a secrets manager. Never commit it.
- Use a dedicated key with a credit limit for this plugin.
- If a key is exposed, revoke it immediately at <https://openrouter.ai/keys> and create a new one.
