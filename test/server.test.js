// End-to-end tests: the real MCP server talking to a fake OpenRouter API.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFakeApi, startMcp, json, binary, PNG_B64 } = require('./helpers');

let api, mcp, tmp;
let videoPolls = 0;

const last = (route) => api.requests.filter((r) => r.route === route).at(-1);

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-plugin-'));
  fs.writeFileSync(path.join(tmp, 'voice.wav'), 'RIFF....WAVEfake');
  fs.writeFileSync(path.join(tmp, 'frame.png'), Buffer.from(PNG_B64, 'base64'));

  api = await startFakeApi({
    'POST /chat/completions': (req, body, res) => {
      if (!body.stream) {
        return json(res, { model: body.model, choices: [{ message: { content: 'pong' } }], usage: { prompt_tokens: 3, completion_tokens: 1, cost: 0 } });
      }
      // Audio output arrives as SSE chunks of base64 audio.
      const pcm = Buffer.alloc(4800);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(': OPENROUTER PROCESSING\n\n');
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Here ', audio: { data: pcm.subarray(0, 2400).toString('base64'), transcript: 'Hel' } } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'it is', audio: { data: pcm.subarray(2400).toString('base64'), transcript: 'lo' } } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {} }], usage: { cost: 0.04 } })}\n\ndata: [DONE]\n\n`);
      res.end();
    },
    'POST /images': (req, body, res) =>
      json(res, {
        created: 1,
        data: [
          { b64_json: PNG_B64, media_type: 'image/png' },
          { b64_json: Buffer.from('<svg/>').toString('base64'), media_type: 'image/svg+xml' },
        ],
        usage: { cost: 0.04 },
      }),
    'POST /audio/speech': (req, body, res) => {
      if (body.model === 'pcm-only' && body.response_format === 'mp3') return json(res, { error: { message: 'pcm only' } }, 400);
      if (body.response_format === 'mp3') return binary(res, Buffer.from('ID3fake-mp3'), 'audio/mpeg');
      return binary(res, Buffer.alloc(4800), 'audio/pcm');
    },
    'POST /audio/transcriptions': (req, body, res) => {
      if (body.model === 'no-verbose' && body.response_format === 'verbose_json') return json(res, { error: { message: 'verbose_json not supported' } }, 400);
      if (body.diarize) {
        return json(res, {
          text: 'Hello. Hi you.',
          language: 'en',
          duration: 3,
          words: [
            { word: 'Hello.', start: 0, end: 0.5, speaker: 0 },
            { word: 'Hi', start: 1.2, end: 1.4, speaker: 1 },
            { word: 'you.', start: 1.4, end: 1.8, speaker: 1 },
          ],
          usage: { seconds: 3, cost: 0.0002 },
        });
      }
      return json(res, { text: 'Hello. Hi you.', usage: { seconds: 3, cost: 0.0001 } });
    },
    'POST /videos': (req, body, res) => json(res, { id: 'job1', status: 'pending', polling_url: 'x' }, 202),
    'GET /videos/job1': (req, body, res) =>
      json(res, { id: 'job1', polling_url: 'x', status: ++videoPolls > 1 ? 'completed' : 'in_progress', unsigned_urls: ['a', 'b'], usage: { cost: 0.5 } }),
    'GET /videos/job1/content': (req, body, res) => binary(res, Buffer.from('fake-mp4'), 'video/mp4'),
    'POST /embeddings': (req, body, res) => json(res, { model: body.model, data: body.input.map(() => ({ embedding: [0.1, 0.2, 0.3] })) }),
    'GET /models': (req, body, res) =>
      json(res, {
        data: [
          {
            id: 'acme/tts-1',
            name: 'Acme TTS',
            architecture: { input_modalities: ['text'], output_modalities: ['speech'] },
            pricing: { prompt: '0.000015', completion: '0' },
            supported_voices: ['alice', 'bob'],
          },
        ],
      }),
    'GET /credits': (req, body, res) => json(res, { data: { total_credits: 10, total_usage: 2.5 } }),
  });

  mcp = startMcp({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_BASE_URL: api.url, OPENROUTER_OUTPUT_DIR: path.join(tmp, 'out') });
});

after(() => {
  mcp?.close();
  api?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('initialize reports the manifest version and lists every tool', async () => {
  const { result } = await mcp.request('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(result.serverInfo.version, require('../plugins/openrouter/.claude-plugin/plugin.json').version);
  const { result: list } = await mcp.request('tools/list');
  assert.deepEqual(list.tools.map((t) => t.name), [
    'chat', 'generate_image', 'text_to_speech', 'transcribe', 'generate_audio',
    'generate_video', 'video_status', 'embeddings', 'list_models', 'model_details', 'credits',
  ]);
});

test('unknown methods return a JSON-RPC error', async () => {
  const res = await mcp.request('does/not/exist');
  assert.equal(res.error.code, -32601);
});

test('chat sends attachments as multimodal content parts', async () => {
  const r = await mcp.callTool('chat', {
    prompt: 'Describe',
    model: 'acme/model',
    attachments: [path.join(tmp, 'voice.wav'), path.join(tmp, 'frame.png'), 'https://youtu.be/abc', 'https://example.com/doc.pdf'],
  });
  assert.match(r.text, /^pong/);
  const req = last('/chat/completions');
  assert.equal(req.headers.authorization, 'Bearer sk-or-test');
  const types = req.body.messages[0].content.map((p) => p.type);
  assert.deepEqual(types, ['text', 'input_audio', 'image_url', 'video_url', 'file']);
  assert.equal(req.body.messages[0].content[1].input_audio.format, 'wav');
  assert.match(req.body.messages[0].content[2].image_url.url, /^data:image\/png;base64,/);
  assert.equal(req.body.messages[0].content[4].file.file_data, 'https://example.com/doc.pdf');
});

test('generate_image saves every image with the right extension and returns a preview', async () => {
  const r = await mcp.callTool('generate_image', { prompt: 'a cat', model: 'acme/img', quality: 'high', reference_images: [path.join(tmp, 'frame.png')] });
  const files = r.text.match(/\S+\.(png|svg)/g);
  assert.equal(files.length, 2);
  assert.ok(files.every((f) => fs.existsSync(f)));
  assert.ok(r.content.some((c) => c.type === 'image' && c.mimeType === 'image/png'));
  assert.equal(last('/images').body.input_references[0].type, 'image_url');
});

test('text_to_speech keeps mp3 when the model supports it', async () => {
  const r = await mcp.callTool('text_to_speech', { text: 'Hello', model: 'acme/tts', voice: 'alice' });
  assert.match(r.text, /\.mp3$/);
});

test('text_to_speech falls back to pcm and writes a playable wav', async () => {
  const r = await mcp.callTool('text_to_speech', { turns: [{ text: 'Hi', voice: 'a' }, { text: 'Hey', voice: 'b' }], model: 'pcm-only' });
  const file = r.text.match(/\S+\.wav$/)[0];
  const wav = fs.readFileSync(file);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(last('/audio/speech').body.response_format, 'pcm');
  assert.ok(Array.isArray(last('/audio/speech').body.input));
});

test('text_to_speech does not retry when the caller forced a format', async () => {
  const r = await mcp.callTool('text_to_speech', { text: 'x', model: 'pcm-only', format: 'mp3' });
  assert.equal(r.isError, true);
  assert.match(r.text, /400/);
});

test('transcribe groups diarized words by speaker', async () => {
  const r = await mcp.callTool('transcribe', { audio: path.join(tmp, 'voice.wav'), model: 'acme/stt', diarize: true });
  assert.match(r.text, /Speaker 0: Hello\./);
  assert.match(r.text, /Speaker 1: Hi you\./);
  assert.equal(last('/audio/transcriptions').body.response_format, 'verbose_json');
});

test('transcribe falls back to plain text when timestamps are unsupported', async () => {
  const r = await mcp.callTool('transcribe', { audio: path.join(tmp, 'voice.wav'), model: 'no-verbose', timestamps: true });
  assert.match(r.text, /timestamps not supported/);
  assert.match(r.text, /Hello\. Hi you\./);
});

test('generate_audio assembles streamed audio chunks', async () => {
  const r = await mcp.callTool('generate_audio', { prompt: 'say hello', model: 'openai/gpt-audio' });
  assert.match(r.text, /Transcript: Hello/);
  const req = last('/chat/completions');
  assert.equal(req.body.stream, true);
  assert.deepEqual(req.body.modalities, ['text', 'audio']);
  assert.deepEqual(req.body.audio, { voice: 'alloy', format: 'pcm16' });
  const file = r.text.match(/\S+\.wav/)[0];
  assert.equal(fs.statSync(file).size, 44 + 4800);
});

test('generate_video sends frames, polls and downloads every output', async () => {
  const r = await mcp.callTool('generate_video', {
    prompt: 'waves',
    model: 'acme/video',
    duration: 4,
    first_frame: path.join(tmp, 'frame.png'),
    last_frame: 'https://example.com/end.png',
    wait_seconds: 20,
  });
  assert.match(r.text, /completed/);
  assert.equal(r.text.match(/\.mp4/g).length, 2);
  const frames = api.requests.find((q) => q.route === '/videos').body.frame_images;
  assert.deepEqual(frames.map((f) => f.frame_type), ['first_frame', 'last_frame']);
});

test('embeddings writes vectors to a JSON file', async () => {
  const r = await mcp.callTool('embeddings', { input: ['a', 'b'], model: 'acme/embed' });
  const file = r.text.match(/\S+\.json/)[0];
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).vectors.length, 2);
});

test('list_models forwards filters and shows voices', async () => {
  const r = await mcp.callTool('list_models', { output_modality: 'speech' });
  assert.match(r.text, /acme\/tts-1 — text → speech — in \$15\.00\/M — voices: alice, bob/);
  assert.equal(last('/models').query.output_modalities, 'speech');
});

test('credits shows the remaining balance', async () => {
  const r = await mcp.callTool('credits');
  assert.match(r.text, /Remaining: \$7\.50/);
});

test('tool errors are reported to the model, not as protocol errors', async () => {
  const r = await mcp.callTool('transcribe', { audio: path.join(tmp, 'missing.wav'), model: 'x' });
  assert.equal(r.isError, true);
  assert.match(r.text, /File not found/);
});

test('a missing API key gives an actionable message', async () => {
  const bare = startMcp({ OPENROUTER_BASE_URL: api.url });
  try {
    const r = await bare.callTool('credits');
    assert.equal(r.isError, true);
    assert.match(r.text, /OPENROUTER_API_KEY is not set/);
  } finally {
    bare.close();
  }
});
