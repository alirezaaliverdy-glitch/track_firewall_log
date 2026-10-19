import { useSearchParams } from "react-router-dom";
import { AccessLink as Link } from "@/components/auth/AccessLink";
import { useTranslation } from "react-i18next";
import { Network, Server } from "lucide-react";
import type { RouteComponentProps } from "@/routes/appRoutes";
import DeviceOnboardingPage from "./DeviceOnboardingPage";
import NvrRegistrationPage from "@/features/cameras/NvrRegistrationPage";
import NvrDevicePage from "@/features/cameras/NvrDevicePage";
import "@/features/cameras/NvrDevicePage.css";

export default function DeviceRegistrationPage(props: RouteComponentProps) {
  const [query] = useSearchParams(), { i18n } = useTranslation(), fa = i18n.language.startsWith("fa");
  if (props.params.deviceId?.startsWith("nvr-")) return <NvrDevicePage {...props}/>;
  const nvr = query.get("vendor") === "nvr" || props.params.vendorKey === "nvr";
  return <><nav className="nvr-registration-tabs" aria-label={fa ? "نوع تجهیز" : "Equipment type"}>
    <Link className={!nvr ? "is-active" : ""} to="/assets/devices/new"><Network size={19}/>{fa ? "تجهیز شبکه / سرور" : "Network / server"}</Link>
    <Link className={nvr ? "is-active" : ""} to="/assets/devices/new?vendor=nvr"><Server size={19}/>{fa ? "ضبط‌کننده NVR / DVR" : "NVR / DVR recorder"}</Link>
  </nav>{nvr ? <NvrRegistrationPage/> : <DeviceOnboardingPage {...props}/>}</>;
}
