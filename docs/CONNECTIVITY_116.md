# Server 116 connectivity diagnosis — 2026-09-26

The API container reached the registered SSH endpoint on port 22022 and received
a valid SSH banner. Authentication with the saved credential was rejected
(SSH_AUTH_FAILED), including a keyboard-interactive attempt. Passwords and
raw vendor output were not printed or changed.

The connectivity sensor now keeps authentication rejection degraded instead of
escalating it to offline. It uses the management channel credential and persists
changes in diagnostic code immediately. Only successful authenticated probes or
collections reset management status to online and trigger recovery collection.

To finish recovery, update the credential in the device's connection setup and
test the management connection. Do not change the registered port or mark it
online manually. Reachable service and authorized management are distinct.

Verification: seven isolated connectivity regression tests passed, including
repeated authentication rejection, real service banners and recovery to online.

Update: the user confirmed that server 116 connectivity recovered. The original
diagnosis above records the earlier failure; it is not a claim about current status.
