# Camera studio and verified NVR configuration

## Where to find it

Assets → Cameras → company → recorder → dedicated NVR workspace:

- Overview & sensors: actual readings, freshness, missing coverage and history.
- Disks & health: capacity/used/free in GiB, reported disk status, available SMART/temperature, monitoring schedule and an explicit read-only diagnostic run.
- Recording: current disk-full policy and per-channel recording mode, with preview and confirmation.
- Connection & identity: connection setup and native device identity/channel details, no longer above every sensor screen.

Live views support viewport fullscreen even when native fullscreen is unavailable/rejected (iPhone fallback), digital zoom, rotation, mirror and four remembered accent colors. Display transforms do not change camera configuration. Escape/exit restores the view and scroll/focus.

## Real device configuration, not generic CGI execution

The compatible AppWeb2.0 adapter reads `/CGI/General/general` and `/CGI/Record/record/channels/<0..127>`. Only two registered changes are exposed:

- `nvr_overwrite`: `OverWrite` (replace oldest footage) or `StopRecord` (stop new recording when full).
- `nvr_recording_mode`: main stream `ConfigRecord` (existing schedule), `ManualRecord` (manual/continuous) or `ClosedRecord` (stop recording), separately per channel.

Preview reads actual settings without changing the device. Execution requires the existing camera PolicyGuard, selected owned verified recorder, allowed role/page, current connection revision, one-use unexpired preview, `intent=execute` and explicit confirmation. A full configuration hash detects changes since preview. The connector reads again, preserves all unrelated fields/schedules/extended-stream configuration, changes one allowlisted field and accepts only an explicit OK followed by matching device read-back. Acknowledgment alone is not success. The device does not expose an atomic conditional write; external management should avoid concurrent edits.

No arbitrary path/body, format, partition, reset, network/account/clock mutation, automatic reboot or bulk channel rewrite is provided. Other vendor monitoring adapters continue working; these configuration commands are not claimed for all brands. Selecting a configured recording mode is not proof that footage is being written.

On the operator's actual recorder, read-only acceptance obtained both settings: circular overwrite and scheduled channel recording. A separate real read obtained 16 configured channels and one disk with internally consistent capacity and a vendor-reported normal state. No real customer configuration was changed during acceptance.

## What a disk check means

The diagnostics action performs a fresh non-destructive vendor probe, checks reported faults, available SMART/temperature and capacity consistency. Missing readings stay unknown. A full circular-overwrite disk is not automatically a failed disk; usage at or above90% is amber rather than a green health claim.

This AppWeb firmware does not expose a verified SMART self-test command, SMART attributes or temperature through its observed monitoring interface. The UI explicitly distinguishes read-only diagnosis from a physical SMART/sector test. `selfTestStarted=false`; no storage operation is repurposed as a health test. Existing vendor adapters may report SMART status where actually available. Physical disk testing for unsupported devices still requires a documented vendor connector or an authorized maintenance workflow; universal health-test support is not implemented.

## Recorded playback and export

`camera-replay.ts` discovers actual ONVIF recording/search/replay services and up to32 real recording handles, obtains real archive bounds and validates a past5–60-second window. `replay-rtsp.ts` supplies a one-use loopback RTSP bridge with server-side authentication, fixed device IP/port/control tracks, bounded framing and injected ONVIF replay `Require`, UTC clock `Range` and `Rate-Control:no`. A live/npt response or wrong replay time fails closed. `camera-media.ts` decodes a bounded H.264 MP4 excerpt in memory: at most12MiB, one request/workspace and two global replay jobs, with cancellation/deadlines and no persistent recording cache. Credentials, upstream URLs and decoder stderr never reach the browser/audit.

- GET `/:id/recordings`: sanitized metadata, never service URLs.
- GET `/:id/playback`: authenticated view; browser-local selected time is converted to UTC.
- POST `/:id/playback/export`: separately role-gated operator/admin download, with CSRF, workspace scope and metadata-only export audit. The operator explicitly authorized this sensitive export capability. Viewer has no export action/endpoint permission; this is not browser DRM for already-viewable content.

All paths are under `/api/cameras`. HTTP responses are private/no-store/nosniff. Playback speed is client-side. Unknown gaps are not painted as continuous recording. Some XMEye/AppWeb/DVRIP recorders do not expose standard replay; proprietary replay/Cloud ID is not implemented by this change. Missing capabilities get an explicit unavailable state, never simulated footage. Official protocol reference: [ONVIF Streaming Specification](https://www.onvif.org/specs/stream/ONVIF-Streaming-Spec.pdf).

ONVIF PTZ supports only node-advertised generic relative steps/zoom or existing presets, through registered previewed controls. Unsupported movement stays unavailable; player digital zoom remains separate.

## VPN role fix

`vpn.manage` is a narrow operator permission. Management requires admin or operator **and** the selected VPN page, plus existing CSRF/workspace/network policy, encrypted storage, revision, confirmation and audit. It does not grant general security policy control or reveal unselected pages. Viewers remain read-only. A disconnected profile with an actual asset-route conflict is not automatically connected or rebound.

## Acceptance

-30 focused backend tests cover real disposable PostgreSQL/API/auth/CSRF/workspace/role checks, actual AppWeb read-modify-write/read-back/race/replay rejection and unchanged quick-controlled protections.
- Real synthetic RTSP/RTP/H.264 → FFmpeg → MP4 fixture verifies decoding, rejects live-as-replay and handles cancellation. Initial teardown EPIPE/test-probe failures were investigated rather than accepted; final runs must pass against the final runtime image.
- `scripts/qa/capture-camera-studio.mjs` covers restricted operator VPN add, organized NVR views, preview-before-write, unknown SMART,320/390px layouts, rejected-native fullscreen fallback, accent/tools and actual browser MP4 playback/export using intercepted synthetic APIs only. It never modifies a customer NVR/VPN.
- Build/redeploy the affected local API/web services via the project scripts. No package/schema/Compose privilege changes are required; production release still requires an explicit push request and production verification.
