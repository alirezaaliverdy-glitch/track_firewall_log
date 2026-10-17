# Bounded disposable storage

## Controls

- All services in the five maintained Compose manifests use `json-file` rotation: `max-size=10m`, `max-file=3` (approximately 30 MiB per container, not an application-data quota). Existing containers need recreation before these options apply. This rotates container stdout/stderr, not database audit/evidence records.
- Deployment cleanup removes only positively labelled unused application images and private, unused BuildKit cache. Private-cache target: 512 MB; best-effort free-space target: 8 GB. Shared/in-use image layers, containers, volumes and business data are not reclaimed to satisfy a target.
- `scripts/deploy/maintain-production-storage.sh` defaults to `--check`. Explicit `--apply` uses the same cleanup helper, preserves both current application images, and takes the same lock as deployment. It skips an active deployment, fails closed if app containers are missing, and reports critical space below 6 GiB without deleting databases/uploads/evidence.
- The systemd timer runs hourly with randomized delay as the existing deployment user. It performs no recurring Snap removal, system-package cleanup, log deletion or global Docker prune.

## Production timer

These units target the existing server checkout `/home/alireza/track_firewall_log` and deployment account `alireza`. Adapt/review those fields before using them on another server.

After the verified release is installed:

```sh
sudo install -m 0644 scripts/deploy/systemd/firewall-storage-maintenance.service /etc/systemd/system/firewall-storage-maintenance.service
sudo install -m 0644 scripts/deploy/systemd/firewall-storage-maintenance.timer /etc/systemd/system/firewall-storage-maintenance.timer
sudo systemctl daemon-reload
sudo systemctl enable --now firewall-storage-maintenance.timer
sh scripts/deploy/maintain-production-storage.sh --check
```

Inspect status with `systemctl status firewall-storage-maintenance.timer`; a critical capacity result makes the maintenance service fail visibly. To disable automation: `sudo systemctl disable --now firewall-storage-maintenance.timer`.

## Limits

This is not a guarantee that a finite disk can never fill. Database, customer uploads and other host software can grow independently. The existing 6-GiB deployment guard remains; do not lower it or erase retained evidence to force a release. Capacity growth requires monitoring and additional disk space or an explicitly agreed data-retention policy. Existing event/NetFlow/telemetry policies are unchanged. Removed build/image cache can be rebuilt/downloaded; container stdout/stderr that ages out of rotation is not retained by Docker.

Tests cover default check-only behavior, deployment-lock skipping, current-image preservation, positive image/private-cache scope, missing/invalid app images, critical space, every Compose service's log bounds and the hourly unit contract. No real device action is involved.

References: [Docker JSON-file rotation](https://docs.docker.com/engine/logging/drivers/json-file/), [BuildKit cache filters and free-space targets](https://docs.docker.com/reference/cli/docker/buildx/prune/).
