# Deploying to Oracle Cloud (always-free VM)

A step-by-step guide to host the Teaching Manual Generator on an Oracle Cloud
"always free" VM. Defaults to **Ubuntu 22.04**. Where Oracle Linux differs, it's
noted inline.

The end result: your app running 24/7 at `http://<your-ip>/` (and optionally a
domain with HTTPS).

> Unlike a Discord bot (outbound only), a website needs an **inbound port
> opened** — that's Phase 3, and it's the step people most often miss on Oracle
> (there are *two* firewalls to get past).

---

## Phase 1 — Create the VM

1. Oracle Cloud Console → **Menu → Compute → Instances → Create instance**.
2. **Image:** Canonical **Ubuntu 22.04**.
3. **Shape:** click *Change shape* → **Ampere (Arm)** → `VM.Standard.A1.Flex`.
   Set **2 OCPU / 12 GB RAM** (well within the always-free 4 OCPU / 24 GB, and
   plenty for Chromium — don't use the 1 GB AMD micro, it's too small for PDF
   export).
   - *If you get "Out of host capacity":* Ampere is popular. Try a different
     Availability Domain, or retry later / another region.
4. **SSH keys:** upload your existing public key (the same one you use for the
   bots) or let Oracle generate one and **download the private key**.
5. **Create.** When it's running, copy the **Public IP address**.

---

## Phase 2 — Connect

From your PC:

```bash
ssh ubuntu@<your-public-ip>
# Oracle Linux uses the user `opc` instead of `ubuntu`:
# ssh opc@<your-public-ip>
```

(If you generated a new key: `ssh -i /path/to/private.key ubuntu@<ip>`.)

Confirm the OS:

```bash
cat /etc/os-release   # look for Ubuntu 22.04 (or Oracle Linux)
```

---

## Phase 3 — Open the web port (the Oracle gotcha)

There are **two** firewalls. You must open port **80** in **both**.

### 3a. Cloud firewall (Security List)
Console → your instance → **Virtual Cloud Network** → **Security Lists** →
*Default Security List* → **Add Ingress Rules**:
- Source CIDR: `0.0.0.0/0`
- IP Protocol: `TCP`
- Destination Port Range: `80`
- (Add a second rule for `443` now too, for HTTPS later.)

### 3b. VM firewall (on the machine)
Ubuntu Oracle images ship with iptables rules that block inbound traffic. Open 80:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

> **Oracle Linux** uses firewalld instead:
> ```bash
> sudo firewall-cmd --permanent --add-service=http
> sudo firewall-cmd --permanent --add-service=https
> sudo firewall-cmd --reload
> ```

---

## Phase 4 — Install the tools

```bash
# Node.js 22 (skip if you already have v22 from the bots — check: node -v)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

# pm2 to keep the app alive across crashes/reboots (same idea as your bots)
sudo npm install -g pm2
```

> **Oracle Linux:** replace `apt-get install` with `dnf install`, and install
> Node via `curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -`.

---

## Phase 5 — Get the code

The GitHub repo is **private**, so the server needs permission to read it.
Easiest: authenticate once with the GitHub CLI.

```bash
sudo apt-get install -y gh
gh auth login          # choose GitHub.com → HTTPS → login with a browser code
gh repo clone ryuoraiden/teaching-manual-generator
cd teaching-manual-generator
```

(Alternative: make the repo public, then a plain
`git clone https://github.com/ryuoraiden/teaching-manual-generator.git` works
with no auth.)

---

## Phase 6 — Build

```bash
npm install
npx playwright install --with-deps chromium   # installs Chromium + system libs
node scripts/download-fonts.mjs               # Malayalam fonts for PDF export
npm run build
```

> `--with-deps` needs sudo and works on Ubuntu. On **Oracle Linux** it may miss a
> few libraries; if Chromium fails to launch later, install them with `dnf` (the
> error message names what's missing) or switch the VM to Ubuntu.

---

## Phase 7 — Add your secret key

Create `.env.local` on the server (it is git-ignored, so `git pull` never
touches it — same file you have locally):

```bash
nano .env.local
```

Paste (use your real key):

```
GEMINI_API_KEY=your-key-here
```

Save with `Ctrl+O`, `Enter`, then `Ctrl+X`. `npm start` loads this automatically.

---

## Phase 8 — Run it with pm2

```bash
pm2 start npm --name teaching-manual -- start
pm2 save
pm2 startup        # prints one `sudo ...` command — copy-paste and run it,
                   # so the app restarts automatically after a reboot
```

Quick check that it's up locally:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # expect 200
```

---

## Phase 9 — Put nginx in front (clean URL on port 80)

```bash
# Copy the repo's nginx config into place
sudo cp deploy/nginx.conf /etc/nginx/sites-available/teaching-manual
sudo ln -s /etc/nginx/sites-available/teaching-manual /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # remove the "Welcome to nginx" page
sudo nginx -t                                  # test config — should say "ok"
sudo systemctl reload nginx
```

Now open **`http://<your-public-ip>/`** in a browser. Your app is live. 🎉

---

## Phase 10 (optional) — Domain + HTTPS

If you claimed the free student `.me` domain:

1. At your domain registrar, add an **A record** pointing to your VM's public IP.
2. Put the domain in nginx: edit `/etc/nginx/sites-available/teaching-manual`,
   change `server_name _;` to `server_name yourdomain.me;`, then
   `sudo nginx -t && sudo systemctl reload nginx`.
3. Free HTTPS via Let's Encrypt:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.me
   ```
   Certbot edits nginx for you and auto-renews. Site is now `https://yourdomain.me`.

---

## Updating later (after you push code changes)

```bash
cd ~/teaching-manual-generator
git pull
npm install                       # only if dependencies changed
npx playwright install chromium   # only if Playwright version changed
npm run build
pm2 restart teaching-manual
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Browser can't reach the IP at all | Port 80 not open in **both** firewalls (Phase 3). Re-check the Security List *and* `sudo iptables -L -n \| grep 80`. |
| `curl localhost:3000` fails on the VM | App not running: `pm2 logs teaching-manual` to see the error. |
| Generation errors with "GEMINI_API_KEY is not set" | `.env.local` missing/empty, or you didn't `pm2 restart` after creating it. |
| PDF export 500s, logs mention missing libraries | Chromium system deps missing — re-run `npx playwright install --with-deps chromium` (Ubuntu) or install the named libs (Oracle Linux). |
| Upload of a real textbook fails / 413 error | `client_max_body_size` — already set to 50M in the provided nginx.conf; make sure you copied it. |
| App died after reboot | You skipped the `pm2 startup` command in Phase 8. |
| Out of memory during `npm run build` | You're on the 1 GB micro. Use the A1 Flex shape with more RAM, or add swap. |

Useful commands: `pm2 status`, `pm2 logs teaching-manual`, `pm2 restart teaching-manual`, `sudo systemctl status nginx`.
