# Contributing

Thanks for your interest in improving this plugin! This guide explains how to set up the project, the conventions we follow, and how to get a change merged.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug**: open an issue with the bug report template. Include the tool name, the model id, the arguments (without secrets) and the exact error message.
- **Suggest a feature**: open an issue with the feature request template, ideally linking the relevant [OpenRouter documentation](https://openrouter.ai/docs).
- **Submit a pull request**: for anything beyond a small fix, open an issue first so we can agree on the approach.

Security issues must **not** be reported publicly: see [SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 18.17 or later and, optionally, Claude Code for manual testing. There are no dependencies to install.

```bash
git clone https://github.com/hdg-zero/claude-plugin-openrouter.git
cd claude-plugin-openrouter
npm test
```

### Trying your changes in Claude Code

```text
/plugin marketplace add ./path/to/claude-plugin-openrouter
/plugin install openrouter@openrouter-marketplace
```

After editing the server, restart Claude Code (or reconnect the server from `/mcp`) to load the new code.

### Running the server by hand

The server speaks JSON-RPC 2.0 over stdio, one message per line:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm start --silent
```

For live calls, use a dedicated key with a small credit limit and prefer `:free` models.

## Project conventions

- **Zero runtime dependencies.** The plugin must run straight from a clone, without `npm install`. Use Node.js built-ins (`fetch`, `node:fs`, `node:test`…).
- **One source of truth.** The version lives in `plugins/openrouter/.claude-plugin/plugin.json`; the server reads it. Keep `package.json` and `.claude-plugin/marketplace.json` in sync (a test checks this).
- **Generated docs.** `docs/tools.md` is generated from the tool schemas. After changing a tool, run `npm run docs` and commit the result.
- **Follow the API.** Request and response shapes must match the [OpenRouter API reference](https://openrouter.ai/docs/api_reference/overview). Link the relevant page in your PR.
- **Stdout is the protocol.** Never `console.log` in the server; use `console.error` for diagnostics.
- **Errors are for Claude.** Tool failures return `isError: true` with a message that tells the model what to do next.
- **Style.** Two-space indentation, single quotes, semicolons, and comments only where the code is not self-explanatory. See `.editorconfig`.

## Tests

Tests use the built-in `node:test` runner and a fake OpenRouter API (`test/helpers.js`), so they need neither network nor API key.

- Add or update a test for every behaviour change.
- New tools need at least one test asserting the exact request body sent to OpenRouter.

```bash
npm run check   # syntax, docs freshness and tests, as in CI
```

## Commit messages and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`… For example: `feat(tts): support speaker turns`.
- Keep pull requests focused, and fill in the pull request template.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
- CI must pass before review.

## Releasing

Maintainers follow [docs/publishing.md](docs/publishing.md).
