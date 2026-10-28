---
description: Pose une question à un autre modèle via OpenRouter
argument-hint: "[modèle] <question>"
---

Use the `chat` tool of the `openrouter` MCP server to answer this request: $ARGUMENTS

If the first word of the request looks like an OpenRouter model id (it contains a `/`, e.g. `openai/gpt-4o`), pass it as `model` and send the rest as `prompt`. Otherwise send the whole request as `prompt` and let the default model be used.

Show the model's answer as-is, then add a short note if you disagree with it or see something it missed.
