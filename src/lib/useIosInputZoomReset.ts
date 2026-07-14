import { useEffect } from "react";
import { installIosInputZoomReset } from "./iosInputZoom";

/** Installs the app-wide iOS sticky input-zoom reset for the lifetime of App. */
export function useIosInputZoomReset(): void {
  useEffect(() => installIosInputZoomReset(), []);
}
