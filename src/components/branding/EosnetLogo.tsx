import lockup from "@/assets/branding/eosnet-lockup.png";
import symbol from "@/assets/branding/eosnet-symbol.png";
import "./EosnetLogo.css";

type EosnetLogoProps = {
  variant?: "lockup" | "symbol";
  className?: string;
  decorative?: boolean;
};

export default function EosnetLogo({ variant = "lockup", className = "", decorative = false }: EosnetLogoProps) {
  const source = variant === "symbol" ? symbol : lockup;
  return (
    <span className={`eos-brand eos-brand--${variant} ${className}`} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "EOSNET · eosnet.ir"} aria-hidden={decorative || undefined}>
      <img className="eos-brand__base" src={source} alt="" draggable={false} />
      {[1, 2, 3].map((beam) => <img key={beam} className={`eos-brand__beam eos-brand__beam--${beam}`} src={source} alt="" aria-hidden="true" draggable={false} />)}
    </span>
  );
}
