import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Favicon for the browser tab. Generated from the parrot image at build time.
 */
export default async function Icon() {
  const iconPath = path.join(
    process.cwd(),
    "public",
    "assets",
    "toucan_white.png"
  );
  let imageData: string;
  try {
    const buffer = fs.readFileSync(iconPath);
    imageData = `data:image/png;base64,${buffer.toString("base64")}`;
  } catch {
    // Fallback: simple placeholder if file is missing (e.g. in some build envs)
    return new ImageResponse(
      (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "oklch(0.4 0.02 250)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            color: "white",
          }}
        >
          P
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <img
        src={imageData}
        width={32}
        height={32}
        style={{ objectFit: "contain" }}
        alt=""
      />
    ),
    { ...size }
  );
}
