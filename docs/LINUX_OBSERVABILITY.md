# Linux Observability

Milestone 18.2A adds database-backed Linux health observability without requiring Prometheus or Node Exporter.

Models:

- `MetricSample`
- `MetricAggregate`
- `HealthSnapshot`
- `HealthRule`
- `MonitorIncident`
- `CollectionRun`

APIs:

- `GET /api/monitoring/linux/summary`
- `GET /api/monitoring/linux/devices`
- `GET /api/monitoring/linux/devices/:deviceId`
- `GET /api/monitoring/linux/devices/:deviceId/metrics`
- `POST /api/monitoring/linux/devices/:deviceId/refresh`

Metric keys include CPU, load, memory, swap, disk, inodes, network bytes/errors, uptime, failed services, listening ports, firewall state, connector latency and process count. Unknown state is not critical by default.
