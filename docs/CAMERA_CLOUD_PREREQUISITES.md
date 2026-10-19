# XMEye Cloud ID integration: external prerequisite, not enabled

2026-10-19: operator confirmed the remote viewing app is XMEye/XMEye Plus,
and that neither a licensed Linux SDK package nor Open Platform application
access is available. No working cloud connector/streaming claim is made and
no placeholder is registered as a working connection mode. Direct/VPN camera
viewing and NVR monitoring remain unchanged.

## What is missing

Cloud ID is a vendor-rendezvous identity, not an IP address, RTSP URL or a
universal cross-brand protocol. Existing direct DVRIP/ONVIF readers do not
provide vendor P2P traversal or relay. The official FunSDK supports device-ID
login but also documents platform application initialization/credentials;
the official REST platform documents application identity and signed device
tokens, plus userToken for live-stream URL functions. A serial number/device
password alone cannot substitute for EOSNET application authorization in this
documented integration path. The customer's specific OEM/firmware and ID format
must also be checked against the selected licensed integration.

The remaining deliverable needs one of:

- Official licensed SDK for the Linux server architecture, its redistribution
  terms, developer documentation and the required EOSNET application identity.
- Approved EOSNET Open Platform access with live-stream entitlement, and an
  authorized test device/account for end-to-end acceptance.

No account registration, commercial agreement, SDK/license extraction, borrowed
OEM/sample application keys, external relay service or transmission of stored
customer credentials has been performed. Do not paste application secrets into
chat, source, command arguments, screenshots or documentation.

## Intended end-user experience after application authorization

EOSNET's administrator provisions the provider once in protected server settings.
Customers do NOT each need developer accounts. Inside their company camera
workspace they select XMEye Cloud ID, enter ID/device username/password, check
online status and select supported NVR channels. Device credentials remain
encrypted and all media requests remain authenticated and company-scoped.

A server-side licensed adapter should acquire an actual vendor session/stream
and feed the existing authenticated browser-compatible media pipeline. SDK
isolation, secret-free errors, private expiring media URLs, lease cleanup,
per-workspace stream limits and mobile codec compatibility require tests.
Do not show connected before a real vendor login/media session; explicitly
report offline, rejected credentials, unsupported OEM and missing entitlement.
Cloud monitoring/actions must show only capabilities actually exposed by the
licensed provider, not reuse direct-address management assumptions.

## Primary references checked

- [JFTech prerequisites and token flow](https://docs.jftech.com/docs?lang=en&menusId=7623b997428c49dd9976d3041af56b03).
- [Official API overview: token/status/live-stream interfaces](https://docs.jftech.com/?lang=en&menusId=7623b997428c49dd9976d3041af56b03&siderid=dda2f15d450244e690dacb13ce2471e7).
- [Official FunSDK FAQ: device-ID login and application initialization](https://github.com/xmeye/openplatform-docs/blob/master/docs/FunSDKDevelopmentGuide/FunSDKDevelopmentGuide-FAQ.md).
- [JFTech developer platform](https://open.jftech.com/).
