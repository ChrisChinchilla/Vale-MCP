---
name: prerelease
description: Publish a vale-mcp prerelease (release candidate) to the npm "next" tag so new features can be tested before the stable release. Bumps to X.Y.Z-rc.N, opens a PR, then (after it is merged) creates a GitHub prerelease, which the publish workflow sends to npm without touching "latest". Use when the user says "prerelease", "release candidate", "rc", "beta", "publish for testing" or "test before releasing".
---

# Prerelease vale-mcp

A **prerelease** is a version like `0.3.0-rc.1` published to npm under the
`next` dist-tag. `npx vale-mcp@latest` keeps getting the stable version;
testers opt in with `npx vale-mcp@next` (or pin the exact version).

It uses the same machinery as the `release` skill: creating a **GitHub
Release** marked `--prerelease` runs `.github/workflows/publish.yml`, which
publishes with trusted publishing (OIDC, no token) and `--tag next`. The
workflow refuses to run if the tag doesn't match `package.json`, or if a
`-rc` version isn't flagged as a prerelease (or a stable one is). Never run
`npm publish` locally. Creating the GitHub prerelease is the outward-facing
step, so only do it when the user has asked for it.

## 1. Preconditions

- `git checkout main && git pull`; working tree clean (ignore untracked `.idea/`).
- CI green on `main`: `gh run list --workflow CI --branch main --limit 1`.
- `publish.yml` on `main` contains `--tag next` (older copies would fail on
  npm 11, which refuses prerelease versions without a tag).
- What's live: `npm view vale-mcp dist-tags versions`.

## 2. Choose the version

- Target stable version `X.Y.Z`: decide as in the `release` skill (semver
  from `## Unreleased` in `CHANGELOG.md`).
- Prerelease number: `N` = highest existing `X.Y.Z-rc.*` + 1, starting at 1.
  Check `git tag -l 'vX.Y.Z-rc.*'` and `npm view vale-mcp versions`; a
  published version can never be reused, so skip any that exist on npm.
- Use `rc` unless the user asks for `alpha`/`beta` (any `-<id>.N` works).
- Always set the version explicitly; `npm version prerelease` would bump
  from the current stable (0.2.1 → 0.2.2-rc.0), not toward the target.

## 3. Prerelease PR

1. `git checkout -b prerelease/X.Y.Z-rc.N`
2. `npm version X.Y.Z-rc.N --no-git-tag-version`
3. Leave `CHANGELOG.md` headings alone: `## Unreleased` stays, because the
   changelog is only finalized by the stable release.
4. `npm test` (rebuilds `build/`; CI fails if `build/` differs from `src/`).
   Commit anything it changed.
5. Commit, push, `gh pr create --base main --title "Prerelease X.Y.Z-rc.N"`;
   in the body say what testers should try (the Unreleased changelog items).
6. Wait for CI (`gh pr checks`), then **ask the user to merge**.

## 4. Create the prerelease (after the PR is merged)

1. `git checkout main && git pull`; `package.json` is `X.Y.Z-rc.N` and CI on
   `main` is green.
2. Write notes to a file in the scratchpad: a first line saying
   "Prerelease for testing. Install with `npx vale-mcp@next`", then the
   `## Unreleased` section of the changelog, then a short "Please test"
   list.
3. `gh release create vX.Y.Z-rc.N --target main --prerelease --title "vX.Y.Z-rc.N" --notes-file <file>`
4. Watch: `gh run list --workflow "Publish to npm" --limit 1`, `gh run watch <id>`.

## 5. Verify

- Poll `npm view vale-mcp@X.Y.Z-rc.N version` every ~15s (the registry lags a
  few minutes after the workflow goes green).
- `npm view vale-mcp dist-tags --json`: `next` is the new rc and **`latest`
  is unchanged**. If `latest` moved, stop and tell the user.
- Smoke test outside the repo: `cd $(mktemp -d) && npx -y vale-mcp@next --version`.
- Give the user the MCP client config for testing:
  ```json
  { "command": "npx", "args": ["vale-mcp@next"] }
  ```
  (pin `vale-mcp@X.Y.Z-rc.N` to avoid surprises between rcs), and the
  release URL.

## Variant: test work that isn't merged yet

To let people try a feature branch without merging it:
1. Branch from the feature branch, merge in current `main` (so `publish.yml`
   is up to date), then do steps 3.2-3.4 on that branch.
2. Push it and run step 4 with `--target <that-branch>`; no PR is needed.
3. The tag now points at a commit that isn't on `main`. Never merge the
   version-bump commit; when the feature merges, the stable release bumps
   the version from `main`.

## After testing: go stable

Cut the stable release with the `release` skill (`npm version X.Y.Z` works
from an rc version). Afterwards the `next` tag still points at the old rc;
ask the user to run `npm dist-tag add vale-mcp@X.Y.Z next` (or
`npm dist-tag rm vale-mcp next`) because dist-tag changes need their npm
login; the OIDC publish only covers `npm publish`.

## If something fails

- Workflow guard "does not match" / "not marked as a prerelease": the tag,
  `package.json` version and `--prerelease` flag disagree. Delete the
  release and tag (`gh release delete vX.Y.Z-rc.N --cleanup-tag`, with the
  user's OK), fix, and recreate; nothing was published.
- Publish auth errors (`EOTP`, `ENEEDAUTH`, 404): see the `release` skill's
  failure section (trusted publisher settings, npm >= 11.5.1).
- "Cannot publish over existing version": bump `N` and start again.
- A bad rc is already on `next`: publish `rc.N+1`, or ask the user to run
  `npm deprecate vale-mcp@X.Y.Z-rc.N "reason"`.
