# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-27

### Added

- MCP server (stdio, zero dependencies, Node.js ≥ 18.17) bundled as a Claude Code plugin.
- `chat` tool with multimodal attachments: images, audio, video, PDF and YouTube links.
- `generate_image` tool using the OpenRouter Image API, with reference images, aspect ratio, resolution, size, quality, background, output format and seed. Images are saved and previewed inline.
- `text_to_speech` tool with voices, instructions, speed, multi-speaker turns and voice cloning. Falls back from mp3 to pcm for pcm-only models and wraps pcm in a playable WAV file.
- `transcribe` tool with language hint, key terms, timestamps and speaker diarization. Falls back to plain text when a model rejects timestamps.
- `generate_audio` tool for music (Google Lyria) and spoken answers (GPT Audio), assembled from the streamed output.
- `generate_video` and `video_status` tools for asynchronous video jobs, with first/last frame and reference images.
- `embeddings` tool writing vectors to a JSON file.
- `list_models` and `model_details` discovery tools: modality filters, voices, accepted parameters, prices and per-provider capabilities.
- `credits` tool.
- `/openrouter:ask` slash command.
- Test suite against a fake OpenRouter API, generated tool reference, and CI workflow.

[Unreleased]: https://github.com/hdg-zero/claude-plugin-openrouter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/hdg-zero/claude-plugin-openrouter/releases/tag/v0.1.0
