# OpenRouter plugin for Claude Code

Gives Claude access to every model on [OpenRouter](https://openrouter.ai) through a bundled, dependency-free MCP server: text and vision chat, image generation and editing, text-to-speech (with multi-speaker dialogue and voice cloning), speech-to-text (with timestamps and diarization), music and spoken audio, video generation, and embeddings. It also includes model discovery tools that report voices, accepted parameters and prices, so Claude can pick a suitable model before spending credits.

## Setup

1. Create an API key at <https://openrouter.ai/keys> (a key with a credit limit is recommended).
2. Export it before starting Claude Code: `export OPENROUTER_API_KEY="sk-or-v1-…"`.
3. Install the plugin from its marketplace (Claude Code 2.1.275 or later):

   ```bash
   claude plugin install openrouter --marketplace hdg-zero/claude-plugin-openrouter
   ```

   Then restart Claude Code and check that `/mcp` lists the `openrouter` server.

Requires Node.js 18.17 or later.

## Usage

Ask Claude in plain language, for example "generate a 16:9 image of a lighthouse", "read this aloud and save it as mp3", "transcribe meeting.m4a with speaker labels" or "compose 30 seconds of calm jazz". Generated files are saved to `./openrouter-output` (configurable with `OPENROUTER_OUTPUT_DIR`). The `/openrouter:ask [model] <question>` command asks another model for a second opinion.

## Tools

`chat`, `generate_image`, `text_to_speech`, `transcribe`, `generate_audio`, `generate_video`, `video_status`, `embeddings`, `list_models`, `model_details`, `credits`.

Full documentation, configuration, costs, privacy notes and troubleshooting: see the repository [README](../../README.md) and the [tool reference](../../docs/tools.md).

Every call is billed to your OpenRouter account. Attachments are sent to OpenRouter and to the model provider.

License: MIT.
