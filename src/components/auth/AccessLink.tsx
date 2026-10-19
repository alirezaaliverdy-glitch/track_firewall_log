import { Link, useLocation, type LinkProps } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { canAccessPage, pageForLocation } from "@/lib/pageAccess";

/** Do not advertise unselected pages through contextual shortcuts either. */
export function AccessLink(props: LinkProps) {
  const { user } = useAuth();
  const location = useLocation();
  const target = typeof props.to === "string" ? props.to : `${props.to.pathname ?? location.pathname}${props.to.search ?? ""}`;
  const [pathname, search = ""] = target.split("?", 2);
  const page = pageForLocation(pathname, search);
  if (page && !canAccessPage(user, page)) return null;
  return <Link {...props}/>;
}
