# Agent sandbox

A devcontainer for running coding agents (Claude Code, codex, opencode) against
this repo with three isolation layers: filesystem (only the workspace is
mounted), credentials (nothing sensitive exists inside), and network (default-
deny egress with a small allowlist).

## The model

Give the agent a **dedicated clone**, not your working checkout. Everything is
driven from the terminal via the devcontainer CLI
(`npm install -g @devcontainers/cli`):

```bash
git clone git@github.com:<you>/hexmapper.git ~/agents/hexmapper
cd ~/agents/hexmapper
devcontainer up --workspace-folder .
devcontainer exec --workspace-folder . claude     # or: codex, opencode, bash
```

After changing anything under `.devcontainer/`, restart with
`devcontainer up --workspace-folder . --remove-existing-container` (add
`--build-no-cache` if the Dockerfile changed but a stale image is reused).

## Multiple agents in parallel

One clone per agent; each clone gets its own container:

```bash
git clone git@github.com:<you>/hexmapper.git ~/agents/hexmapper-2
devcontainer up --workspace-folder ~/agents/hexmapper-2
devcontainer exec --workspace-folder ~/agents/hexmapper-2 claude
```

The `node_modules` and rust-target volume names include the clone's folder
basename, so containers never share build state — keep clone directory names
unique. The cargo registry volume is intentionally shared across all clones
(it's a download cache; cargo's own locking makes concurrent use safe). Each
container runs `npm ci` and its own firewall on first boot; agents on different
clones can only interact with each other the same way they interact with you —
through pushed branches.

The agent works on branches and pushes; you review PRs from your normal
environment. The committed pre-push hook (`.githooks/pre-push`, activated by
`npm ci` via the `prepare` script) runs the full test suite inside the
container before anything reaches origin.

## Credentials — what goes in, what stays out

In (each scoped and revocable):

- `CLAUDE_SANDBOX_API_KEY` on the **host** is forwarded as `ANTHROPIC_API_KEY`;
  likewise `CODEX_SANDBOX_API_KEY` → `OPENAI_API_KEY` and
  `OPENROUTER_SANDBOX_API_KEY` → `OPENROUTER_API_KEY`. Use dedicated keys with
  spend limits, not your main ones. Unset = that agent logs in interactively
  instead (codex's ChatGPT-plan login works; its auth endpoints are
  allowlisted).
- GitHub: run `gh auth login` (or set a credential helper) inside the container
  with a **fine-grained PAT scoped to this one repo**, contents + pull-requests
  only. Never your primary `gh` session.
- Supabase **local-stack** keys only, via `.env` (copy values from
  `supabase status` on the host).

Out, permanently: SSH keys, `~/.aws`/cloud configs, supabase access tokens or
staging/prod DB passwords, the docker socket, your host Claude config/memory.
Deploys happen exclusively through GitHub Actions, so the agent never needs any
of them.

## Network

`init-firewall.sh` runs at every container start (`NET_ADMIN` is granted for
exactly this) and sets default-deny egress with an allowlist: the Anthropic,
OpenAI, and OpenRouter APIs (plus models.dev for opencode's registry),
GitHub (IP ranges from api.github.com/meta), npm, crates.io, the Playwright
CDN, DNS, and the host-gateway supabase ports (54321–54324). Everything else —
including outbound SSH — is dropped. Known gap: port 53 is open, so DNS
tunneling is possible; the firewall is an exfiltration barrier, not a proof.

## Supabase / database access

The supabase stack keeps running on the **host** as usual; the container
reaches it at `host.docker.internal:54321/54322`. The test gate picks this up
automatically (`HEXMAP_PG_HOST` is set), so `npm run test:all` runs the Rust
integration tests against a scratch database on your local Postgres.

Not available inside: the supabase CLI (it needs the docker socket). The pgTAP
suite therefore soft-skips in the sandbox — it still gates every PR and deploy
in CI, and you can run `supabase test db` on the host.

## Playwright

Specs are collected (`--list`) by the test gate but browsers are not
preinstalled. If you want the agent to run E2E against a local vite server,
run `npx playwright install --with-deps chromium` inside the container once —
note the download requires the CDN entries already in the allowlist.
