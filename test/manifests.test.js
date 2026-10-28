// Static checks on the plugin and marketplace manifests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const plugin = read('plugins/openrouter/.claude-plugin/plugin.json');
const marketplace = read('.claude-plugin/marketplace.json');
const pkg = read('package.json');

test('versions are in sync across manifests', () => {
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(entry, 'plugin is listed in the marketplace');
  assert.equal(entry.version, plugin.version);
  assert.equal(pkg.version, plugin.version);
  assert.match(plugin.version, /^\d+\.\d+\.\d+(-[\w.]+)?$/, 'semantic version');
});

test('the changelog has an entry for the current version', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, new RegExp(`^## \\[${plugin.version.replace(/\./g, '\\.')}\\]`, 'm'));
});

test('the marketplace source points at the plugin folder', () => {
  const entry = marketplace.plugins.find((p) => p.name === plugin.name);
  assert.ok(fs.existsSync(path.join(root, entry.source, '.claude-plugin', 'plugin.json')));
});

test('the icon referenced by plugin.json exists', () => {
  assert.ok(fs.existsSync(path.join(root, 'plugins/openrouter', plugin.icon)));
});

test('the MCP config starts the bundled server with the API key from the environment', () => {
  const { mcpServers } = read('plugins/openrouter/.mcp.json');
  const server = mcpServers.openrouter;
  assert.equal(server.command, 'node');
  assert.equal(server.args[0], '${CLAUDE_PLUGIN_ROOT}/server/index.js');
  assert.equal(server.env.OPENROUTER_API_KEY, '${OPENROUTER_API_KEY:-}');
});

test('no secret is committed', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'openrouter-output'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      e.isDirectory() ? walk(p) : files.push(p);
    }
  };
  walk(root);
  const keyPattern = new RegExp(['sk', 'or', 'v1', '[0-9a-f]{32,}'].join('-'));
  for (const f of files) {
    if (/\.(png|jpg|mp3|mp4|wav)$/.test(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), keyPattern, `possible API key in ${path.relative(root, f)}`);
  }
});
