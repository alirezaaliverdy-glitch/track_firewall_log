export type ProductFeatureState =
  | "implemented"
  | "partial"
  | "not_configured"
  | "unverified"
  | "planned"
  | "unsupported"
  | "disabled";

export type ProductFeature = {
  key: string;
  titleFa: string;
  titleEn: string;
  route?: string;
  groupKey: string;
  order: number;
  state: ProductFeatureState;
  userVisible: boolean;
  navigationVisible: boolean;
  backendReady: boolean;
  apiReady: boolean;
  uiReady: boolean;
  tested: boolean;
  reason?: string;
  requirements?: string[];
  lastVerifiedAt?: string;
};

export type ProductNavigationItem = Pick<ProductFeature, "key" | "titleFa" | "titleEn" | "route" | "state">;

export type ProductNavigationGroup = {
  key: string;
  titleFa: string;
  titleEn: string;
  iconKey: string;
  route: string;
  mobilePrimary: boolean;
  items: ProductNavigationItem[];
};

export type ProductIntegrationState = {
  key: "netbox" | "wazuh";
  title: string;
  state: ProductFeatureState;
  mode: "mock";
  configured: false;
  executable: false;
  route: string;
  reason: string;
};
