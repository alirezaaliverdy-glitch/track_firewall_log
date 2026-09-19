import { Router, Server, ShieldCheck, Wifi } from "lucide-react";

type MotionTone = "good" | "warning" | "danger" | "neutral";

type NetworkDefenseMotionProps = {
  tone: MotionTone;
  isFa: boolean;
  activeDevices: number;
  activeAlerts: number;
};

export function NetworkDefenseMotion({ tone, isFa, activeDevices, activeAlerts }: NetworkDefenseMotionProps) {
  const copy = isFa
    ? {
        eyebrow: "جریان حفاظت شبکه",
        title: tone === "good" ? "ترافیک زیر نظر است" : tone === "danger" ? "دفاع فعال؛ نیازمند بررسی" : "دفاع فعال؛ چند مورد نیازمند توجه",
        scene: `نمای متحرک عبور بسته‌ها از روتر و فایروال به سرور؛ ${activeDevices} تجهیز و ${activeAlerts} هشدار فعال.`,
      }
    : {
        eyebrow: "Network protection flow",
        title: tone === "good" ? "Traffic is being watched" : tone === "danger" ? "Defense active; review required" : "Defense active; attention required",
        scene: `Animated packet flow from router through firewall to server; ${activeDevices} devices and ${activeAlerts} active alerts.`,
      };

  return (
    <section className={`network-defense-motion network-defense-motion--${tone}`} aria-label={copy.scene}>
      <header className="network-defense-motion__header">
        <div>
          <span><Wifi size={13} />{copy.eyebrow}</span>
          <strong>{copy.title}</strong>
        </div>
        <i className="network-defense-motion__live" aria-hidden="true" />
      </header>

      <div className="network-defense-motion__scene" dir="ltr" aria-hidden="true">
        <span className="network-defense-motion__grid" />
        <span className="network-defense-motion__horizon" />
        <span className="network-defense-motion__scanner" />
        <svg className="network-defense-motion__paths" viewBox="0 0 600 180" preserveAspectRatio="none">
          <path className="network-defense-motion__path network-defense-motion__path--upper" d="M55 108 C160 12 220 34 300 88 S440 148 545 64" />
          <path className="network-defense-motion__path network-defense-motion__path--lower" d="M55 72 C160 160 220 138 300 92 S440 30 545 116" />
        </svg>
        <span className="network-defense-motion__route network-defense-motion__route--first" />
        <span className="network-defense-motion__route network-defense-motion__route--second" />

        {[0, 1].map((packet) => <i key={`incoming-${packet}`} className={`network-packet network-packet--incoming network-packet--${packet + 1}`} />)}
        <i className="network-packet network-packet--outgoing network-packet--1" />
        <i className="network-packet network-packet--curve network-packet--curve-1" />

        <i className="network-threat network-threat--one" />
        <i className="network-threat network-threat--two" />
        <span className="network-defense-motion__impact" />

        <div className="network-defense-node network-defense-node--router">
          <span><Router /></span>
          <i className="network-defense-node__activity"><b /><b /><b /></i>
        </div>
        <div className="network-defense-node network-defense-node--firewall">
          <i className="network-defense-node__halo" />
          <i className="network-defense-node__halo network-defense-node__halo--outer" />
          <span><ShieldCheck /></span>
          <i className="network-defense-node__gate network-defense-node__gate--left" />
          <i className="network-defense-node__gate network-defense-node__gate--right" />
        </div>
        <div className="network-defense-node network-defense-node--server">
          <span><Server /></span>
          <i className="network-defense-node__activity"><b /><b /><b /></i>
        </div>
      </div>
    </section>
  );
}
