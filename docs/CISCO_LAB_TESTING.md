# Cisco Lab Testing

Milestone 18.2A test coverage is fixture-based and read-only.

Before enabling live IOS-XE SSH execution:

1. Verify prompt transitions and privilege mode on a lab Catalyst IOS-XE device.
2. Verify `terminal length 0` and restore behavior.
3. Run only allowlisted read commands.
4. Confirm output limits, timeouts and secret redaction.
5. Confirm capability refresh records connector invocation truthfully.
6. Keep mutations disabled until ActionPlan backup/verification/rollback exists.
