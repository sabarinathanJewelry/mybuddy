import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const role = session?.user?.app_metadata?.role as string | undefined;
  const isStaff    = role === "staff";
  const isSubadmin = role === "subadmin";

  // Public routes — no auth required
  if (pathname.startsWith("/apply")) return supabaseResponse;

  // Unauthenticated → login
  if (!session && pathname !== "/login" && !pathname.startsWith("/api/auth")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // MFA gate — non-staff users with 2FA enabled must verify on each new device
  const mfaEnabled = !isStaff && session?.user?.app_metadata?.mfa_enabled === true;
  const mfaVerified = request.cookies.get("mfa_verified")?.value === session?.user?.id;
  const isMfaExemptPath =
    pathname === "/verify-otp" ||
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/apply");

  if (session && mfaEnabled && !mfaVerified && !isMfaExemptPath) {
    return NextResponse.redirect(new URL("/verify-otp", request.url));
  }

  // Logged-in staff: only staff-facing routes allowed
  const staffAllowedPaths = ["/my-attendance", "/my-repairs", "/kolusu-sale"];
  if (isStaff && !staffAllowedPaths.includes(pathname) && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/my-attendance", request.url));
  }

  // Sub-admin: block /admin/* routes (admin-only pages)
  if (isSubadmin && pathname.startsWith("/admin/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Logged-in (non-staff) at /login → dashboard (skip if MFA needed)
  if (session && !isStaff && pathname === "/login" && (!mfaEnabled || mfaVerified)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Logged-in staff at /login → my-attendance
  if (session && isStaff && pathname === "/login") {
    return NextResponse.redirect(new URL("/my-attendance", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
