# Deploy pipeline (build on GitHub, pull on the VM)

**The problem this solves:** the production VM is a GCP e2-micro (0.25 vCPU,
1 GB RAM). Running `docker build` there pins the machine at 100%, starves SSH so
the session drops mid-build, and has already produced a half-deployed container
serving stale code. A build took 10–20 minutes and the VM was unusable throughout.

**The fix:** GitHub Actions builds the image (free for public repos, and far
faster), pushes it to GitHub's container registry, and the VM only ever *pulls* a
finished image. Deploys become seconds, with no load spike and no dropped SSH.

Pulling is *inbound* traffic to the VM, so it does not touch GCP's ~1 GB/month
free **egress** allowance.

---

## One-time setup

### 1. Let the workflow run

`.github/workflows/deploy.yml` runs on every push to `main`. It needs no secrets
— `GITHUB_TOKEN` is provided automatically. Nothing to configure.

### 2. Make the published image public

This is the one manual step, and **the deploy will fail without it**. Packages
pushed to GHCR default to *private* even from a public repo, so the VM would get
`denied` when pulling.

After the first successful Actions run:

1. Go to <https://github.com/ryuoraiden?tab=packages>
2. Click **teaching-manual-generator**
3. **Package settings** → **Danger Zone** → **Change visibility** → **Public**

> Prefer to keep it private? Then the VM must log in once instead. Create a
> classic PAT with only `read:packages`, and on the VM run:
> ```bash
> echo 'YOUR_TOKEN' | sudo docker login ghcr.io -u ryuoraiden --password-stdin
> ```
> Docker stores the credential, so this is also a one-time step.

### 3. Get the update script onto the VM

In the **VM's SSH terminal**:

```bash
cd ~/teaching-manual-generator && git pull
```

---

## Deploying, from now on

1. `git push` from your PC.
2. Wait for the green tick at
   <https://github.com/ryuoraiden/teaching-manual-generator/actions> (~5–8 min
   the first time, faster after, thanks to layer caching).
3. In the **VM's SSH terminal**:

```bash
bash ~/teaching-manual-generator/deploy/update.sh
```

That pulls the new image, swaps the container, waits for HTTP 200, and reclaims
disk from old images. If the app fails to come up it prints the container logs
and exits non-zero rather than leaving you guessing.

**The VM never builds again.** You can close the SSH tab during step 2 — the
build is happening on GitHub, not on your machine.

---

## Rolling back

Every build is also tagged with its commit SHA, so you can pin an older one:

```bash
IMAGE=ghcr.io/ryuoraiden/teaching-manual-generator:<commit-sha> \
  bash ~/teaching-manual-generator/deploy/update.sh
```

Find the SHA in the Actions run summary, or with `git log --oneline`.

---

## Notes and gotchas

- **The container swap has a few seconds of downtime.** Acceptable here; a
  zero-downtime swap would need a second container and a Caddy config change.
- **Background generation jobs are held in memory**, so a deploy drops any
  in-flight generation. They last about a minute — avoid deploying while someone
  is mid-generation. Teachers see "please generate again", not a hang.
- **Port mapping is `127.0.0.1:3000:3000` on purpose.** Caddy owns 80/443 and
  proxies to localhost. Publishing to `0.0.0.0:80` makes the container fail to
  start and the site returns 502. The script hard-codes the correct mapping.
- **`~/manual.env` stays on the VM only.** The image never contains the Gemini
  key — `.dockerignore` excludes `.env*`, and the key is injected at run time.
- **A stale container is the confusing failure mode.** If the app behaves oddly
  after a deploy, confirm the swap actually happened:
  ```bash
  sudo docker ps --format '{{.Image}}\t{{.Status}}'
  ```
