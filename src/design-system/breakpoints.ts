export const breakpoints = {
  mobile: 640,
  tablet: 900,
  desktop: 1180,
  wide: 1440
} as const;

export type BreakpointName = keyof typeof breakpoints;
