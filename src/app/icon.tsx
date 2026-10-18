import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Home-screen and install icon. iOS masks the square itself. */
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
          background: "#111114",
        }}
      >
        <svg width="320" height="320" viewBox="0 0 32 32" fill="none">
          <path d="M10 6.5c7.2 0 13 5.8 13 13" stroke="#7aa2ff" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M10 11c4.7 0 8.5 3.8 8.5 8.5" stroke="#d6e2ff" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M10 6.5v13" stroke="#f4f4f5" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="22.5" cy="19.2" r="2.35" fill="#C8102E" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
