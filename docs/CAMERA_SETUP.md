# Camera workspace

Open **Assets → Cameras** (`/firewall/assets/cameras`). Camera/NVR inventory is scoped to the current user's workspace. The app does not scan or open a video feed automatically when this page loads.

## Connect the supplied network

1. Make sure the API server can reach the camera LAN through a local route or VPN. A public server cannot reach `192.168.18.0/24` just because the browser is on that LAN. Docker Desktop multicast may not cross to the physical LAN; the bounded unicast search and manual registration still work when routing allows them.
2. Enable ONVIF on the cameras/NVR and create an account permitted to view their media. Some vendors require a separate ONVIF user. Enter credentials in the app, not in chat or a stream URL.
3. Select **Add device → Discover network**, enter `192.168.18.0/24`, and search. Select the ONVIF candidates and add them. A credential mismatch remains an explicit connection error; it is not a connected camera.
4. To add the recorder directly, select **Manual setup → NVR**, enter `192.168.18.50`, its ONVIF port/path and credentials. Its returned video-source/profile records become selectable channels and qualities. Main/sub profiles with the same source token form one channel. The supplied screenshot shows camera HTTP port 80, but the NVR's ONVIF port must be confirmed on that device.
5. If a device does not expose ONVIF, select manual RTSP and enter its manufacturer-provided `rtsp://<device-ip>:<port>/<path>` without credentials in the URL. Store the username/password in the separate fields. A possible RTSP discovery row is a hint, not proof of a camera or a valid stream path.

HTTPS ONVIF endpoints require a valid certificate trusted by the API and matching the registered IP. HTTP ONVIF and RTSP should use a trusted LAN/VPN. Only private IPv4 targets are supported in this release. Device-returned HTTP/media/PTZ addresses must use that device's registered IP; aliases or a different internal recorder address are rejected. No TLS verification bypass, external redirect following, or default-password guessing is provided.

## Available functions

- ONVIF WS-Discovery plus bounded unicast `/onvif/device_service` probing; private ranges up to 256 addresses and up to eight search ports.
- Device identity, firmware/serial when exposed, Media/Media2 profiles, channel source tokens, supported stream/snapshot availability and PTZ profile indication.
- Authenticated browser preview using server-side FFmpeg RTSP/TCP decoding to MJPEG: four frames/second, width at most 960 pixels, no audio, at most four active views per workspace and eight globally. Streams stop on disconnect and after three minutes; visible clients reconnect and recheck the session. Background tabs pause. The full source stream is not recorded.
- Profile selection, fullscreen, HTTP ONVIF snapshot with Basic/Digest support, RTSP snapshot fallback, and download of a single image to the operator's device.
- Rename/location, replace connection credentials, retry verification, and remove from app. These metadata operations do not modify camera configuration.
- Registered ONVIF `GotoPreset` and `SystemReboot` controls with persisted camera ActionPlans, preview, one explicit confirmation, Camera PolicyGuard, real SOAP connector acknowledgment and audit. Reboot is admin-only. GotoPreset requires an advertised PTZ profile and a preset returned by that device. The UI reports **accepted**, not proof that a movement/reboot has completed; inspect the feed or recheck connection afterward. Other application vendor execution rules and protected lab behavior are unchanged.

Discovery is brand-independent for compatible ONVIF devices, not a guarantee for every camera. Proprietary discovery protocols, firmware upgrades, factory resets, storage management, video recording/replay, audio and continuous PTZ joystick control are not implemented. An NVR may expose only some channels, and cameras on its private PoE subnet may be available only through those channels. This connector currently reads up to 32 profiles per device. Never infer missing channel identity or pretend an inaccessible stream is working.

## Deployment and migration

The API image includes FFmpeg. Both development and production use the same API build; no extra public camera or RTSP port is exposed by the application. Camera connection credentials and media URLs are encrypted with the existing credential-encryption service. They are excluded from list/detail/audit responses; child stderr is not logged. Snapshots are streamed to the authenticated caller, not stored on the application disk.

The additive `20261012150000_camera_workspace` migration creates camera inventory and camera ActionPlan tables in a transaction. A legacy database whose API role does not own `AppUser` needs **REFERENCES on AppUser(id)** to create the owner foreign key, in addition to schema CREATE. The production update script checks these prerequisites before replacing the running deployment. If needed, the existing table owner/DB administrator runs `scripts/deploy/prepare-camera-migration.sql` with `psql -v api_role=<existing_api_role>`; this grants only the ID-column reference permission and changes no table ownership or user data. Do not grant superuser membership to the API role.

Sources: [ONVIF Profile T](https://www.onvif.org/profiles/profile-t/), [ONVIF Media specification](https://www.onvif.org/specs/srv/media/ONVIF-Media-Service-Spec-v230.pdf), [Browser live-media delivery](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/Live_streaming_web_audio_and_video).
