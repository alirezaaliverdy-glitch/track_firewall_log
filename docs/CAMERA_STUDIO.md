# Camera studio and verified NVR configuration

## Real AppWeb/TaoShi archive playback (2026-10-19)

Final native acceptance2026-10-20: advertised/enforced5–15second requests, actual browser decoding/duration/seek. Native packet wall-clock fields have second precision; a requested15second interval can return a partial final second (observed173frames/14.416667s at12fps). Acceptance permits at most one second of tail difference, checks decoded duration against browser duration and never pads fabricated frames. This is not frame-accurate archival export. The existing short-segment guard still stops continuation for larger gaps.

The direct-LAN AppWeb recorder now has a real proprietary playback adapter; this supersedes the earlier unsupported-native-playback notes below for this specific family, not for every XMEye device. Cameras in the same workspace/company are matched to the enabled, selected single-source decoder entry actually reported by the recorder. No IP-suffix/channel-order guess, persisted invented association, cross-company fallback or automatic device setting change is used. Multiple matches, disabled/touring channels and missing mappings fail closed. A recorder also exposes its actual configured channel choices from the camera playback workspace.

`nvr-appweb-codec.ts` decodes the authenticated legacy device configuration envelope locally, then returns only channel index/address/name, never embedded camera accounts. `nvr-taoshi.ts` performs fixed authenticated AppWeb reads (version, decoder channels, network TCP port, recorder clock) and the panel's read-only `PUT /CGI/Record/filelist` search for the requested interval. Files must actually overlap the interval before playback. The archive token is a scoped channel handle, not evidence of continuous coverage; earliest/latest dates remain unknown.

`backend/native/taoshi/replay.cpp` calls the official manufacturer's `NET_SDK_PlayBackByTime_Ex` over the registered private IP and measured TCP port. It accepts secrets on stdin only, silences vendor output, emits bounded timestamped video frames and supports no configuration/format/reboot command. The SDK requires a nonzero callback cookie; zero caused the initial parameter error. Frame size/count, input/output bytes, active jobs, clocks, subprocess runtime and cancellation are bounded. A three-second keyframe lead-in is trimmed before returning the requested segment. H.264/H.265 frames become browser-compatible H.264/MP4 in memory, without a footage cache. Shared limits remain one replay per workspace/two global and12MiB output. This native recorder path advertises/enforces5–15second segments; the standard ONVIF path remains5–60seconds. The UI respects each inventory's advertised maximum. A real60second native request exceeded its deadline; actual6second/72frame and15second/180frame MP4s passed browser-duration and seek acceptance, so the product uses the verified shorter path instead of claiming an unverified60second segment. Authentication failures retain cooldown protection; no protocol/password retry follows rejection.

The UI labels native archive dates as recorder local clock, not browser timezone. Wall-clock values travel in an ISO-shaped envelope without timezone conversion; metadata and audits explicitly mark `timeBasis=device-local`. ONVIF retains actual UTC behavior. A recorder clock ahead of browser UTC is handled without silently offsetting footage. Short/gapped recordings stop continuation rather than faking coverage.

The API image builds a static x86-64 helper using hash-pinned header/library slices from the manufacturer-linked SDK. SDK binaries, samples, sample passwords and cloud/OEM keys are not committed. Download/hash failure stops the build before service replacement. No new npm dependency, database migration, Docker privilege or arbitrary remote URL is needed. The SDK artifact targets Linux x86-64; other architectures need a separately verified vendor build. This is not Cloud ID/P2P support.

Primary sources: the device's own `/doc/script/playback.js` and `/doc/script/params/DigitalRemote.js`; [TaoShi SDK download](https://www.hztaoshi.com/service/zlxz/SDKkf/172.html) links through its portal to the SDK archive pinned in `fetch-sdk.mjs`. No panel JavaScript or sample executable is executed.

Validation includes synthetic legacy-envelope, packet-fragmentation/limits, ownership/company/channel-token and viewer-export tests; AppWeb/ONVIF/CSRF/controlled-action regressions; and metadata-only actual device acceptance in `probe-taoshi-acceptance.mjs`. Real acceptance matched the standalone camera to its actual NVR channel and decoded H.265 into H.264/MP4; six-second timing was verified by72 decoded output frames. No recorder settings changed. Final deployment/browser results are recorded in CURRENT_STATUS and TASK_HISTORY.

## Camera-first playback follow-up (2026-10-19)

Playback is no longer embedded in recorder/settings dialogs. In Cameras → company, use the prominent Camera playback button or Playback on an individual camera/channel card. The full-page review workspace has a searchable real camera/channel list, explicit archive selection, start/end timestamps (browser local time), archive-end presets and a review range of5seconds–24hours. Only an actual exact reported source match is auto-selected; an unmatched channel requires explicit archive selection rather than guessing another camera. URL state stores only company/device/source/view selection so refresh/navigation restores the workspace, not a media URL or credential.

The player supports an absolute requested-time scrubber, ±10seconds/±1minute, pause/resume,0.25–4× speed, viewport/native-fallback fullscreen and bounded next-segment continuation. Each device request/export remains5–60seconds/12MiB; only the current segment is downloaded, never a bulk24-hour export. A shorter-than-requested segment stops automatic continuation with a gap warning. The review slider is explicitly not a claim of continuous recording. Camera changes/editing the range release the old blob and cancel pending work. Backend permissions, resource limits, clock verification, audit and unsupported-vendor behavior are unchanged.

Camera/NVR selects use a shared theme-owned keyboard-accessible combobox/listbox for the affected controls, avoiding unreadable Windows native popup colors; other native camera options also get explicit theme colors. The recorder connection description and DVRIP labels now explicitly say IP/LAN/VPN, not Cloud ID. XMEye Cloud ID and proprietary replay are still NOT enabled by selecting DVRIP.

Follow-up validation: `scripts/qa/camera-playback-range.test.mjs` covers ordering/past/24-hour bounds, bounded segments, short final tails and invalid seeks. Expanded `capture-camera-studio.mjs` covers open themed menus/keyboard selection, no replay in NVR dialogs, camera-first entry points, viewport layouts, actual browser MP4/seek/speed/continuation/export, source mismatch and unsupported/viewer states with intercepted synthetic APIs only.

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

All paths are under `/api/cameras`. HTTP responses are private/no-store/nosniff. Playback speed is client-side. Unknown gaps are not painted as continuous recording. The AppWeb/TaoShi direct adapter described above supplements standard ONVIF; other proprietary families and Cloud ID remain unsupported without a separately implemented connector. Missing capabilities get an explicit unavailable state, never simulated footage. Official protocol reference: [ONVIF Streaming Specification](https://www.onvif.org/specs/stream/ONVIF-Streaming-Spec.pdf).

ONVIF PTZ supports only node-advertised generic relative steps/zoom or existing presets, through registered previewed controls. Unsupported movement stays unavailable; player digital zoom remains separate.

## VPN role fix

`vpn.manage` is a narrow operator permission. Management requires admin or operator **and** the selected VPN page, plus existing CSRF/workspace/network policy, encrypted storage, revision, confirmation and audit. It does not grant general security policy control or reveal unselected pages. Viewers remain read-only. A disconnected profile with an actual asset-route conflict is not automatically connected or rebound.

## Acceptance

-30 focused backend tests cover real disposable PostgreSQL/API/auth/CSRF/workspace/role checks, actual AppWeb read-modify-write/read-back/race/replay rejection and unchanged quick-controlled protections.
- Real synthetic RTSP/RTP/H.264 → FFmpeg → MP4 fixture verifies decoding, rejects live-as-replay and handles cancellation. Initial teardown EPIPE/test-probe failures were investigated rather than accepted; final runs must pass against the final runtime image.
- `scripts/qa/capture-camera-studio.mjs` covers restricted operator VPN add, organized NVR views, preview-before-write, unknown SMART,320/390px layouts, rejected-native fullscreen fallback, accent/tools and actual browser MP4 playback/export using intercepted synthetic APIs only. It never modifies a customer NVR/VPN.
- Build/redeploy the affected local API/web services via the project scripts. No package/schema/Compose privilege changes are required; production release still requires an explicit push request and production verification.
