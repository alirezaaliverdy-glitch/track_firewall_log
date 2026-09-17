const particles = [[8,18],[18,72],[28,34],[39,83],[51,22],[62,62],[73,12],[84,46],[93,76],[13,91],[47,52],[78,88]];

export default function AppBackground() {
  return <div className="app-background" aria-hidden="true">
    <div className="app-background__glow app-background__glow--one" /><div className="app-background__glow app-background__glow--two" />
    <div className="app-background__grid" />
    <svg className="app-background__network" viewBox="0 0 1000 700" preserveAspectRatio="none">
      <path d="M40 130L220 235L410 105L610 270L835 120L970 225" /><path d="M65 560L260 420L470 545L700 390L930 530" /><path d="M220 235L260 420M610 270L700 390M410 105L470 545" />
    </svg>
    <div className="app-background__particles">{particles.map(([left,top], index) => <i key={`${left}-${top}`} style={{left:`${left}%`,top:`${top}%`,animationDelay:`${index * -1.7}s`}} />)}</div>
    <div className="app-background__scan" /><div className="app-background__vignette" />
  </div>;
}
