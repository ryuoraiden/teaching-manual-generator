# Deploying to Google Cloud (always-free e2-micro VM)

Always-on, free-forever hosting on GCP's always-free tier, using the repo's
`Dockerfile` (Chromium + all libs baked in, so PDF export just works). Simpler
than the Oracle route — no nginx, no manual Playwright setup.

End result: your app running 24/7 at `http://<vm-external-ip>/`.

> **Three things that make this "free forever":** the VM must be an **e2-micro**,
> in a **US free-tier region** (`us-central1`, `us-west1`, or `us-east1`), with a
> **standard (not SSD) 30 GB disk**. Anything else may bill. GCP also gives a
> $300/90-day trial credit that covers any small overage while you learn.

---

## Phase 1 — Project & VM

1. https://console.cloud.google.com → create/select a project. Enable billing
   (card required to open the account; the e2-micro within limits is **not**
   charged).
2. **Compute Engine → VM instances → Create instance.**
3. Set:
   - **Region:** `us-central1` (must be a free-tier region — this is required for "always free").
   - **Machine type:** series **E2**, **`e2-micro`** (0.25–2 vCPU, 1 GB).
   - **Boot disk:** *Change* → **Ubuntu 22.04 LTS**, **Standard persistent disk**, 30 GB.
   - **Firewall:** ✅ check **Allow HTTP traffic**. (That's the whole firewall
     step — GCP's default Ubuntu image doesn't block inbound like Oracle does,
     so there's no second in-VM firewall to fight.)
4. **Create.** Copy the **External IP** when it's running.

---

## Phase 2 — Connect

Click the **SSH** button next to the VM in the console (opens a browser
terminal — no key setup needed). Everything below runs in that terminal.

---

## Phase 3 — Add swap (important on 1 GB)

1 GB RAM is tight for building Next.js and running Chromium. A swap file prevents
out-of-memory crashes:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h            # should now show ~4G swap
```

---

## Phase 4 — Install Docker & get the code

```bash
# Docker
sudo apt-get update && sudo apt-get install -y docker.io git
sudo systemctl enable --now docker

# The repo is private — authenticate once, then clone
sudo apt-get install -y gh
gh auth login          # GitHub.com → HTTPS → login with a browser one-time code
gh repo clone ryuoraiden/teaching-manual-generator
cd teaching-manual-generator
```

(Or make the repo public and use a plain `git clone https://github.com/ryuoraiden/teaching-manual-generator.git`.)

---

## Phase 5 — Your secret key

Create an env file for Docker (git-ignored name; keep the key out of the image):

```bash
echo "GEMINI_API_KEY=your-key-here" > ~/manual.env
```

---

## Phase 6 — Build & run

```bash
sudo docker build -t manual .
sudo docker run -d --restart unless-stopped \
  -p 80:3000 --env-file ~/manual.env --name manual manual
```

- `-p 80:3000` — serve the app on port 80 (the browser default), mapped to the
  container's port 3000. No nginx needed for plain HTTP.
- `--restart unless-stopped` — survives crashes and VM reboots.

Now open **`http://<your-external-ip>/`** — live, always on, free. 🎉

Check it locally on the VM if the browser doesn't load:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/    # expect 200
sudo docker logs manual --tail 50                              # see app logs
```

---

## Phase 7 (optional) — Domain + HTTPS

1. Point your free student `.me` domain's **A record** at the VM's external IP.
2. Easiest HTTPS on a VM is **Caddy** (auto-certificates). Stop the direct
   port-80 mapping and let Caddy proxy instead:
   ```bash
   sudo docker stop manual && sudo docker rm manual
   sudo docker run -d --restart unless-stopped \
     --env-file ~/manual.env --name manual --expose 3000 manual
   # then run Caddy in front — ask and I'll give you the Caddyfile + command
   ```
   (Skip this until the basic HTTP version works.)

---

## Updating after you push code

```bash
cd ~/teaching-manual-generator
git pull
sudo docker build -t manual .
sudo docker stop manual && sudo docker rm manual
sudo docker run -d --restart unless-stopped \
  -p 80:3000 --env-file ~/manual.env --name manual manual
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser can't reach the IP | "Allow HTTP traffic" wasn't checked. Console → VM → Edit → tick it (or add a firewall rule for tcp:80 from 0.0.0.0/0). |
| `docker build` killed / OOM | Swap not added (Phase 3), or the build spiked. Re-check `free -h`; if it persists, build the image on your PC and push to a registry instead — ask me. |
| "GEMINI_API_KEY is not set" at generation | `~/manual.env` missing/typo'd, or you forgot `--env-file`. Recreate it and re-run the container. |
| PDF export fails, others work | Chromium ran out of memory (1 GB is tight). Usually fine single-user; if it recurs, that's the nudge to a 2 GB machine. |
| Site works then dies after reboot | Missing `--restart unless-stopped` on `docker run`. |

Handy: `sudo docker ps` (running?), `sudo docker logs manual -f` (live logs),
`sudo docker restart manual`.

> **Free-tier watch-outs:** stay on `e2-micro` in a US free region with a
> standard disk. GCP's free egress is ~1 GB/month (plenty for a demo — each
> page/PDF is small); heavy real-world traffic could exceed it and bill a few
> cents, covered by the $300 trial credit.
