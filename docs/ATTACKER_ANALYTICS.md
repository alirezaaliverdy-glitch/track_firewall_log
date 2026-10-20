# Attacker evidence analytics

The Attackers page provides two independently aggregated charts, not extrapolation from the capped IP list:

- Source timeline: distinct source IPs with newly recorded qualifying findings in each bucket. The highest severity per IP/bucket chooses one disjoint high/critical or other stack.
- Pattern comparison: distinct sources by structured finding family/MITRE tags. A source can appear in multiple families; bars must not be summed.

Both charts use the selected vendor and a rolling 1/7/30-day window (24 hourly buckets or daily buckets). Search, severity and IP-scope filters apply to the IP list only; the UI states this distinction. Finding `firstSeen`, not each raw attempt or `count`, is the time basis. Resolved/accepted-risk retained findings remain historical evidence; suppressed/false-positive, trusted sources and non-actionable activity are excluded. No findings does not establish absence of attacks; neither chart proves attacker identity or a successful breach.

`GET /api/security/attackers/analytics` requires the attackers page grant and authenticated workspace ownership. A repeatable-read transaction scans owner-scoped findings in 500-row pages, up to 20,000. Exceeding the cap returns explicit incomplete coverage with no chart/summary. Raw evidence, credentials and source IP lists are never returned by this aggregate endpoint. Requests are bounded/coalesced; the visible page refreshes every 30 seconds, aborts obsolete requests and labels stale results after failure. Tables expose exact values; chart animation respects reduced motion.

Authentication detection requires genuine normalized/textual failure evidence. A blocked packet to SSH, successful login, VPN certificate/handshake error or generic status failure is not a failed login. Transport copies collapse, independent timestamped attempts do not. Linux complementary SSH/PAM lines pair only with the same process identity/time window; this heuristic does not collapse Cisco/FortiGate attempts. Retained database aggregate counts are preserved after deduplication.

Country images use pinned `flag-icons` 7.3.2 MIT SVGs served locally. Validated offline Geo country codes determine flags; unknown/private sources do not get invented countries. This is IP geolocation, not a person's nationality or verified location. Original evidence is retained; recognized finding titles/descriptions are localized for display.

Primary reference examples for the normalized vendor distinctions: [RouterOS logs](https://help.mikrotik.com/docs/spaces/ROS/pages/328094/Log), [Cisco system messages](https://www.cisco.com/c/en/us/td/docs/ios/15_0sy/system/messages/15sysmg.pdf), [FortiOS log IDs](https://docs.fortinet.com/document/fortigate/7.2.3/fortios-log-message-reference/34314/log-id-numbers), [flag SVG licensing](https://github.com/lipis/flag-icons).

Regression coverage: `attacker-analytics*.test.ts`, existing intelligence/vendor/Geo tests and `attacker-layout.browser.mjs`. Browser fixtures contain synthetic evidence only; screenshot output belongs in a temporary directory, not the repository.
