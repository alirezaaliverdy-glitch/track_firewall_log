import type { RouteComponentProps } from "@/routes/appRoutes";
import AssetDetailPage from "./AssetDetailPage";
import NvrDevicePage from "@/features/cameras/NvrDevicePage";
export default function AssetDevicePage(props: RouteComponentProps) {
  return props.params.deviceId?.startsWith("nvr-") ? <NvrDevicePage {...props}/> : <AssetDetailPage {...props}/>;
}
