# Deploy velocitygrowth.tbats.org

This package matches the layout with `src/package.json`, `src/app/` and `src/worker/`.
Copy its files into the repository root. It does not replace application code, SQL or
your README. Keep the repository at ahmedesmail01/velocitygrowth.

## What is being added

Two commit-tagged images are built in GitHub Actions: `velocitygrowth-web` and
`velocitygrowth-worker`. They run in a separate Compose project on the VPS.
Only the portal has a host port: **127.0.0.1:3100**. The worker has no inbound port.
Supabase remains hosted; no database, Redis or importer is started on this server.

The nginx file is for an existing **host nginx**, not the nginx container serving
Kidzcare. Confirm that arrangement before enabling it. Docker's port list alone
cannot identify the process already serving ports 80 and 443.

No server changes have been applied by preparing these files. Docker is unavailable
in the preparation environment, so the actual container build and startup checks
must run in GitHub Actions and on the VPS. Shell syntax and configuration structure
were checked locally. Mocked release tests passed for successful startup, pull failure
and rollback after startup failure (`python3 deploy/tests/test_release.py`, Linux).
These tests start no containers. This is not a zero-downtime deployment: recreating the web
container can briefly interrupt requests.

## 1. Check the VPS first

Connect using your usual SSH account:

```bash
ssh root@72.62.30.46
```

Run these read-only checks, or use `bash deploy/preflight.sh` after cloning the repo:

```bash
cat /etc/os-release
uname -m
free -h
df -h /
docker compose version
ss -ltnp
systemctl is-active nginx apache2 caddy
command -v certbot
```

Check that port 3100 is free, that Docker Compose supports `up --wait`, and that the
host is x86_64 (the workflow builds linux/amd64 images). The app containers have
combined memory limits of 1.25 GiB; check available RAM alongside the existing apps.
If another proxy or a hosting panel owns 80/443, configure the new virtual host there
instead of installing/replacing nginx. Do not stop any existing app or firewall.

## 2. Commit the files and set GitHub variables

Append the rules in `deploy/gitignore-additions.txt` to your root `.gitignore`.
Ignore rules do not remove files already committed. Inspect staged filenames and
make sure no private environment files, keys, node_modules or .next are included.
The application source and lockfile must also be committed under `src/`.

Set these two **repository variables** under GitHub Settings > Secrets and variables
> Actions > Variables:

| Name | Value |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | https://assoltaoxnkcfaujibma.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Your existing sb_publishable_... key |

Do not put the Supabase secret key or provider key in these variables. The build has
no need for either. GITHUB_TOKEN authenticates image publishing; no additional token
is needed for this workflow.

From your local repository root, after the working application is committed:

```bash
git add Dockerfile .dockerignore .github/workflows/images.yml deploy DEPLOYMENT.md .gitignore
git diff --cached --stat
git commit -m "build: add container images and VPS release tooling"
git push origin main
```

The workflow runs on main pushes and pull requests. Pull requests build without
publishing; main pushes publish images with the full commit SHA. Manual runs should
also use main. The web image runs TypeScript checks and a production Next.js build;
the worker image checks JavaScript syntax. This workflow does not claim to run the
SQL isolation suite: restore that suite against the reorganized SQL before adding
it as a required CI gate.

Wait for both image builds to succeed in GitHub Actions. Keep the full 40-character
commit SHA. No server deploy happens just because the images were published.

Open each GHCR package's settings and make it public if appropriate for this public
assessment repo. A public repository does not automatically make a package public.
Alternatively, keep packages private and log the VPS into GHCR using a token with
read:packages; enter it through `docker login ghcr.io -u ahmedesmail01`, not in a
command line or a committed file.

## 3. Configure the VPS

After the preflight checks, clone into a new application-specific directory:

```bash
sudo install -d -m 755 /opt/velocitygrowth
sudo git clone https://github.com/ahmedesmail01/velocitygrowth.git /opt/velocitygrowth/repo
sudo install -d -m 700 /etc/velocitygrowth
sudo install -m 600 /opt/velocitygrowth/repo/deploy/worker.env.example /etc/velocitygrowth/worker.env
sudo nano /etc/velocitygrowth/worker.env
```

Run the clone/install commands once. On later releases, retain the existing secret
file. Fill its two placeholders with your server-only Supabase key and provider key.
Do not paste the contents into chat or print `docker compose config`, which can expand
secret environment values. All release scripts run as root here because the supplied
VPS login is root; this is not a claim of a least-privilege SSH deployment account.

Then deploy the SHA for the successful workflow run:

```bash
cd /opt/velocitygrowth/repo
bash deploy/release.sh YOUR_FULL_40_CHARACTER_COMMIT_SHA
```

Starting the worker processes queued approvals automatically. Once the hosted worker
is running, stop the old local worker with Ctrl+C so operations are easier to follow.

Check the local portal response:

```bash
curl -I http://127.0.0.1:3100/login
```

Use the same release SHA to inspect only this project's services:

```bash
VERSION=YOUR_FULL_40_CHARACTER_COMMIT_SHA docker compose -p velocitygrowth -f deploy/compose.yml ps
VERSION=YOUR_FULL_40_CHARACTER_COMMIT_SHA docker compose -p velocitygrowth -f deploy/compose.yml logs --tail=80 worker
```

Web health checks test HTTP availability. A running worker is not proof of database
or provider connectivity: confirm logs and `public.send_runs.last_synced_at` for your
existing campaign. Do not send another campaign just to check that the process starts.
Docker restarts exited processes; an unhealthy-but-running process needs investigation.

## 4. Point DNS at the VPS

At the authoritative DNS provider for tbats.org, add:

| Type | Name | Value |
| --- | --- | --- |
| A | velocitygrowth | 72.62.30.46 |

Leave the root domain and other subdomains unchanged. Remove a conflicting AAAA record
for this new subdomain unless you also configure and verify the VPS IPv6 address.
If using Cloudflare, use DNS-only while issuing the initial origin certificate.

From your computer:

```bash
dig +short A velocitygrowth.tbats.org
```

It should return 72.62.30.46 before issuing the certificate.

## 5. Add HTTPS through the existing host nginx

Only use these commands after confirming the host uses nginx with the Debian/Ubuntu
sites-available and sites-enabled layout, and no existing configuration already handles
velocitygrowth.tbats.org. If this differs, stop here and adapt to the actual proxy.

```bash
sudo nginx -t
sudo install -m 644 deploy/nginx/velocitygrowth.conf /etc/nginx/sites-available/velocitygrowth.conf
sudo ln -s /etc/nginx/sites-available/velocitygrowth.conf /etc/nginx/sites-enabled/velocitygrowth.conf
sudo nginx -t
```

If the second validation succeeds:

```bash
sudo systemctl reload nginx
```

If validation fails, remove only the newly added symlink and investigate; do not reload
an invalid configuration or overwrite another site's files. The supplied config proxies
only this subdomain to 127.0.0.1:3100.

If Certbot and its nginx plugin are already installed:

```bash
sudo certbot --nginx -d velocitygrowth.tbats.org
```

Otherwise, on a confirmed Ubuntu/Debian host using apt-managed nginx:

```bash
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d velocitygrowth.tbats.org
```

Choose the HTTPS redirect if prompted. Public ports 80/443 must already reach this host.
Do not open 3100 to the internet. Check the renewal mechanism for the installed Certbot:

```bash
sudo certbot renew --dry-run
systemctl list-timers --all | grep -i certbot
curl -I https://velocitygrowth.tbats.org/login
```

Do not enable a new firewall wholesale on a server with existing apps and remote SSH.
If using Cloudflare proxy after certificate issuance, use Full (strict) TLS.

## 6. Update Google and Supabase redirects

In Supabase Authentication > URL Configuration:

- Site URL: `https://velocitygrowth.tbats.org`
- Allowed redirect: `https://velocitygrowth.tbats.org/dashboard`

In the Google OAuth web client:

- Add JavaScript origin: `https://velocitygrowth.tbats.org`
- Keep callback URI: `https://assoltaoxnkcfaujibma.supabase.co/auth/v1/callback`

Test password and Google login using all six provisioned accounts on the public domain.
Create a fresh protected result link from the public site and test it in incognito.
The old localhost link is not a submission URL. Recheck revocation on a disposable link,
then retain a separate active link/password for the submission.

## Updates and rollback

Publish a new commit, wait for both images, and run release.sh with that SHA. The script
serializes releases using flock, pulls both images first, waits for startup and records
successful versions under /var/lib/velocitygrowth. A failed readiness check attempts to
restore the previous version. Failure before startup, such as an image pull failure,
does not replace the running containers.

To manually restore the previous recorded application release:

```bash
cd /opt/velocitygrowth/repo
bash deploy/release.sh "$(cat /var/lib/velocitygrowth/previous)"
```

For later changes to the deployment scripts themselves, update the checked-out repository
after reviewing the diff. The current release script controls the images; it does not
modify Supabase schemas, roll back database data, or manage unrelated containers.
Keep old release images available. Tags identify commits but can technically be overwritten
in GHCR; do not overwrite published release tags. Container recreations briefly interrupt
the portal. Already accepted provider requests remain protected by the existing durable
job/idempotency design.

## References and validation boundary

- [Docker Compose environment precedence](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/)
- [Publishing container images with GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

The remaining evidence is the successful GitHub build, real VPS preflight/startup,
public HTTPS/OAuth checks and provider sync after the local worker is stopped. Until
those checks finish, deployment is prepared, not complete.
