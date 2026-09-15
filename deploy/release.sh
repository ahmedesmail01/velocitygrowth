#!/usr/bin/env bash
# Run on the VPS as root, after worker.env is configured.
# Usage: bash deploy/release.sh FULL_40_CHARACTER_COMMIT_SHA
set -Eeuo pipefail
version="${1:-}"
[[ "$version" =~ ^[0-9a-f]{40}$ ]] || { echo "Supply a full lowercase 40-character commit SHA."; exit 2; }
[[ -r /etc/velocitygrowth/worker.env ]] || { echo "Missing /etc/velocitygrowth/worker.env"; exit 2; }
if grep -q REPLACE_PRIVATELY_ON_VPS /etc/velocitygrowth/worker.env; then
  echo "Fill worker.env placeholders before deployment."; exit 2
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
state_dir=/var/lib/velocitygrowth
install -d -m 700 "$state_dir"
exec 9>"$state_dir/deploy.lock"
flock -n 9 || { echo "Another deployment is running."; exit 2; }
previous="$(cat "$state_dir/current" 2>/dev/null || true)"
export VERSION="$version"
compose() { docker compose -p velocitygrowth -f "$script_dir/compose.yml" "$@"; }
# Pull both images before replacing either running service.
compose pull web worker
if compose up -d --wait --wait-timeout 150 web worker; then
  if [[ "$previous" =~ ^[0-9a-f]{40}$ && "$previous" != "$version" ]]; then
    printf '%s\n' "$previous" > "$state_dir/previous"
  fi
  printf '%s\n' "$version" > "$state_dir/current.tmp"
  mv "$state_dir/current.tmp" "$state_dir/current"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$version" >> "$state_dir/releases.log"
  compose ps
  echo "Release started. Check worker logs and send_runs.last_synced_at; web health does not verify provider access."
else
  echo "Release did not become ready."
  if [[ "$previous" =~ ^[0-9a-f]{40}$ ]]; then
    export VERSION="$previous"
    compose up -d --wait --wait-timeout 150 web worker
    echo "Previous application version restored. Database data was not rolled back."
  else
    echo "No prior release recorded. Inspect this project's logs before retrying."
  fi
  exit 1
fi
