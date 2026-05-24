import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

export async function POST() {
  const scriptPath = path.join(process.cwd(), "scripts", "sync_attendance.py");

  return new Promise<NextResponse>((resolve) => {
    // Try "python" first (Windows store / standard), fall back to "py" launcher
    const cmd = `python "${scriptPath}"`;
    exec(cmd, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        // If "python" not found, try "py" launcher
        if (error.message.includes("not found") || error.message.includes("cannot find") || error.code === 127) {
          exec(`py "${scriptPath}"`, { timeout: 30_000 }, (err2, out2, err2s) => {
            if (err2) {
              resolve(NextResponse.json({ ok: false, error: err2s || err2.message }, { status: 500 }));
            } else {
              resolve(NextResponse.json({ ok: true, output: out2 }));
            }
          });
        } else {
          resolve(NextResponse.json({ ok: false, error: stderr || error.message }, { status: 500 }));
        }
      } else {
        resolve(NextResponse.json({ ok: true, output: stdout }));
      }
    });
  });
}
