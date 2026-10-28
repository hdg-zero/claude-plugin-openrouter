# 🤖 AGENTS.md — claude-plugin-openrouter

> **Charte suprême et non négociable** pour tout développeur ou agent IA (Claude Code, Antigravity, Cursor, Windsurf, Copilot) travaillant sur ce dépôt.
> En cas de conflit avec une autre consigne du dépôt, ce fichier prévaut. Toute dérogation suit le [Protocole d'Escalade](#-final--protocole-descalade--definition-of-done).

| | |
| --- | --- |
| **Projet** | `claude-plugin-openrouter`, plugin Claude Code donnant accès aux modèles OpenRouter (texte, image, TTS, STT, musique, vidéo, embeddings) |
| **Type** | CLI/Tool : serveur MCP (JSON-RPC 2.0 sur stdio) + manifestes de plugin |
| **Stack principale** | Node.js ≥ 18.17, JavaScript CommonJS, **zéro dépendance** (`fetch`, `node:fs`, `node:test`) |
| **Stack secondaire** | Manifestes JSON (`plugin.json`, `marketplace.json`, `.mcp.json`), Markdown, GitHub Actions YAML |
| **Maturité / Taille** | Greenfield · 1K-10K LOC (~1,1K) |
| **Équipe** | Open source |
| **i18n** | N/A (pas d'UI) |
| **Tests** | `node:test` + faux serveur OpenRouter (`test/helpers.js`) |
| **Formatter / Linter** | Aucun outil : `.editorconfig` + `node --check` + `npm run docs:check` |
| **CI/CD** | GitHub Actions (`.github/workflows/ci.yml`, Node 18/20/22/24) |
| **Généré le** | 2026-10-28 |

**Conventions existantes à préserver :** zéro dépendance runtime · version unique dans `plugins/openrouter/.claude-plugin/plugin.json` · `docs/tools.md` généré · stdout réservé au protocole · erreurs d'outil renvoyées à Claude (`isError: true`) · noms d'outils et de paramètres en `snake_case` · Conventional Commits · Keep a Changelog.

**Sections omises :** §3 i18n (aucune UI) · §7 DevOps/IaC (aucune infrastructure gérée).

---

## 🧠 §0 — Principes fondamentaux d'exécution (Karpathy)

Ces 4 principes gouvernent le comportement de l'agent et priment sur toutes les sections suivantes.

### 0.1 🟠 THINK BEFORE CODING

- Ambiguïté → exposer les hypothèses, poser la question, **STOP**.
- Avant d'implémenter : compromis + alternatives en 2-3 lignes.
- Forme d'une requête/réponse OpenRouter inconnue → **lire la référence API** (`https://openrouter.ai/docs/llms.txt`), ne jamais deviner un nom de champ.

✅ CORRECT
```text
Hypothèse : le paramètre `negative_prompt` de /images n'existe pas au niveau racine.
La doc le place sous provider.options.<slug>. Deux options :
 A) l'exposer comme paramètre d'outil générique `provider_options` (objet libre)
 B) ne rien ajouter et le documenter dans le README
Je recommande B (simplicité). Valides-tu ?
```
❌ INCORRECT
```js
// "Ça doit s'appeler comme ça"
body: { model, prompt, negative_prompt }, // champ inventé, renvoie 400 en production
```

### 0.2 🟠 SIMPLICITY FIRST

- Code minimal pour la demande exacte. Pas d'abstraction prématurée, pas de configurabilité non demandée.
- Pas de gestion d'erreur pour un scénario impossible.
- Test : si 200 lignes peuvent devenir 50 lignes lisibles, réécrire.

✅ CORRECT
```js
async credits() {
  const { data } = await api('/credits');
  const left = data.total_credits - data.total_usage;
  return `Purchased: $${data.total_credits.toFixed(2)} · Used: $${data.total_usage.toFixed(2)} · Remaining: $${left.toFixed(2)}`;
},
```
❌ INCORRECT
```js
class CreditsService extends BaseOpenRouterService {
  constructor(httpClientFactory, formatterStrategy = new DefaultCurrencyFormatter('USD')) { /* … */ }
}
```

### 0.3 🟠 SURGICAL CHANGES

- Toucher uniquement le périmètre demandé. **Interdit :** refactoring d'opportunité, reformatage du code adjacent, réécriture de commentaires non liés.
- Supprimer uniquement les orphelins créés par **vos** modifications. Code mort préexistant : le signaler, ne pas le toucher.
- Traçabilité : chaque ligne du diff se rattache à la demande.

✅ CORRECT
```diff
   async transcribe({ audio, model, language, diarize, timestamps, keyterms }) {
-    const base = { model, input_audio, language, diarize, keyterms };
+    const base = { model, input_audio, language, diarize, keyterms, temperature };
```
❌ INCORRECT
```diff
-  async transcribe({ audio, model, language, diarize, timestamps, keyterms }) {
+  async transcribe(args) {          // renommage non demandé
+    const { audio, model } = args;  // + 40 lignes « nettoyées » sans rapport avec la demande
```

### 0.4 🟠 GOAL-DRIVEN EXECUTION

- Plan : `[Étape] → vérification : [critère concret]`.
- Ne jamais déclarer une tâche terminée sans critère vérifié (voir Definition of Done).

✅ CORRECT
```text
1. Ajouter `temperature` au schéma de `transcribe` → vérif : apparaît dans tools/list
2. Le transmettre à POST /audio/transcriptions   → vérif : test qui inspecte last('/audio/transcriptions').body.temperature
3. Régénérer la doc                               → vérif : npm run docs:check OK
4. CHANGELOG [Unreleased] > Added                 → vérif : entrée présente
```
❌ INCORRECT
```text
J'ajoute temperature, ça devrait marcher.
```

---

## ⛔ §1 — Règles absolues universelles

### 1.1 🔴 EXÉCUTION CONTRÔLÉE

Interdit sans validation explicite de l'utilisateur : `npm test`, `npm run check`, `npm run docs`, `npm start`, `claude plugin validate`, toute commande qui écrit, publie, tagge ou pousse.
**Interdit en toutes circonstances sans accord :** tout appel réel à l'API OpenRouter avec une clé, car **il consomme des crédits facturés**. Si l'accord est donné : modèles `:free` en priorité, coût annoncé avant l'appel.

✅ CORRECT
```text
Modification terminée. Pour vérifier, je propose : `npm run check` (syntaxe + doc + 23 tests, sans réseau).
Je le lance ?
```
❌ INCORRECT
```bash
OPENROUTER_API_KEY=$KEY node -e "…generate_video({ model: 'google/veo-3.1', duration: 8 })"  # 4 $ dépensés sans accord
```

### 1.2 🔴 SÉCURITÉ & SECRETS

- Aucune clé API, aucun token, aucune URL signée ni aucun chemin machine dans le code, les tests, la doc, les logs ou les sorties d'outil.
- La clé vient **uniquement** de `process.env.OPENROUTER_API_KEY`, transmise par `.mcp.json` (`${OPENROUTER_API_KEY:-}`).
- Ne jamais renvoyer `job.urls` (URLs vidéo signées) à Claude. Utiliser l'endpoint `/videos/{id}/content`.
- Clé exposée → la signaler à l'utilisateur pour révocation, ne pas la réutiliser.
- Garde-fou : le test `no secret is committed` (`test/manifests.test.js`) doit rester vert.

✅ CORRECT
```js
const KEY = process.env.OPENROUTER_API_KEY;
// tests : clé factice
mcp = startMcp({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_BASE_URL: api.url });
```
❌ INCORRECT
```js
const KEY = process.env.OPENROUTER_API_KEY || 'sk-or-v1-86af…';   // clé réelle en dur
console.error(`Calling ${url} with key ${KEY}`);                    // fuite dans les logs
return `Video ready: ${job.urls[0]}`;                               // URL signée exposée
```

### 1.3 🟠 TYPES FORTS / PAS DE MAGIC STRINGS

Stack JavaScript sans TypeScript, donc :
- valeurs d'énumération → constantes figées (`Object.freeze`) ou tables de correspondance nommées (`MIME`, `EXT_FOR_MIME`) ;
- contrats d'entrée → **JSON Schema** (`inputSchema` avec `enum`, `minimum`, `required`) ;
- structures complexes → `@typedef` JSDoc.

S'applique au **nouveau code**. Les littéraux existants (ex. statuts vidéo `'pending'`) sont tolérés : ne pas les refactorer hors demande (§0.3).

✅ CORRECT
```js
const VIDEO_STATUS = Object.freeze({ PENDING: 'pending', IN_PROGRESS: 'in_progress', COMPLETED: 'completed', FAILED: 'failed' });
const RUNNING = new Set([VIDEO_STATUS.PENDING, VIDEO_STATUS.IN_PROGRESS]);
if (RUNNING.has(job.status)) { /* poll */ }

// contrat d'outil
format: { type: 'string', enum: ['mp3', 'pcm'] },
```
❌ INCORRECT
```js
if (job.status === 'pending' || job.status === 'in-progress') { /* faute de frappe silencieuse : jamais vrai */ }
format: { type: 'string', description: 'mp3 or pcm' },   // aucune contrainte vérifiable
```

### 1.4 🟠 DISPATCH TYPÉ

- Le dispatch MCP passe **uniquement** par `handlers[params.name]`, et chaque handler a un schéma de même nom dans `TOOLS`.
- Méthodes JSON-RPC : `switch` exhaustif avec `default` → erreur `-32601`.
- Endpoints OpenRouter : chemins littéraux centralisés dans le handler qui les utilise, un endpoint par handler (voir `docs/architecture.md` › Endpoint mapping).

✅ CORRECT
```js
const fn = handlers[params.name];
if (!fn) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
```
❌ INCORRECT
```js
if (params.name.includes('image')) return generateImage(params.arguments); // dispatch par sous-chaîne
eval(`handlers.${params.name}`)(params.arguments);                         // exécution dynamique
```

---

## 📦 §2 — Git : commits, hygiène & CHANGELOG

### 2.1 🔴 HYGIÈNE DU DÉPÔT

Ne jamais commiter : médias générés, secrets, dépendances, configs IDE/OS. Référence `.gitignore` :

```gitignore
# Médias générés en local
openrouter-output/
# Dépendances, logs, couverture
node_modules/
npm-debug.log*
coverage/
# Secrets et environnement local
.env
.env.*
!.env.example
*.pem
# OS / IDE
.DS_Store
Thumbs.db
.idea/
.vscode/
```

✅ CORRECT
```bash
git add plugins/openrouter/server/index.js test/server.test.js docs/tools.md CHANGELOG.md
```
❌ INCORRECT
```bash
git add -A   # embarque openrouter-output/speech-….wav et un .env local
```

### 2.2 🟠 CONVENTIONAL COMMITS

Format : `type(scope): description` (minuscules, impératif, sans point final).
Types : `feat` `fix` `refactor` `docs` `style` `test` `chore` `perf` `ci` `build`.
Scopes : nom d'outil (`tts`, `stt`, `image`, `video`, `audio`, `chat`, `models`, `embeddings`) ou zone (`server`, `manifest`, `docs`, `ci`, `release`).

✅ CORRECT
```text
feat(stt): forward temperature to transcription requests
fix(tts): retry in pcm when the model rejects mp3
chore(release): v0.2.0
```
❌ INCORRECT
```text
Updated stuff.
fix: Fixed the bug in TTS and also refactored video polling
```

### 2.3 🟠 CHANGELOG.md (Keep a Changelog 1.1.0)

- Section `## [Unreleased]` toujours présente. Dates ISO 8601.
- Rubriques : `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security`.
- Obligatoire pour `feat`, `fix`, `refactor` visible, breaking change, `security`.
- Release : version identique dans `plugin.json`, `marketplace.json` et `package.json` (vérifié par `test/manifests.test.js`), liens de comparaison à jour.

✅ CORRECT
```markdown
## [Unreleased]

### Added

- `transcribe`: `temperature` parameter.
```
❌ INCORRECT
```markdown
## v0.2 (28/10/2026)
- divers changements
```

---

## 🏗️ §4 — Architecture & séparation des couches

Pattern CLI/MCP, découpé ainsi dans `plugins/openrouter/server/index.js` :

| Couche | Rôle | Éléments |
| --- | --- | --- |
| Contrat | Schémas vus par Claude | `TOOLS` |
| Protocole | JSON-RPC stdio, dispatch, erreurs | `handle`, `send`, `main` |
| Logique | Un handler par outil : arguments → requête → résultat | `handlers.*` |
| I/O | HTTP, fichiers, encodage média | `request`, `api`, `publicApi`, `loadMedia`, `toContentPart`, `outFile`, `writeTo`, `saveAudio` |

### 4.1 🔴 STDOUT = PROTOCOLE

Seul `send()` écrit sur stdout. Diagnostics → `console.error`.

✅ CORRECT
```js
console.error(`[openrouter] retrying ${p} after ${res.status}`);
```
❌ INCORRECT
```js
console.log('debug:', body);   // corrompt le flux JSON-RPC, Claude Code coupe le serveur
```

### 4.2 🔴 ZÉRO DÉPENDANCE RUNTIME

Le plugin s'exécute depuis un clone, **sans `npm install`**. Aucune entrée `dependencies` dans `package.json`, aucun `require` hors modules `node:*` et fichiers locaux.

✅ CORRECT
```js
const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
```
❌ INCORRECT
```js
const axios = require('axios');                 // casse l'installation du plugin
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
```

### 4.3 🟠 HANDLERS : ARGUMENTS → APPEL → RÉSULTAT

- Un handler = un outil = un endpoint principal. Transformations média et HTTP déléguées aux helpers I/O.
- Retour : `string` ou tableau de contenus MCP (`text()`, `{ type: 'image', … }`).
- Échec : `throw new Error('message actionnable')`. Le protocole le convertit en `isError: true`, à destination de Claude.
- Fichiers produits : `outFile()` + `writeTo()` dans `OPENROUTER_OUTPUT_DIR` ou dans l'`output_path` explicite. Jamais ailleurs.

✅ CORRECT
```js
async embeddings({ input, model, dimensions, output_path }) {
  const body = await api('/embeddings', { method: 'POST', body: { model, input, dimensions } });
  const vectors = (body.data || []).map((d) => d.embedding);
  const file = writeTo(output_path ? path.resolve(output_path) : outFile(null, 'embeddings', 'json')(), JSON.stringify({ model: body.model || model, input, vectors }));
  return `${vectors.length} vector(s) of dimension ${vectors[0]?.length ?? '?'} written to ${file}${costNote(body.usage)}`;
},
```
❌ INCORRECT
```js
async embeddings(args) {
  const res = await fetch('https://openrouter.ai/api/v1/embeddings', { /* contourne request() : pas de timeout, pas d'ApiError, ignore OPENROUTER_BASE_URL */ });
  fs.writeFileSync('/tmp/vectors.json', await res.text());                  // hors du dossier de sortie
  return { success: true };                                                 // ni contenu MCP, ni chemin
}
```

### 4.4 🟠 FALLBACKS EXPLICITES ET VISIBLES

Un repli (mp3 → pcm, verbose_json → json) se déclenche uniquement sur un statut précis (`err.status === 400`), seulement si l'appelant n'a pas imposé l'option, et il est signalé dans la sortie.

✅ CORRECT
```js
} catch (err) {
  if (!(timestamps && !diarize && err.status === 400)) throw err;
  body = await api('/audio/transcriptions', { method: 'POST', body: base });
  note = '(timestamps not supported by this model)\n';
}
```
❌ INCORRECT
```js
} catch {
  body = await api('/audio/transcriptions', { method: 'POST', body: base }); // avale 401/402/500, résultat dégradé en silence
}
```

---

## 🧪 §5 — Stratégie de tests

Runner : **`node:test`** (`npm test` = `node --test`). Assertions : `node:assert/strict`.

### 5.1 🔴 AUCUN APPEL RÉSEAU RÉEL DANS LA SUITE

Les tests passent par le faux serveur (`startFakeApi`) via `OPENROUTER_BASE_URL`, avec une clé factice. Pas de dépendance à Internet, pas de coût.

✅ CORRECT
```js
api = await startFakeApi({
  'POST /audio/speech': (req, body, res) => binary(res, Buffer.alloc(4800), 'audio/pcm'),
});
mcp = startMcp({ OPENROUTER_API_KEY: 'sk-or-test', OPENROUTER_BASE_URL: api.url, OPENROUTER_OUTPUT_DIR: path.join(tmp, 'out') });
```
❌ INCORRECT
```js
mcp = startMcp({ OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }); // appelle la vraie API, facture, non déterministe
```

### 5.2 🟠 COUVERTURE OBLIGATOIRE

Tout changement de comportement = test ajouté ou modifié. Chaque outil a au moins un test qui vérifie :
1. **la requête exacte** envoyée à OpenRouter (champs conformes à la doc officielle) ;
2. **le résultat** renvoyé à Claude (texte, fichiers, `isError`).

✅ CORRECT
```js
test('text_to_speech falls back to pcm and writes a playable wav', async () => {
  const r = await mcp.callTool('text_to_speech', { turns: [{ text: 'Hi', voice: 'a' }], model: 'pcm-only' });
  const wav = fs.readFileSync(r.text.match(/\S+\.wav$/)[0]);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
  assert.equal(last('/audio/speech').body.response_format, 'pcm');
});
```
❌ INCORRECT
```js
test('tts works', async () => {
  const r = await mcp.callTool('text_to_speech', { text: 'Hi', model: 'x' });
  assert.ok(r); // ne vérifie ni la requête ni le fichier
});
```

### 5.3 🟠 TESTS DÉTERMINISTES ET ISOLÉS

Dossier temporaire par suite (`fs.mkdtempSync`) nettoyé dans `after()`. Pas de dépendance à l'ordre des tests, sauf état explicitement local au fichier. Pas de `setTimeout` arbitraire.

✅ CORRECT
```js
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'openrouter-plugin-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
```
❌ INCORRECT
```js
const OUT = './openrouter-output';   // pollue le dépôt, collisions entre runs
await sleep(3000);                    // test lent et fragile
```

### 5.4 🟡 NOMMAGE DES TESTS

Convention existante à préserver : phrase `<outil> <comportement attendu> [when <condition>]`.

✅ `test('transcribe falls back to plain text when timestamps are unsupported', …)`
❌ `test('test 7', …)` · `test('should_work', …)`

---

## 🔌 §6 — Contrats MCP & API OpenRouter

Adaptation de « Design d'API » : le projet n'expose pas de REST mais **deux frontières** : les outils MCP (côté Claude) et l'API OpenRouter (côté sortant).

### 6.1 🔴 VALIDATION À LA FRONTIÈRE

- Tout argument d'outil est décrit dans `inputSchema` (type, `enum`, bornes, `required`).
- Tout chemin local est résolu (`path.resolve`) et son existence vérifiée avant lecture (`loadMedia`).
- Les écritures restent dans le dossier de sortie, ou dans l'`output_path` explicitement demandé.

✅ CORRECT
```js
n: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of images.' },
// …
if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
```
❌ INCORRECT
```js
n: { description: 'how many' },                    // aucune contrainte
buf = fs.readFileSync(src);                        // ENOENT brut, chemin non résolu
```

### 6.2 🟠 CONFORMITÉ STRICTE À L'API OPENROUTER

- Noms de champs en `snake_case`, identiques à la référence (`response_format`, `input_audio`, `frame_images`…).
- Toute nouvelle forme de requête/réponse est justifiée par un lien vers la doc (`https://openrouter.ai/docs/…`) dans la PR.
- Endpoints publics (`/models`, `/images/models`, `/videos/models`) → `publicApi` (sans clé obligatoire). Le reste → `api`/`request` (clé requise).

✅ CORRECT
```js
body: { model, input_audio: { data: m.base64, format: m.ext }, response_format: 'verbose_json', timestamp_granularities: ['segment'] }
```
❌ INCORRECT
```js
body: { model, audioData: m.base64, responseFormat: 'verbose' }   // camelCase et valeur inventés
```

### 6.3 🟠 ERREURS STRUCTURÉES ET ACTIONNABLES

- HTTP → `ApiError` (`status` + message OpenRouter : `OpenRouter <status>: <message>`).
- Erreur d'outil → `{ content: [text(message)], isError: true }`. Erreur de protocole → code JSON-RPC (`-32601`, `-32602`, `-32603`, `-32700`).
- Le message dit **quoi faire** (variable à définir, outil à appeler).

✅ CORRECT
```js
throw new Error('OPENROUTER_API_KEY is not set. Create a key at https://openrouter.ai/keys and export it before starting Claude Code.');
```
❌ INCORRECT
```js
throw new Error('Error');                          // inexploitable par Claude
return { error: true };                            // ni contenu MCP ni isError
```

### 6.4 🟠 STABILITÉ DU CONTRAT DES OUTILS

Renommer ou supprimer un outil ou un paramètre, ou changer le format de sortie, est un **breaking change** : bump MAJOR (≥ 1.0.0) ou MINOR (0.x), entrée `Changed`/`Removed` au CHANGELOG, `npm run docs`. Ajouter un paramètre optionnel n'en est pas un.

✅ CORRECT
```js
temperature: { type: 'number', minimum: 0, maximum: 1 },   // ajout optionnel, rétro-compatible
```
❌ INCORRECT
```js
audio_file: { type: 'string' },   // renomme silencieusement `audio` → casse les prompts existants
```

---

## 🎨 §8 — Nommage, formatting & linting

### 8.1 🟡 RÉFÉRENCE DE FORMAT

Aucun formatter automatique. Références : `.editorconfig` (UTF-8, LF, 2 espaces, newline finale) et le style du fichier modifié (quotes simples, points-virgules, `async/await`, fonctions fléchées pour les helpers courts). Contrôles : `node --check` + `npm run docs:check`.
Interdit : reformater du code existant à la main, introduire Prettier/ESLint sans accord (§10).

✅ CORRECT
```js
const isUrl = (s) => /^https?:\/\//i.test(s);
```
❌ INCORRECT
```js
const isUrl = function(s){ return /^https?:\/\//i.test(s) }   // style étranger au fichier
```

### 8.2 🟠 CONVENTIONS DE NOMMAGE

| Élément | Convention | Exemple |
| --- | --- | --- |
| Outils MCP et leurs paramètres | `snake_case` (aligné sur l'API) | `text_to_speech`, `output_path`, `wait_seconds` |
| Fonctions / variables JS | `camelCase` | `loadMedia`, `toContentPart`, `costNote` |
| Constantes de module | `UPPER_SNAKE_CASE` | `TIMEOUT_MS`, `PCM_SAMPLE_RATE` |
| Classes | `PascalCase` | `ApiError` |
| Variables d'environnement | `OPENROUTER_*` | `OPENROUTER_OUTPUT_DIR` |
| Fichiers | `kebab-case.js`, tests `*.test.js` | `generate-tool-docs.js`, `server.test.js` |
| Fichiers générés | `<prefix>-<ISO timestamp>[-n].<ext>` via `outFile()` | `speech-2026-10-28T13-28-11-615Z.wav` |

✅ `async text_to_speech({ voice_references = [], output_path }) {`
❌ `async textToSpeech({ voiceRefs, outPath }) {`, qui casse la symétrie avec `TOOLS` et avec l'API

---

## 📚 §9 — Documentation

### 9.1 🟠 DOC GÉNÉRÉE = SOURCE DE VÉRITÉ

`docs/tools.md` est **généré** depuis `TOOLS`. Jamais d'édition manuelle. Tout changement de schéma → `npm run docs` (après accord §1.1), puis commit du résultat. La CI échoue sinon.

✅ CORRECT
```js
speed: { type: 'number', description: 'Playback speed multiplier, if the model supports it.' },
```
❌ INCORRECT
```markdown
<!-- édition directe de docs/tools.md --> | `speed` | number | no | Vitesse |
```

### 9.2 🟠 EN-TÊTE DE MODULE

Chaque fichier `.js` commence par 1-3 lignes décrivant son rôle (après le shebang et le SPDX si présents).

✅ CORRECT
```js
#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Minimal MCP server (stdio, JSON-RPC 2.0) exposing OpenRouter to Claude: …
```
❌ INCORRECT
```js
const fs = require('node:fs');   // aucun contexte
```

### 9.3 🟠 DESCRIPTIONS D'OUTILS ÉCRITES POUR LE MODÈLE

`description` d'outil et de paramètre : quand l'utiliser, valeurs attendues, outil de découverte à appeler (`FIND`). Une phrase utile vaut mieux qu'un paragraphe.

✅ `description: 'ISO-639-1 code, e.g. "fr". Auto-detected if omitted.'`
❌ `description: 'language'`

### 9.4 🟠 PRÉSERVATION DES COMMENTAIRES

Ne pas supprimer ni réécrire les commentaires existants non liés à la modification (§0.3). Commenter uniquement le non-évident (le « pourquoi »).

✅ `// Some models only produce pcm (Gemini TTS, HeyGen): retry when the caller left the format open.`
❌ `// increment i` · suppression d'un commentaire voisin « pour faire propre »

### 9.5 🟡 DOCUMENTS SYNCHRONISÉS

Nouvel outil, variable d'environnement ou changement d'architecture → mettre à jour `README.md` **et** `README.fr.md` (tableaux Features/Configuration), `plugins/openrouter/README.md` (liste des outils), `docs/architecture.md` (Endpoint mapping). Documentation en anglais, sauf `README.fr.md`.

---

## 📦 §10 — Gestion des dépendances

### 10.1 🔴 AUCUNE DÉPENDANCE RUNTIME

Voir §4.2. Tout besoin couvert par Node ≥ 18.17 (fetch, web streams, `node:test`, `Buffer`, `AbortSignal.timeout`) doit l'être nativement.

### 10.2 🟠 DÉPENDANCE DE DÉVELOPPEMENT = JUSTIFICATION ÉCRITE

Ajout en `devDependencies` uniquement avec : besoin précis, pourquoi le natif ne suffit pas, version exacte pinnée, projet activement maintenu. Accord utilisateur requis.

✅ CORRECT
```text
Proposition : ajouter `markdownlint-cli2@0.18.1` (devDependency) pour linter README et docs en CI.
Natif insuffisant : Node ne fournit aucun linter Markdown.
Impact : aucun sur le plugin installé (devDependency, non chargée au runtime). Valides-tu ?
```
❌ INCORRECT
```json
"devDependencies": { "jest": "^29", "lodash": "*" }
```

### 10.3 🟡 COMPATIBILITÉ NODE

Ne pas utiliser d'API absente de Node 18.17 (plancher déclaré dans `engines` et testé en CI). Monter le plancher = breaking change (§6.4).

✅ `buf.subarray(0, 4)` · `Array.prototype.at`
❌ `require('node:sqlite')` · `fs.globSync()` (absents de Node 18)

### 10.4 🟡 ACTIONS CI À JOUR

Versions majeures pinnées (`actions/checkout@v4`). Mises à jour via Dependabot (`.github/dependabot.yml`).

---

## 🌿 §11 — Workflow Git, branches & code review

### 11.1 🟠 GITHUB FLOW

`main` toujours vert et publiable. Une branche courte par changement, PR vers `main`, CI verte obligatoire, merge puis suppression de la branche. Releases = tags `vX.Y.Z` (`docs/publishing.md`).

✅ `git switch -c feat/stt-temperature` → PR → CI ✅ → squash merge
❌ commit direct sur `main` · branche `dev` permanente

### 11.2 🟠 NOMMAGE DES BRANCHES

`type/description-courte` en kebab-case, mêmes types que §2.2.

✅ `feat/video-reference-images` · `fix/tts-pcm-fallback` · `docs/readme-troubleshooting`
❌ `patch1` · `john-branch` · `Feature/TTS`

### 11.3 🟡 PR ATOMIQUES

Une PR = un changement logique. Template `.github/PULL_REQUEST_TEMPLATE.md` rempli, lien vers la doc OpenRouter utilisée.

✅ PR « feat(stt): forward temperature » : schéma + handler + test + doc + CHANGELOG
❌ PR « misc » mélangeant nouvel outil vidéo, refacto TTS et bump CI

### 11.4 🟡 SELF-REVIEW

Avant soumission : relire le diff complet ; vérifier §0.3 (traçabilité), §1.2 (aucun secret), checklist DoD.

---

## 🚨 §FINAL — Protocole d'escalade & Definition of Done

### Protocole d'escalade

Quand une règle 🔴 ou 🟠 ne peut pas être respectée, l'agent **DOIT** :
1. **IDENTIFIER** la règle (numéro + libellé exact).
2. **EXPLIQUER** pourquoi elle est inapplicable ici.
3. **PROPOSER** une alternative fidèle à l'esprit de la règle.
4. **ATTENDRE** la validation explicite de l'utilisateur.

⚠️ Jamais d'ignorance, de contournement ni de violation silencieuse.

```text
⚠️ Conflit : §4.2 🔴 ZÉRO DÉPENDANCE RUNTIME
Raison : le décodage d'un flux vidéo pour en extraire une vignette n'existe pas en natif.
Alternative : renvoyer le mp4 sans vignette et laisser Claude proposer ffmpeg à l'utilisateur.
→ J'attends ta validation avant d'aller plus loin.
```

### Definition of Done

Les commandes de vérification sont **proposées** à l'utilisateur, puis lancées seulement après son accord (§1.1).

#### Feature (`feat`)
- [ ] Schéma `inputSchema` complet et contraint (§1.3, §6.1), description écrite pour le modèle (§9.3)
- [ ] Handler conforme aux couches (§4.3), champs conformes à la doc OpenRouter, lien cité (§6.2)
- [ ] Zéro dépendance ajoutée (§4.2), compatible Node 18.17 (§10.3)
- [ ] Test vérifiant requête **et** résultat, sans réseau (§5.1, §5.2)
- [ ] `docs/tools.md` régénéré (§9.1) · README EN/FR et `docs/architecture.md` à jour si besoin (§9.5)
- [ ] CHANGELOG `[Unreleased] › Added` (§2.3)
- [ ] `npm run check` vert (après accord)

#### Correction (`fix`)
- [ ] Cause racine identifiée (requête non conforme, mauvais parsing, repli manquant…)
- [ ] Test de non-régression reproduisant le bug via le faux serveur
- [ ] Diff limité au correctif (§0.3)
- [ ] CHANGELOG `[Unreleased] › Fixed` (§2.3)
- [ ] `npm run check` vert (après accord)

#### Refactoring (`refactor`)
- [ ] Comportement observable identique : mêmes requêtes envoyées, mêmes sorties d'outil
- [ ] Tous les tests existants passent **sans modification de leurs assertions**
- [ ] Aucun schéma d'outil modifié (sinon c'est `feat` ou breaking change, §6.4)
- [ ] CHANGELOG `[Unreleased] › Changed` si visible (§2.3)

#### Documentation (`docs`)
- [ ] `docs/tools.md` non édité à la main (§9.1)
- [ ] Commandes, variables et liens vérifiés contre le code et la doc OpenRouter
- [ ] README EN et FR cohérents (§9.5)

#### Maintenance (`chore`, `ci`, `build`)
- [ ] Aucun impact sur `plugins/openrouter/server/index.js` ni sur les schémas
- [ ] Dépendances de dev justifiées et pinnées (§10.2) · actions CI pinnées (§10.4)
- [ ] Release : version identique dans les 3 manifestes, CHANGELOG daté, tag `vX.Y.Z` (§2.3)
