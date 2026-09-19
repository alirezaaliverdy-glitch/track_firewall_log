# Vendor detection and email alerts

The Detection Rules workspace is event-backed. It does not infer a healthy or triggered state without stored vendor evidence.

## Runtime flow

`Continuous read-only collector / SecurityEvent -> vendor rule + time window -> Finding -> deduplicated email delivery`

- Linux, MikroTik, FortiGate, Cisco, and pfSense each have five curated rules.
- A rule is evaluated only against its own normalized vendor family.
- Every enabled rule at or above the recipient's selected severity (`high + critical` or `critical`) can send email. Lower-severity rules still create Findings without mail.
- Finding `rawRefsJson` stores exact event identifiers. Re-running detection, opening Findings, or restarting the API does not increment a Finding unless a new event identifier exists.
- `SecurityAlertDelivery.eventFingerprint` is unique per recipient and exact event set in PostgreSQL. This prevents duplicate email from overlapping rules and process/container restarts while allowing every registered recipient to receive its own tracked copy.
- A database-backed cooldown equal to the rule evaluation window prevents a new event in the same alert episode from producing another email.
- Email failures never prevent Finding persistence. Temporary network, DNS, timeout, connection, and SMTP 4xx failures remain in a PostgreSQL-backed `pending` queue and are retried without an attempt limit. Backoff grows from one minute to a maximum of 30 minutes, survives API/container restarts, and resumes when connectivity returns. Permanent authentication/configuration failures become `blocked` and require the Gmail connection to be corrected.
- The API starts a continuous worker after listening. It evaluates stored events every five seconds and runs enabled device collectors at their persisted interval (60 seconds by default). API event ingestion, collector batches, and suspicious Linux live-stream events also invoke immediate detection after persistence.
- Read-only SSH log polling is registered for Linux, MikroTik RouterOS, FortiGate, Cisco IOS/IOS-XE, and pfSense. Devices without a compatible SSH connection or stored credential remain visible with a sanitized collector failure; the system does not claim they are monitored successfully.

## Gmail connection from the application

An administrator can connect a Gmail sender directly in the dedicated **Security -> Email alerts** page (`/security/email-alerts`):

1. Enable 2-Step Verification for the Google account.
2. Open Google **App passwords**, create a 16-character password for Mini-SOAR, and copy it.
3. Enter the sender email and App Password, then select **Connect and verify**.
4. Add up to ten alert recipients, save the severity scope, enable automatic delivery, and use **Send test**. Addresses are normalized, validated, and deduplicated.
5. Use **Test all 5 vendors** to send separate Linux, MikroTik, FortiGate, Cisco, and pfSense messages using enabled real rule templates.

The page also shows recent real detection deliveries with the triggering rule/Finding, destination email, vendor/device, event count, attempt count, queued/blocked/sent state, send time, and next retry. Each recipient has an independent durable ledger row, and a retry always uses the destination recorded when the alert occurred. This status refreshes while the page is open. Detection Rules no longer contains sender credentials or delivery settings and stays focused on rule/monitoring operations.

The API verifies SMTP authentication against `smtp.gmail.com:587` with STARTTLS before accepting the connection. The App Password is encrypted with `CREDENTIAL_ENCRYPTION_KEY`, stored per user, explicitly redacted from request logs, and never returned by the API. Disconnecting clears the encrypted value and disables the channel. Production access to the application must use HTTPS so the submitted secret is protected in transit.

## Optional server SMTP configuration

The recipients and alert scope (`important + critical` or `critical only`) are managed in **Security -> Email alerts**. A shared SMTP relay can still be configured server-side as a fallback in `backend/.env`:

```dotenv
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_STARTTLS=true
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
PUBLIC_APP_URL=http://localhost/firewall
SECURITY_MONITORING_ENABLED=true
SECURITY_MONITOR_TICK_SECONDS=5
SECURITY_COLLECTOR_INTERVAL_SECONDS=60
```

Use `SMTP_SECURE=true` for implicit TLS (commonly port 465). Use `SMTP_STARTTLS=true` for STARTTLS (commonly port 587). If the relay does not require authentication, leave both username and password empty. Never commit SMTP or Gmail credentials.

When `SMTP_USERNAME` itself is an email address, `SMTP_FROM` may be left empty and the username is used as the sender. This keeps the common authenticated SMTP setup to host, port, username, and password/app-password.

After changing server SMTP configuration, recreate the API through `scripts/deploy/rebuild-firewall-api.ps1`, then save a recipient and use **Send test** in the page.

## Standards basis

These are operational mappings, not a certification claim. Sources include [NIST CSF 2.0](https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20), [CIS Control 8](https://www.cisecurity.org/controls/audit-log-management), [MITRE ATT&CK T1110](https://attack.mitre.org/techniques/T1110/), [MikroTik logging](https://help.mikrotik.com/docs/spaces/ROS/pages/328094/Log), [Cisco IOS XE login protection](https://www.cisco.com/c/en/us/td/docs/routers/ios-xe/security-vpn/security-vpn/m_sec-login-enhance-0.html), and [pfSense OpenVPN logging](https://docs.netgate.com/pfsense/en/latest/monitoring/logs/openvpn.html).
