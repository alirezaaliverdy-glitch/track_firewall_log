# Local web deployment and Docker image hygiene

Use the project helper for every local `firewall-web` rebuild:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy\rebuild-firewall-web.ps1
```

The helper records the image currently used by `firewall-web`, builds and recreates only that service, waits for its health check, and then removes the exact previous image only when no container uses it. If the build or health check fails, the previous image is retained for recovery. Docker can also reclaim the old untagged image automatically; that is treated as a successful cleanup.

The helper does not run `docker image prune`, `docker system prune`, `docker builder prune`, or forced removal. Those commands can remove layers or caches belonging to unrelated projects. Build cache is separate from deployable images and should be reviewed explicitly with `docker system df` before any manual cleanup.
