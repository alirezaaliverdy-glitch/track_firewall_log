import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getVendorDetail, type VendorDetail } from "@/lib/vendors";

export default function CiscoOverviewPage() {
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { getVendorDetail("cisco").then(setVendor).catch((err: Error) => setError(err.message)); }, []);
  const implemented = vendor?.capabilities.filter((item) => item.implementationState === "implemented") ?? [];
  const planned = vendor?.capabilities.filter((item) => item.implementationState !== "implemented") ?? [];
  return (
    <section className="page-stack">
      <PageHeader title="Cisco" eyebrow="Vendor capabilities" description="Capability matrix for Cisco platform detection and IOS-XE read-only foundation. Mutations remain planned." />
      {error ? <div className="state-card is-error">{error}</div> : null}
      {!vendor && !error ? <div className="state-card">Loading Cisco capabilities...</div> : null}
      {vendor ? <>
        <div className="summary-grid">
          <article><span>Implemented read-only</span><strong>{implemented.length}</strong></article>
          <article><span>Partial or planned</span><strong>{planned.length}</strong></article>
          <article><span>Platforms</span><strong>{vendor.platforms.length}</strong></article>
        </div>
        <section className="panel-section">
          <h2>Platforms</h2>
          <div className="compact-grid">
            {vendor.platforms.map((platform) => <article key={platform.key} className="mini-card"><strong>{platform.titleEn}</strong><span>{platform.implementationState}</span><small>{platform.notes[0]}</small></article>)}
          </div>
        </section>
        <section className="panel-section">
          <h2>Capability matrix</h2>
          <div className="responsive-table"><table><thead><tr><th>Capability</th><th>Domain</th><th>Mode</th><th>Status</th><th>Template</th></tr></thead><tbody>{vendor.capabilities.map((cap) => <tr key={cap.key}><td>{cap.titleEn}</td><td>{cap.domain}</td><td>{cap.mode}</td><td>{cap.implementationState}</td><td>{cap.actionTemplate ?? "disabled"}</td></tr>)}</tbody></table></div>
        </section>
      </> : null}
    </section>
  );
}
