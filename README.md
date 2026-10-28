<div align="center">

<img src="plugins/openrouter/.claude-plugin/icon.png" alt="" width="96" height="96">

# OpenRouter for Claude Code

**Give Claude access to every model on [OpenRouter](https://openrouter.ai): text, vision, images, speech, transcription, music, video and embeddings, with one API key.**

[![CI](https://github.com/hdg-zero/claude-plugin-openrouter/actions/workflows/ci.yml/badge.svg)](https://github.com/hdg-zero/claude-plugin-openrouter/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node.js ≥ 18.17](https://img.shields.io/badge/node-%E2%89%A518.17-339933?logo=node.js&logoColor=white)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![MCP](https://img.shields.io/badge/MCP-2025--06--18-8A2BE2)

[English](README.md) · [Français](README.fr.md)

</div>

---

## Table of contents

- [Why](#why)
- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Costs and limits](#costs-and-limits)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Why

Claude is excellent at reasoning and code, but some jobs call for another model: generating an image, reading text aloud, transcribing a meeting, composing a jingle, rendering a short video, or getting a second opinion from GPT or Gemini. OpenRouter puts several hundred of those models behind a single API. This plugin plugs that API into Claude Code as an [MCP](https://modelcontextprotocol.io) server, so you can simply ask Claude and it picks the right model and the right tool.

## Features

| Capability | Tool | Highlights |
| --- | --- | --- |
| 💬 Text & vision | `chat` | Any chat model. Attach images, audio, video, PDFs or YouTube links |
| 🖼️ Images | `generate_image` | Text-to-image and editing from reference images. Aspect ratio, resolution, quality, transparent background, SVG |
| 🗣️ Text-to-speech | `text_to_speech` | Voice choice, tone instructions, multi-speaker dialogue, voice cloning from a sample. Saves mp3 or wav |
| 📝 Speech-to-text | `transcribe` | Local file or URL, language hint, timestamps, speaker diarization, key terms |
| 🎵 Music & spoken audio | `generate_audio` | Music with Google Lyria, spoken answers with GPT Audio (streamed) |
| 🎬 Video | `generate_video`, `video_status` | Text-to-video, first/last frame, reference images. Async jobs, mp4 download |
| 🧮 Embeddings | `embeddings` | Vectors written to a JSON file |
| 🔎 Discovery | `list_models`, `model_details` | Filter by modality; voices, accepted parameters, per-provider prices and capabilities |
| 💳 Account | `credits` | Remaining balance |

Plus a `/openrouter:ask [model] <question>` slash command for quick second opinions.

**Design principles:** zero runtime dependencies (a single Node.js file), generated files are saved to disk and returned as paths, generated images are also shown to Claude inline, tool errors are surfaced to Claude with OpenRouter's own message, and nothing is ever logged to stdout except protocol messages.

The full parameter reference lives in **[docs/tools.md](docs/tools.md)**.

## Requirements

- [Claude Code](https://code.claude.com) with plugin support
- [Node.js](https://nodejs.org) **18.17 or later** on your `PATH`
- An [OpenRouter API key](https://openrouter.ai/keys)

## Installation

### 1. Provide your API key

Export the key in the shell that launches Claude Code (add it to `~/.zshrc`, `~/.bashrc` or your secrets manager to make it permanent):

```bash
export OPENROUTER_API_KEY="sk-or-v1-…"
```

> [!TIP]
> Create a dedicated key with a **credit limit** in the OpenRouter dashboard. It caps what Claude can spend.

### 2. Install the plugin

From inside Claude Code:

```text
/plugin marketplace add hdg-zero/claude-plugin-openrouter
/plugin install openrouter@openrouter-marketplace
```

Or in one step from your terminal (Claude Code 2.1.275 or later):

```bash
claude plugin install openrouter --marketplace hdg-zero/claude-plugin-openrouter
```

Restart Claude Code when prompted, then run `/mcp`: the `openrouter` server should be listed as connected.

<details>
<summary>Install from a local clone instead</summary>

```bash
git clone https://github.com/hdg-zero/claude-plugin-openrouter.git
```

```text
/plugin marketplace add ./claude-plugin-openrouter
/plugin install openrouter@openrouter-marketplace
```

</details>

### Updating and removing

```text
/plugin marketplace update openrouter-marketplace
/plugin uninstall openrouter@openrouter-marketplace
```

## Configuration

All settings are environment variables, read when Claude Code starts the server.

| Variable | Default | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | — **(required)** | Your OpenRouter API key |
| `OPENROUTER_DEFAULT_MODEL` | `openrouter/auto` | Model used by `chat` when none is given |
| `OPENROUTER_OUTPUT_DIR` | `./openrouter-output` | Where images, audio, video and embeddings are saved (relative to the project) |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Override for a compatible gateway or proxy |
| `OPENROUTER_APP_TITLE` | `Claude Code OpenRouter plugin` | App name sent in the `X-Title` header (OpenRouter usage attribution) |

> [!NOTE]
> Add `openrouter-output/` to your project's `.gitignore` to avoid committing generated media.

## Usage

Talk to Claude normally; it chooses the tool and, if you do not name one, the model.

```text
> Generate a 16:9 image of a lighthouse at sunset, high quality
> Read this paragraph aloud in a warm voice and save it as mp3
> Transcribe meeting.m4a and label who is speaking
> Compose 30 seconds of calm jazz for my video intro
> Make a 5-second 9:16 video that starts from photo.png
> Ask Gemini what it thinks of this diagram   (with an image attached)
> Which free text-to-speech models are available?
```

When no model is specified, Claude calls `list_models` with the right modality, then `model_details` to check voices, sizes, durations and prices before generating.

### Slash command

```text
/openrouter:ask openai/gpt-4o Is there a race condition in src/queue.ts?
/openrouter:ask Summarise the trade-offs of this design
```

### Model discovery cheat sheet

| You want… | `output_modality` |
| --- | --- |
| A chat / reasoning model | `text` |
| Image generation | `image` |
| Text-to-speech | `speech` |
| Speech-to-text | `transcription` |
| Music or spoken chat | `audio` |
| Video | `video` |
| Vectors | `embeddings` |

Free variants end in `:free` (for example some TTS and embedding models), which is handy for testing.

## Costs and limits

- Every call is billed to your OpenRouter account. When the API reports a cost, the tool shows it.
- **Video can be expensive** (often billed per second of output). `model_details` shows prices and supported durations before you start.
- OpenRouter requires a minimum available balance for some modalities (for example audio transcription). A request below it fails with a `402` error that is passed on to Claude.
- Generation calls time out after 5 minutes; `generate_video` waits at most 280 s and then returns a job id to resume with `video_status`.

## Privacy and security

- The API key is read from the environment only. It is never written to disk or included in tool output.
- **Attachments are uploaded to OpenRouter** and to the provider serving the model. Do not attach files you are not allowed to share. Per-provider data policies are listed on OpenRouter.
- URLs passed as attachments may be downloaded by the plugin (audio, non-YouTube video) or by OpenRouter (images, PDFs).
- Generated files are written only inside the output directory, or to an explicit `output_path` you provide.

See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `OPENROUTER_API_KEY is not set` | Export the key **before** starting Claude Code, then restart it |
| Server missing in `/mcp` | Check `node --version` (≥ 18.17) and that `node` is on the `PATH` Claude Code sees |
| `OpenRouter 402` | Not enough credit, or below the minimum balance for that modality |
| `OpenRouter 400` on speech | The model needs a `voice` (see `model_details`) or supports only one format |
| `OpenRouter 400` on images or video | A parameter value is not supported by that model; check `model_details` |
| Video still `in_progress` | Ask Claude to check again later; it calls `video_status` with the job id |
| `fetch failed` behind a corporate proxy | Run Claude Code with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) or set `OPENROUTER_BASE_URL` to your gateway |

## Development

```text
.
├── .claude-plugin/marketplace.json   # marketplace manifest (lists the plugin)
├── plugins/openrouter/               # the plugin itself
│   ├── .claude-plugin/plugin.json    # plugin manifest (name, version, icon)
│   ├── .mcp.json                     # starts the MCP server
│   ├── commands/ask.md               # /openrouter:ask
│   └── server/index.js               # MCP server (stdio, zero dependencies)
├── docs/                             # tool reference (generated) and architecture
├── scripts/generate-tool-docs.js
└── test/                             # node:test suites against a fake OpenRouter API
```

```bash
npm test             # run the test suite (no network, no key needed)
npm run docs         # regenerate docs/tools.md from the tool schemas
npm run check        # syntax + docs freshness + tests (what CI runs)
claude plugin validate .   # validate the manifests with Claude Code
```

Read [docs/architecture.md](docs/architecture.md) for how the server is built, and [docs/publishing.md](docs/publishing.md) for the release process.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) first. Notable changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © hdg-zero

---

<sub>This is a community project. It is not affiliated with, endorsed by or sponsored by OpenRouter or Anthropic. “OpenRouter” and “Claude” are trademarks of their respective owners.</sub>
