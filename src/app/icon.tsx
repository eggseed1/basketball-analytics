import { ImageResponse } from "next/og";

import { DRBL_ICON_BG, DrblIconMarkSvg } from "@/lib/drbl-icon-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Browser tab / PWA icon. Same court-arc mark as the header, bolder for 16 px. */
export default function Icon() {
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
        <DrblIconMarkSvg size={448} />
      </div>
    ),
    { ...size }
  );
}
