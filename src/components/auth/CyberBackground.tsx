const particles = [
  [8, 18, 0], [17, 72, -4], [25, 35, -7], [34, 88, -2], [43, 12, -9],
  [52, 64, -5], [61, 27, -1], [69, 80, -8], [78, 43, -3], [87, 16, -6],
  [92, 68, -10], [73, 7, -4.5], [12, 49, -8.5], [39, 53, -2.5]
] as const;

export default function CyberBackground() {
  return (
    <div className="cyber-background" aria-hidden="true">
      <div className="cyber-grid" />
      <div className="cyber-glow cyber-glow-card" />
      <div className="cyber-glow cyber-glow-top" />
      <div className="cyber-glow cyber-glow-bottom" />

      <svg className="cyber-network" viewBox="0 0 1000 700" preserveAspectRatio="none">
        <defs>
          <linearGradient id="networkLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset=".45" stopColor="#38bdf8" stopOpacity=".48" />
            <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <filter id="nodeGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <g className="network-links">
          <path d="M35 155 L180 92 L315 210 L475 128 L635 220 L810 105 L970 180" />
          <path d="M18 510 L165 430 L302 548 L460 410 L615 535 L770 390 L988 505" />
          <path d="M180 92 L165 430 M315 210 L302 548 M475 128 L460 410 M635 220 L615 535 M810 105 L770 390" />
          <path d="M35 155 L302 548 M315 210 L615 535 M475 128 L770 390 M635 220 L988 505" />
        </g>
        <g className="network-packets">
          <circle r="3"><animateMotion dur="8s" repeatCount="indefinite" path="M35 155 L180 92 L315 210 L475 128 L635 220" /></circle>
          <circle r="2.5"><animateMotion dur="11s" begin="-4s" repeatCount="indefinite" path="M18 510 L165 430 L302 548 L460 410 L615 535 L770 390" /></circle>
          <circle r="2"><animateMotion dur="7s" begin="-2s" repeatCount="indefinite" path="M180 92 L165 430" /></circle>
        </g>
        <g className="network-points" filter="url(#nodeGlow)">
          {[[35,155],[180,92],[315,210],[475,128],[635,220],[810,105],[970,180],[18,510],[165,430],[302,548],[460,410],[615,535],[770,390],[988,505]].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r={index % 3 === 0 ? 4 : 2.6} />
          ))}
        </g>
      </svg>

      <div className="cyber-particles">
        {particles.map(([left, top, delay], index) => (
          <i key={index} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />
        ))}
      </div>
      <div className="cyber-scan" />
      <div className="cyber-vignette" />
    </div>
  );
}
