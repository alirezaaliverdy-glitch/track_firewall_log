import { AccessLink as Link } from "@/components/auth/AccessLink";
import { TerminalSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
export function DeviceTerminalLink({deviceId,isFa}:{deviceId:string;isFa:boolean}){
  const {user}=useAuth();if(user?.role!=="admin")return null;
  return <Link className="secondary-link device-terminal-link" to={`/assets/devices/${encodeURIComponent(deviceId)}/terminal`}><TerminalSquare size={17}/>{isFa?"باز کردن CLI":"Open CLI"}</Link>;
}
