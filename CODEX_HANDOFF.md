# Current handoff

The current task adds standalone VMware ESXi host support. The integration is **partial** and host-only: registration, verified SOAP inventory and a bounded set of reviewed host actions. VM power/configuration is not implemented. See [scope and acceptance notes](docs/ESXI_STANDALONE.md).

The backend/frontend builds, focused unit tests and command catalog validation passed. The local lab API/web are deployed and healthy; the additive ESXi enum migration is applied. A real ESXi host has not been available, so no live-host action has been tested. Before production deployment, ensure the migration role owns the existing DeviceType enum (or run the one-line migration as its owner), and validate TLS, least-privilege inventory and one approved non-disruptive action on the actual ESXi version. Never claim all ESXi features or live compatibility as complete without that acceptance.

Project rules are in AGENTS.md; current work status is in docs/CURRENT_STATUS.md and docs/TASK_HISTORY.md.
