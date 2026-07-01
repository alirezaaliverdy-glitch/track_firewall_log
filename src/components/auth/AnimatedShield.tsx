import { ShieldCheck } from "lucide-react";

export default function AnimatedShield() {
  return (
    <div className="login-shield-stage" aria-hidden="true">
      <span className="shield-ripple shield-ripple-one" />
      <span className="shield-ripple shield-ripple-two" />
      <span className="shield-halo" />
      <span className="shield-ring"><i /></span>
      <div className="login-shield"><ShieldCheck /></div>
    </div>
  );
}
