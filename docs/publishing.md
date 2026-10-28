# Publishing and releasing

## First-time setup

1. Replace the placeholders everywhere:

   ```bash
   grep -rn "YOUR_NAME\|YOUR_GITHUB_USER" --exclude-dir=.git .
   ```

2. Create the GitHub repository `claude-plugin-openrouter`, push the code, and enable:
   - **Settings → Code security → Private vulnerability reporting** (used by `SECURITY.md`),
   - branch protection on `main` requiring the CI workflow.

3. Check that the marketplace installs from GitHub:

   ```text
   /plugin marketplace add hdg-zero/claude-plugin-openrouter
   /plugin install openrouter@openrouter-marketplace
   ```

## Release checklist

1. Make sure `main` is green and `npm run check` passes locally.
2. Optionally run a live smoke test with a limited key: `chat` and `text_to_speech` on `:free` models, `list_models`, `model_details`.
3. Pick the next version following [SemVer](https://semver.org/): patch for fixes, minor for new tools or parameters, major for breaking changes (renamed tools or parameters, changed output format).
4. Update the version in **all three** files (a test enforces it):
   - `plugins/openrouter/.claude-plugin/plugin.json`
   - `.claude-plugin/marketplace.json`
   - `package.json`
5. In `CHANGELOG.md`, move the **Unreleased** entries under a new `## [x.y.z] - YYYY-MM-DD` heading and update the comparison links.
6. Run `npm run docs` and `claude plugin validate .`.
7. Commit (`chore(release): vx.y.z`), tag and push:

   ```bash
   git tag -a vx.y.z -m "vx.y.z"
   git push origin main --follow-tags
   ```

8. Create a GitHub release from the tag, using the changelog section as release notes.

Users get the update with `/plugin marketplace update openrouter-marketplace`.

## Submitting to the official plugin directory

Run the directory profile of the validator first; it reports what the directory would refuse:

```bash
claude plugin validate plugins/openrouter --profile directory
```

Then submit the plugin through the Claude plugin directory submission process. The directory also runs a safety scan and a policy review. The plugin README (`plugins/openrouter/README.md`) and the icon are what reviewers and users see first, so keep them accurate.
