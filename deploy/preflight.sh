#!/usr/bin/env bash
# Read-only. No environment files, full container inspections or nginx config dumps.
set -u
cat /etc/os-release
free -h
df -h /
docker --version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
ss -ltnp
systemctl is-active nginx apache2 caddy || true
command -v certbot || true
getent ahostsv4 velocitygrowth.tbats.org || true
