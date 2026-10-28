#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Minimal MCP server (stdio, JSON-RPC 2.0) exposing OpenRouter to Claude:
// text/multimodal chat, images, speech (TTS), transcription (STT), music/audio, video and embeddings.
// No dependencies: needs Node 18+ for the global fetch.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { version: VERSION } = require('../.claude-plugin/plugin.json');

const API = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const KEY = process.env.OPENROUTER_API_KEY;
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openrouter/auto';
const OUTPUT_DIR = path.resolve(process.env.OPENROUTER_OUTPUT_DIR || 'openrouter-output');
const TIMEOUT_MS = 300_000;
const MAX_INLINE_IMAGE_BYTES = 3_000_000; // larger images are only saved to disk
const PCM_SAMPLE_RATE = 24_000; // OpenRouter TTS pcm is 16-bit little-endian mono, 24 kHz

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', aiff: 'audio/aiff',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mpeg: 'video/mpeg',
  pdf: 'application/pdf',
};
const EXT_FOR_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

const FIND = 'Use list_models (with the matching output_modality) to find a model id, and model_details for its voices, accepted parameters and prices.';

const TOOLS = [
  {
    name: 'chat',
    description:
      'Send a prompt to any OpenRouter model (OpenAI, Google, Meta, Mistral, DeepSeek, xAI...) and return its text answer. ' +
      'Attachments (local paths or URLs) are sent as multimodal input: images, audio, video, PDF, for models that accept them. ' +
      `Defaults to "${DEFAULT_MODEL}". ${FIND}`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The user message.' },
        model: { type: 'string', description: 'OpenRouter model id, e.g. "google/gemini-2.5-pro".' },
        system: { type: 'string', description: 'Optional system prompt.' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'Local file paths or http(s) URLs (image, audio, video, pdf).' },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        max_tokens: { type: 'integer', minimum: 1 },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_image',
    description: `Generate images, or edit them from reference images, with an OpenRouter image model. Saves the files and returns their paths. ${FIND} (output_modality "image")`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string', description: 'Image model id.' },
        reference_images: { type: 'array', items: { type: 'string' }, description: 'Local paths or URLs of images to edit or take inspiration from.' },
        aspect_ratio: { type: 'string', description: 'e.g. "1:1", "16:9", "9:16", "4:3", "3:2", "21:9" or "auto".' },
        resolution: { type: 'string', enum: ['512', '768', '1K', '1.5K', '2K', '4K'] },
        size: { type: 'string', description: 'Shorthand: a tier ("2K") or exact pixels ("2048x2048"). Do not combine pixels with resolution/aspect_ratio.' },
        quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
        background: { type: 'string', enum: ['auto', 'transparent', 'opaque'], description: '"transparent" needs png or webp.' },
        output_format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'svg'] },
        n: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of images.' },
        seed: { type: 'integer' },
        output_dir: { type: 'string', description: "Where to save; defaults to OPENROUTER_OUTPUT_DIR (./openrouter-output)." },
      },
      required: ['prompt', 'model'],
    },
  },
  {
    name: 'text_to_speech',
    description:
      'Turn text into speech with an OpenRouter TTS model and save it (mp3, or wav built from the pcm stream). ' +
      'Supports multi-speaker dialogue (turns) and voice cloning from a short reference recording on models that allow it. ' +
      `Most models need a voice: get the list with model_details. ${FIND} (output_modality "speech")`,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to read. Use this or turns.' },
        turns: {
          type: 'array',
          description: 'Multi-speaker dialogue (Gemini TTS, Fish Audio...): each turn has text and optionally its own voice and instructions.',
          items: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' }, instructions: { type: 'string' } }, required: ['text'] },
        },
        model: { type: 'string', description: 'TTS model id.' },
        voice: { type: 'string', description: 'Voice id, model-specific.' },
        instructions: { type: 'string', description: 'Tone, pacing or emotion, e.g. "warm and slow" (OpenAI, Gemini, Fish Audio).' },
        speed: { type: 'number', description: 'Playback speed multiplier, if the model supports it.' },
        voice_references: { type: 'array', items: { type: 'string' }, description: 'Voice cloning: 1-3 audio clips (local paths or URLs), optionally one image. Omit voice when cloning.' },
        reference_transcript: { type: 'string', description: 'Transcript of the first reference clip, if known.' },
        format: { type: 'string', enum: ['mp3', 'pcm'], description: 'Requested format. If omitted, mp3 is tried first, then pcm (saved as wav).' },
        output_path: { type: 'string', description: 'File to write; defaults to a new file in the output dir.' },
      },
      required: ['model'],
    },
  },
  {
    name: 'transcribe',
    description: `Transcribe speech from an audio file or URL to text (speech-to-text). ${FIND} (output_modality "transcription")`,
    inputSchema: {
      type: 'object',
      properties: {
        audio: { type: 'string', description: 'Local audio file path or http(s) URL (wav, mp3, m4a, flac, ogg, webm, aac).' },
        model: { type: 'string', description: 'Transcription model id.' },
        language: { type: 'string', description: 'ISO-639-1 code, e.g. "fr". Auto-detected if omitted.' },
        diarize: { type: 'boolean', description: 'Label who speaks, on models that support it.' },
        timestamps: { type: 'boolean', description: 'Return timestamped segments.' },
        keyterms: { type: 'array', items: { type: 'string' }, description: 'Names or jargon to help recognition, on models that support it.' },
      },
      required: ['audio', 'model'],
    },
  },
  {
    name: 'generate_audio',
    description:
      'Generate audio through a chat model with audio output: music (e.g. google/lyria-3-clip-preview, google/lyria-3-pro-preview) ' +
      'or a spoken answer (e.g. openai/gpt-audio). Saves the audio and returns its path and any text/transcript. ' +
      `For plain text-to-speech prefer text_to_speech. ${FIND} (output_modality "audio")`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to create or say (e.g. a music description with genre, mood, tempo, lyrics).' },
        model: { type: 'string' },
        attachments: { type: 'array', items: { type: 'string' }, description: 'Optional images or audio given as input, as in chat.' },
        voice: { type: 'string', description: 'Voice for spoken output models (e.g. "alloy").' },
        format: { type: 'string', description: 'Audio format requested from the model (e.g. "pcm16", "wav", "mp3"). Model-specific.' },
        output_path: { type: 'string' },
      },
      required: ['prompt', 'model'],
    },
  },
  {
    name: 'generate_video',
    description:
      'Start a video generation job (text-to-video, image-to-video with first/last frame, or guided by reference images), ' +
      'wait up to wait_seconds, and download the mp4 if ready; otherwise return a job id for video_status. ' +
      `Check durations, resolutions and prices with model_details first: video can be expensive. ${FIND} (output_modality "video")`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string', description: 'Video model id.' },
        duration: { type: 'integer', description: 'Seconds; must be one of the model supported durations.' },
        resolution: { type: 'string', description: 'e.g. "480p", "720p", "1080p", "4K".' },
        aspect_ratio: { type: 'string', description: 'e.g. "16:9", "9:16", "1:1".' },
        size: { type: 'string', description: 'Exact pixels "WIDTHxHEIGHT", instead of resolution + aspect_ratio.' },
        first_frame: { type: 'string', description: 'Image (path or URL) to start the video from.' },
        last_frame: { type: 'string', description: 'Image (path or URL) to end the video on.' },
        reference_images: { type: 'array', items: { type: 'string' }, description: 'Style or subject references (ignored if a frame is given).' },
        generate_audio: { type: 'boolean' },
        seed: { type: 'integer' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: 280, default: 90 },
        output_dir: { type: 'string' },
      },
      required: ['prompt', 'model'],
    },
  },
  {
    name: 'video_status',
    description: 'Check a video job started by generate_video, optionally wait, and download the video(s) once completed.',
    inputSchema: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        wait_seconds: { type: 'integer', minimum: 0, maximum: 280, default: 0 },
        output_dir: { type: 'string' },
      },
      required: ['job_id'],
    },
  },
  {
    name: 'embeddings',
    description: `Compute embedding vectors for texts. Vectors are written to a JSON file (path returned). ${FIND} (output_modality "embeddings")`,
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'array', items: { type: 'string' } },
        model: { type: 'string' },
        dimensions: { type: 'integer', minimum: 1 },
        output_path: { type: 'string' },
      },
      required: ['input', 'model'],
    },
  },
  {
    name: 'list_models',
    description:
      'List OpenRouter models with modalities, prices and (for TTS) voices. ' +
      'output_modality: text, image, speech (TTS), transcription (STT), audio (music / spoken chat), video, embeddings, rerank, or "all".',
    inputSchema: {
      type: 'object',
      properties: {
        output_modality: { type: 'string', description: 'Comma-separated; defaults to "all".' },
        input_modality: { type: 'string', description: 'Comma-separated: text, image, audio, file.' },
        search: { type: 'string', description: 'Filter on model id or name, e.g. "gemini".' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 40 },
      },
    },
  },
  {
    name: 'model_details',
    description:
      'Details for one model: description, modalities, voices, accepted parameters and allowed values (image sizes, video durations...), ' +
      'prices, and per-provider capabilities (voice cloning, diarization...).',
    inputSchema: { type: 'object', properties: { model: { type: 'string' } }, required: ['model'] },
  },
  {
    name: 'credits',
    description: 'Show the OpenRouter account credits purchased and used so far.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---------- helpers ----------

class ApiError extends Error {
  constructor(status, message) {
    super(`OpenRouter ${status}: ${message}`);
    this.status = status;
  }
}

async function request(p, { method = 'GET', body, query, auth = true } = {}) {
  if (auth && !KEY) throw new Error('OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/keys and export it before starting Claude Code.');
  const url = new URL(API + p);
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      ...(KEY && { Authorization: `Bearer ${KEY}` }),
      'X-Title': process.env.OPENROUTER_APP_TITLE || 'Claude Code OpenRouter plugin',
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const raw = await res.text();
    let msg = raw;
    try { msg = JSON.parse(raw).error?.message || raw; } catch {}
    throw new ApiError(res.status, msg || res.statusText);
  }
  return res;
}

const api = async (p, opts) => {
  const body = await (await request(p, opts)).json();
  if (body.error) throw new Error(`OpenRouter: ${body.error.message || JSON.stringify(body.error)}`);
  return body;
};
const publicApi = (p, query) => api(p, { query, auth: false });

const isUrl = (s) => /^https?:\/\//i.test(s);
const isYouTube = (s) => /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(s);
const extOf = (s) => path.extname(new URL(s, 'file:///').pathname).slice(1).toLowerCase();
const kindOf = (s) => (MIME[extOf(s)] || '').split('/')[0];

// Reads a local file or URL into { mime, ext, base64, dataUrl }.
async function loadMedia(src) {
  let buf, mime;
  if (isUrl(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Cannot download ${src}: ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    mime = res.headers.get('content-type')?.split(';')[0];
  } else {
    const file = path.resolve(src);
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    buf = fs.readFileSync(file);
  }
  const ext = extOf(src) || Object.keys(MIME).find((e) => MIME[e] === mime) || '';
  mime = MIME[ext] || mime || 'application/octet-stream';
  const base64 = buf.toString('base64');
  return { mime, ext, base64, dataUrl: `data:${mime};base64,${base64}` };
}

const imagePart = async (src) => ({ type: 'image_url', image_url: { url: isUrl(src) ? src : (await loadMedia(src)).dataUrl } });

// Chat content part for an attachment. Remote images, YouTube links and PDFs are passed by URL;
// everything else is inlined because audio must be base64 and most providers reject other video URLs.
async function toContentPart(src) {
  const kind = kindOf(src);
  if (isUrl(src)) {
    if (kind === 'image') return { type: 'image_url', image_url: { url: src } };
    if (isYouTube(src)) return { type: 'video_url', video_url: { url: src } };
    if (extOf(src) === 'pdf') return { type: 'file', file: { filename: path.basename(new URL(src).pathname), file_data: src } };
  }
  const m = await loadMedia(src);
  if (m.mime.startsWith('image/')) return { type: 'image_url', image_url: { url: m.dataUrl } };
  if (m.mime.startsWith('video/')) return { type: 'video_url', video_url: { url: m.dataUrl } };
  if (m.mime.startsWith('audio/')) return { type: 'input_audio', input_audio: { data: m.base64, format: m.ext || 'wav' } };
  return { type: 'file', file: { filename: path.basename(src), file_data: m.dataUrl } };
}

function outFile(dir, prefix, ext) {
  const d = path.resolve(dir || OUTPUT_DIR);
  fs.mkdirSync(d, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return (i = 0) => path.join(d, `${prefix}-${stamp}${i ? `-${i}` : ''}.${ext}`);
}

function writeTo(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return file;
}

function sniffAudio(buf) {
  const head = buf.subarray(0, 4).toString('latin1');
  if (head === 'RIFF') return 'wav';
  if (head === 'fLaC') return 'flac';
  if (head === 'OggS') return 'ogg';
  if (head.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

function pcmToWav(pcm, rate = PCM_SAMPLE_RATE, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE((rate * channels * bits) / 8, 28); h.writeUInt16LE((channels * bits) / 8, 32); h.writeUInt16LE(bits, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Saves audio bytes, wrapping raw PCM in a WAV header so it plays anywhere.
function saveAudio(buf, output_path, prefix) {
  const detected = sniffAudio(buf);
  const ext = detected || 'wav';
  const data = detected ? buf : pcmToWav(buf);
  let file = output_path ? path.resolve(output_path) : outFile(null, prefix, ext)();
  if (output_path && path.extname(file).slice(1).toLowerCase() !== ext) file += `.${ext}`;
  return writeTo(file, data);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (t) => ({ type: 'text', text: t });
const costNote = (usage) => (usage?.cost != null ? ` · cost: $${usage.cost}` : '');

const EXTRA_PRICES = ['image', 'image_output', 'audio', 'audio_output', 'request'];

function priceSummary(p = {}) {
  const parts = [];
  if (+p.prompt) parts.push(`in $${(p.prompt * 1e6).toFixed(2)}/M`);
  if (+p.completion) parts.push(`out $${(p.completion * 1e6).toFixed(2)}/M`);
  for (const k of EXTRA_PRICES) if (+p[k]) parts.push(`${k} $${+p[k]}`);
  return parts.length ? parts.join(', ') : null;
}

// Pretty JSON with short arrays of plain values kept on one line.
const pretty = (o) => JSON.stringify(o, null, 1).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.replace(/\s*\n\s*/g, ' ')}]`);

const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== false && !(Array.isArray(v) && !v.length)));

// ---------- tools ----------

const handlers = {
  async chat({ prompt, model = DEFAULT_MODEL, system, attachments = [], temperature, max_tokens }) {
    const parts = await Promise.all(attachments.map(toContentPart));
    const content = parts.length ? [{ type: 'text', text: prompt }, ...parts] : prompt;
    const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }];
    const body = await api('/chat/completions', { method: 'POST', body: { model, messages, temperature, max_tokens } });
    const answer = body.choices?.[0]?.message?.content ?? '(empty response)';
    const u = body.usage || {};
    const meta = [`model: ${body.model || model}`];
    if (u.prompt_tokens != null) meta.push(`tokens: ${u.prompt_tokens} in / ${u.completion_tokens} out`);
    if (u.cost != null) meta.push(`cost: $${u.cost}`);
    return `${answer}\n\n— ${meta.join(' · ')}`;
  },

  async generate_image({ prompt, model, reference_images = [], output_dir, ...opts }) {
    const refs = await Promise.all(reference_images.map(imagePart));
    const body = await api('/images', {
      method: 'POST',
      body: { model, prompt, ...opts, ...(refs.length && { input_references: refs }) },
    });
    const images = body.data || [];
    if (!images.length) throw new Error('The model returned no image.');
    const content = [];
    const name = outFile(output_dir, 'image', 'png');
    const paths = images.map((img, i) => {
      const mime = img.media_type || 'image/png';
      const buf = Buffer.from(img.b64_json, 'base64');
      const file = writeTo(name(i).replace(/png$/, EXT_FOR_MIME[mime] || opts.output_format || 'png'), buf);
      if (buf.length <= MAX_INLINE_IMAGE_BYTES && mime !== 'image/svg+xml') content.push({ type: 'image', data: img.b64_json, mimeType: mime });
      return file;
    });
    return [text(`Saved ${paths.length} image(s):\n${paths.join('\n')}${costNote(body.usage)}`), ...content];
  },

  async text_to_speech({ text: input, turns, model, voice, instructions, speed, voice_references = [], reference_transcript, format, output_path }) {
    if (!input && !turns?.length) throw new Error('Provide text or turns.');
    const refs = [];
    for (const src of voice_references) {
      if (kindOf(src) === 'image') refs.push(await imagePart(src));
      else {
        refs.push({ type: 'input_audio', input_audio: isUrl(src) ? { url: src } : { data: (await loadMedia(src)).dataUrl } });
        if (reference_transcript && refs.filter((r) => r.type === 'input_audio').length === 1) refs.push({ type: 'text', text: reference_transcript });
      }
    }
    const body = { model, input: turns?.length ? turns : input, voice, instructions, speed, ...(refs.length && { input_references: refs }) };
    let res;
    try {
      res = await request('/audio/speech', { method: 'POST', body: { ...body, response_format: format || 'mp3' } });
    } catch (err) {
      // Some models only produce pcm (Gemini TTS, HeyGen): retry when the caller left the format open.
      if (format || err.status !== 400) throw err;
      res = await request('/audio/speech', { method: 'POST', body: { ...body, response_format: 'pcm' } });
    }
    const file = saveAudio(Buffer.from(await res.arrayBuffer()), output_path, 'speech');
    return `Audio saved to ${file}`;
  },

  async transcribe({ audio, model, language, diarize, timestamps, keyterms }) {
    let input_audio;
    if (isUrl(audio)) input_audio = { url: audio, format: extOf(audio) || undefined };
    else {
      const m = await loadMedia(audio);
      input_audio = { data: m.base64, format: m.ext || 'wav' };
    }
    const verbose = timestamps || diarize;
    const base = { model, input_audio, language, diarize, keyterms };
    let body, note = '';
    try {
      body = await api('/audio/transcriptions', {
        method: 'POST',
        body: { ...base, ...(verbose && { response_format: 'verbose_json', timestamp_granularities: ['segment'] }) },
      });
    } catch (err) {
      // Some models reject verbose_json: fall back to plain text when only timestamps were asked.
      if (!(timestamps && !diarize && err.status === 400)) throw err;
      body = await api('/audio/transcriptions', { method: 'POST', body: base });
      note = '(timestamps not supported by this model)\n';
    }
    const t = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    const who = (x) => x.speaker_label ?? (x.speaker != null ? `Speaker ${x.speaker}` : null);
    let lines = null;
    if (diarize && body.words?.some((w) => who(w))) {
      // Speaker labels come on words: merge consecutive words of the same speaker.
      const turns = [];
      for (const w of body.words) {
        const last = turns.at(-1);
        if (last && last.who === who(w)) last.words.push(w.word);
        else turns.push({ who: who(w), start: w.start, words: [w.word] });
      }
      lines = turns.map((x) => `[${t(x.start)}] ${x.who ?? '?'}: ${x.words.join(' ')}`);
    } else if (verbose && body.segments?.length) {
      lines = body.segments.map((s) => `[${t(s.start)}-${t(s.end)}]${who(s) ? ` ${who(s)}:` : ''} ${s.text.trim()}`);
    }
    const meta = [body.language && `language: ${body.language}`, (body.duration ?? body.usage?.seconds) && `duration: ${body.duration ?? body.usage.seconds}s`].filter(Boolean);
    return `${note}${lines ? lines.join('\n') : body.text}\n\n— ${meta.join(' · ')}${costNote(body.usage)}`;
  },

  async generate_audio({ prompt, model, attachments = [], voice, format, output_path }) {
    const parts = await Promise.all(attachments.map(toContentPart));
    const content = parts.length ? [{ type: 'text', text: prompt }, ...parts] : prompt;
    // OpenAI audio models need a voice and only stream pcm16.
    const audio = compact({ voice: voice || (model.startsWith('openai/') ? 'alloy' : undefined), format: format || (model.startsWith('openai/') ? 'pcm16' : undefined) });
    const res = await request('/chat/completions', {
      method: 'POST',
      body: { model, messages: [{ role: 'user', content }], modalities: ['text', 'audio'], stream: true, ...(Object.keys(audio).length && { audio }) },
    });
    // Audio output is streamed as SSE: base64 chunks in choices[0].delta.audio.data.
    const chunks = [];
    let said = '', transcript = '', usage, buf = '';
    const onEvent = (data) => {
      if (data === '[DONE]') return;
      const ev = JSON.parse(data);
      if (ev.error) throw new Error(`OpenRouter: ${ev.error.message || JSON.stringify(ev.error)}`);
      const d = ev.choices?.[0]?.delta || {};
      if (d.content) said += d.content;
      if (d.audio?.data) chunks.push(Buffer.from(d.audio.data, 'base64'));
      if (d.audio?.transcript) transcript += d.audio.transcript;
      if (ev.usage) usage = ev.usage;
    };
    const decoder = new TextDecoder();
    for await (const piece of res.body) {
      buf += decoder.decode(piece, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('data:')) onEvent(line.slice(5).trim());
      }
    }
    if (buf.trim().startsWith('data:')) onEvent(buf.trim().slice(5).trim());
    if (!chunks.length) throw new Error(`The model returned no audio.${said ? ` Text: ${said}` : ''}`);
    const file = saveAudio(Buffer.concat(chunks), output_path, 'audio');
    const extra = [said && `Text: ${said.trim()}`, transcript && `Transcript: ${transcript.trim()}`].filter(Boolean).join('\n');
    return `Audio saved to ${file}${costNote(usage)}${extra ? `\n${extra}` : ''}`;
  },

  async generate_video({ prompt, model, first_frame, last_frame, reference_images = [], wait_seconds = 90, output_dir, ...opts }) {
    const frames = [];
    for (const [src, frame_type] of [[first_frame, 'first_frame'], [last_frame, 'last_frame']]) {
      if (src) frames.push({ ...(await imagePart(src)), frame_type });
    }
    const refs = await Promise.all(reference_images.map(imagePart));
    const job = await api('/videos', {
      method: 'POST',
      body: { model, prompt, ...opts, ...(frames.length && { frame_images: frames }), ...(refs.length && { input_references: refs }) },
    });
    return handlers.video_status({ job_id: job.id, wait_seconds, output_dir });
  },

  async video_status({ job_id, wait_seconds = 0, output_dir }) {
    const deadline = Date.now() + Math.min(wait_seconds, 280) * 1000;
    const poll = () => api(`/videos/${encodeURIComponent(job_id)}`);
    let job = await poll();
    while (['pending', 'in_progress'].includes(job.status) && Date.now() < deadline) {
      await sleep(5000);
      job = await poll();
    }
    if (job.status !== 'completed') {
      const extra = job.error ? ` — ${job.error}` : ['pending', 'in_progress'].includes(job.status) ? '. Call video_status again later.' : '';
      return `Video job ${job_id}: ${job.status}${extra}`;
    }
    const count = Math.max(job.unsigned_urls?.length || 0, job.urls?.length || 0, 1);
    const name = outFile(output_dir, 'video', 'mp4');
    const paths = [];
    for (let i = 0; i < count; i++) {
      const res = await request(`/videos/${encodeURIComponent(job_id)}/content`, { query: { index: i } });
      paths.push(writeTo(name(i), Buffer.from(await res.arrayBuffer())));
    }
    return `Video job ${job_id} completed. Saved:\n${paths.join('\n')}${costNote(job.usage)}`;
  },

  async embeddings({ input, model, dimensions, output_path }) {
    const body = await api('/embeddings', { method: 'POST', body: { model, input, dimensions } });
    const vectors = (body.data || []).map((d) => d.embedding);
    const file = writeTo(output_path ? path.resolve(output_path) : outFile(null, 'embeddings', 'json')(), JSON.stringify({ model: body.model || model, input, vectors }));
    return `${vectors.length} vector(s) of dimension ${vectors[0]?.length ?? '?'} written to ${file}${costNote(body.usage)}`;
  },

  async list_models({ output_modality = 'all', input_modality, search, limit = 40 }) {
    let { data = [] } = await publicApi('/models', { output_modalities: output_modality, input_modalities: input_modality, q: search });
    if (search) { // the server search is fuzzy; keep only real matches
      const q = search.toLowerCase();
      data = data.filter((m) => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q));
    }
    const rows = data.slice(0, limit).map((m) => {
      const a = m.architecture || {};
      const io = a.input_modalities ? ` — ${a.input_modalities.join('+')} → ${(a.output_modalities || []).join('+')}` : '';
      const ctx = m.context_length ? ` — ctx ${m.context_length}` : '';
      const v = m.supported_voices?.length ? ` — voices: ${m.supported_voices.slice(0, 8).join(', ')}${m.supported_voices.length > 8 ? ` (+${m.supported_voices.length - 8})` : ''}` : '';
      return `${m.id}${io}${ctx} — ${priceSummary(m.pricing) || 'price: see model_details'}${v}`;
    });
    if (!rows.length) return 'No model matches these filters.';
    return `${rows.join('\n')}${data.length > limit ? `\n… ${data.length - limit} more (raise limit or refine search)` : ''}`;
  },

  async model_details({ model }) {
    const slug = model.split(':')[0];
    // Variants like ":free" have their own endpoint list; fall back to the base slug.
    const { data: m } = await publicApi(`/models/${model}/endpoints`).catch(() => publicApi(`/models/${slug}/endpoints`));
    const out = m.architecture?.output_modalities || [];
    const details = compact({
      id: m.id,
      name: m.name,
      description: m.description,
      modality: m.architecture?.modality,
      endpoints: (m.endpoints || []).map((e) =>
        compact({
          provider: e.provider_name,
          tag: e.tag,
          pricing: priceSummary(e.pricing),
          context_length: e.context_length || null,
          supported_parameters: e.supported_parameters,
          ...Object.fromEntries(Object.entries(e).filter(([k, v]) => k.startsWith('supports_') && k !== 'supports_tool_choice' && v === true)),
          uptime_last_1d: e.uptime_last_1d,
        }),
      ),
    });
    const extras = [];
    if (out.includes('speech')) {
      extras.push(publicApi('/models', { output_modalities: 'speech' }).then(({ data }) => {
        details.voices = data.find((x) => x.id === m.id || x.id === model)?.supported_voices || 'not listed';
      }));
    }
    if (out.includes('image')) {
      extras.push(publicApi(`/images/models/${slug}/endpoints`).then((r) => {
        details.image_endpoints = r.endpoints?.map((e) => compact({ provider: e.provider_name, supported_parameters: e.supported_parameters, pricing: e.pricing }));
      }, () => {}));
    }
    if (out.includes('video')) {
      extras.push(publicApi('/videos/models').then(({ data }) => {
        const v = data.find((x) => x.id === m.id || x.id === model);
        if (v) {
          const { id, canonical_slug, hugging_face_id, name, created, description, ...rest } = v;
          details.video = compact(rest);
        }
      }, () => {}));
    }
    await Promise.all(extras);
    return pretty(details);
  },

  async credits() {
    const { data } = await api('/credits');
    const left = data.total_credits - data.total_usage;
    return `Purchased: $${data.total_credits.toFixed(2)} · Used: $${data.total_usage.toFixed(2)} · Remaining: $${left.toFixed(2)}`;
  },
};

// ---------- JSON-RPC plumbing ----------

async function handle(msg) {
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: params.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'openrouter', version: VERSION },
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const fn = handlers[params.name];
      if (!fn) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
      try {
        const out = await fn(params.arguments || {});
        return { content: typeof out === 'string' ? [text(out)] : out };
      } catch (err) {
        // Tool failures are reported to the model, not as protocol errors.
        return { content: [text(err.message)], isError: true };
      }
    }
    default:
      if (id === undefined) return undefined; // notification, no reply
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function main() {
  readline.createInterface({ input: process.stdin }).on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    try {
      const result = await handle(msg);
      if (msg.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: msg.id, result });
    } catch (err) {
      if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: err.code || -32603, message: err.message } });
    }
  });
}

if (require.main === module) main();

module.exports = { TOOLS, VERSION };
