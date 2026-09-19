export default function AnimatedShield() {
  return (
    <div className="login-shield-stage" aria-hidden="true">
      <span className="shield-ripple shield-ripple-one" />
      <span className="shield-ripple shield-ripple-two" />
      <span className="shield-halo" />
      <span className="shield-ring"><i /></span>
      <div className="login-shield">
        <svg className="login-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3 19 6v5c0 4.7-3 8.1-7 10-4-1.9-7-5.3-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
    </div>
  );
}
