---
description: Deploy Gilijet to the production droplet at 188.166.177.164 (HTTP on :80)
argument-hint: "[host=188.166.177.164]"
allowed-tools: Bash
---

# Deploy Gilijet

Ship the current working tree to the boat-ticketing droplet, build the Docker
image on the box, run `prisma db push`, and start the stack on port 80.

The script is idempotent: first run installs Docker + opens the firewall +
generates persistent secrets in `/root/.gilijet/.env`; subsequent runs just
rsync + rebuild.

## Target

Host: **${1:-188.166.177.164}** · SSH: **root** with your default key · Output: **http://${1:-188.166.177.164}/**

## What to do

1. Verify there are no uncommitted changes that the user would be surprised to deploy — if `git status --short` shows anything, summarise it in one line and ask whether to deploy as-is. (You may proceed if they confirm.)
2. Run the deploy script:

   ```bash
   bash scripts/deploy.sh ${1:-188.166.177.164}
   ```

   Stream the output as-is. The script prints `▶` headers per step and either exits 0 with the live URL, or exits non-zero after dumping `docker compose logs`.

3. On success: post the live URL, the admin-login URL, and (if `SEED_ON_START=1`) the seeded credentials, plus a one-line reminder to change them.

4. On failure: relay the relevant log lines the script printed. Do **not** retry automatically — wait for the user.

## Customising

- Different host: `/deploy 1.2.3.4`
- Different SSH key: have the user run `SSH_KEY=~/.ssh/id_ed25519 bash scripts/deploy.sh` directly — the slash command uses the default key.
- Disable the seed on subsequent runs: `SEED_ON_START=0 bash scripts/deploy.sh`

## Do NOT

- Do not commit secrets. Generated secrets live only on the server in `/root/.gilijet/.env`.
- Do not run `prisma migrate reset` or any destructive DB command from this flow.
- Do not change the host firewall beyond opening ports 22 and 80.
