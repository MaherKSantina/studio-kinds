/** Small-screen detection, shared by any component that lays out differently
 *  on a phone. One breakpoint for the whole kit. */
import * as React from "react";

const QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [mobile, setMobile] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
