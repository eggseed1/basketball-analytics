import { ImageResponse } from "next/og";

import { DRBL_ICON_BG, DrblIconMarkSvg } from "@/lib/drbl-icon-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon for Add to Home Screen. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: DRBL_ICON_BG,
        }}
      >
        <DrblIconMarkSvg size={148} />
      </div>
    ),
    { ...size }
  );
}
