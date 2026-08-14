#!/usr/bin/env bash
# Deploy the latest image on the GCP VM. Run this in the VM's SSH terminal:
#
#   bash ~/teaching-manual-generator/deploy/update.sh
#
# It pulls the image GitHub Actions already built, then swaps the container.
# Nothing is compiled here — that is the whole point. Building on this 0.25-vCPU
# VM used to choke the machine and drop the SSH session mid-build.
set -euo pipefail

IMAGE="${IMAGE:-ghcr.io/ryuoraiden/teaching-manual-generator:latest}"
NAME="${NAME:-manual}"
ENV_FILE="${ENV_FILE:-$HOME/manual.env}"
PORT_MAP="${PORT_MAP:-127.0.0.1:3000:3000}" # localhost-only; Caddy fronts it

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found — that file holds GEMINI_API_KEY." >&2
  exit 1
fi

echo "==> Pulling $IMAGE"
# Record what's running so we can tell whether anything actually changed.
old_id="$(sudo docker images -q "$IMAGE" 2>/dev/null || true)"
sudo docker pull "$IMAGE"
new_id="$(sudo docker images -q "$IMAGE")"

if [ -n "$old_id" ] && [ "$old_id" = "$new_id" ]; then
  echo "==> Already on the latest image ($new_id)."
  echo "    If you expected a change, check the Actions run finished:"
  echo "    https://github.com/ryuoraiden/teaching-manual-generator/actions"
fi

echo "==> Swapping the container (brief downtime)"
sudo docker stop "$NAME" >/dev/null 2>&1 || true
sudo docker rm "$NAME" >/dev/null 2>&1 || true
sudo docker run -d --restart unless-stopped \
  -p "$PORT_MAP" \
  --env-file "$ENV_FILE" \
  --name "$NAME" \
  "$IMAGE"

echo "==> Waiting for the app to answer"
for i in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ || true)"
  if [ "$code" = "200" ]; then
    echo "    up after ${i}s (HTTP 200)"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "ERROR: app did not come up. Recent logs:" >&2
    sudo docker logs "$NAME" --tail 40 >&2
    exit 1
  fi
  sleep 1
done

# Old images accumulate fast (the Playwright base is ~1.5 GB) and the boot disk
# is only 30 GB, so reclaim anything no longer referenced.
echo "==> Reclaiming disk from old images"
sudo docker image prune -f >/dev/null
echo "    disk now:"
df -h / | tail -1

echo "==> Done. https://teachingmanualgenerator.app"
