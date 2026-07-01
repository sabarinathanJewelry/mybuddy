import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  const { size: sizeStr } = await params;
  const size = parseInt(sizeStr) || 192;
  const r = Math.round(size * 0.22);
  const fs = Math.round(size * 0.42);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: "#1A1410",
          borderRadius: r,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#C8A84B", fontSize: fs, fontWeight: 800, fontFamily: "serif" }}>
          M
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
