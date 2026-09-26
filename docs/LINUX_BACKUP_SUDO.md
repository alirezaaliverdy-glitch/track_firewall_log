# Linux backup sudo correction — 2026-09-26

The registered account on server116 can run sudo -n id -u successfully.
The saved sudo option was false, so the old backup path read /etc as an
unprivileged user. This was an application-side selection issue, not missing
sudo rights on the server.

Linux backups now retry a permission-denied collection using the fixed,
noninteractive command sudo -n tar -czf - -C / etc. Already enabled sudo
credentials use that command immediately. Other failures are not retried.
Password prompts remain explicit errors; no password is placed in commands,
logs, source files or history. General action privileges and sudoers are unchanged.

Live verification: server116 produced a validated 698,249-byte archive and
its authenticated download passed SHA-256 integrity verification.
