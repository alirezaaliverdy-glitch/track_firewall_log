import { Boxes, Router, Server, Shield, Wifi } from "lucide-react";
import type { PlatformAsset } from "@/lib/platform";

function assetKind(asset: PlatformAsset) {
  const identity = `${asset.vendor?.name ?? ""} ${asset.platform?.name ?? ""} ${asset.device?.type ?? ""}`.toLowerCase();
  if (identity.includes("linux") || identity.includes("debian") || identity.includes("ubuntu")) return "linux";
  if (identity.includes("forti") || identity.includes("firewall")) return "security";
  if (identity.includes("cisco") || identity.includes("mikro") || identity.includes("router")) return "network";
  if (identity.includes("wireless") || identity.includes("wifi")) return "wireless";
  return "generic";
}

export function AssetIdentityIcon({ asset }: { asset: PlatformAsset }) {
  const kind = assetKind(asset);
  const Icon = kind === "linux" ? Server : kind === "security" ? Shield : kind === "network" ? Router : kind === "wireless" ? Wifi : Boxes;
  return <span className={`asset-identity-icon asset-identity-icon--${kind}`} aria-hidden="true"><Icon size={20} /></span>;
}
