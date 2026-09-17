# TASK 20.1 UI MOTION AND CHART SPEC

## Success notification

Placement:
- fixed or sticky at top of application content;
- below global top bar;
- above page content;
- visible after navigation.

Motion:
- slide down 12–20px and fade in;
- 220–320ms;
- progress timer 4–6 seconds;
- icon check animation;
- no aggressive bounce;
- no repeated animation on state updates.

Accessibility:
- `role="status"` for success;
- `aria-live="polite"`;
- focus must not be stolen;
- keyboard-closeable;
- reduced-motion fallback.

## Dashboard charts

Use the existing chart library when suitable.
Do not add a second chart library without a strong reason.

Semantic palette:
- healthy: green
- attention: amber
- degraded: orange
- critical: red
- unknown: neutral
- informational/vendor series: distinct restrained colors

Motion:
- first-render easing;
- value interpolation;
- hover tooltip;
- no permanent animation;
- no flashing;
- reduced-motion support.

## Device workspace charts

- Health score line
- CPU and memory line
- Interface/port state bar or donut
- Findings severity bar or donut
- Availability/latency line

Every chart needs:
- title;
- concise explanation;
- source;
- freshness;
- time range;
- empty/partial/error state;
- click-through where useful.
