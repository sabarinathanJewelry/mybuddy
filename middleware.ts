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
  const isStaff = session?.user?.app_metadata?.role === "staff";

  // Unauthenticated → login
  if (!session && pathname !== "/login" && !pathname.startsWith("/api/auth")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged-in staff: only /my-attendance is allowed
  if (isStaff && pathname !== "/my-attendance" && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/my-attendance", request.url));
  }

  // Logged-in admin at /login → dashboard
  if (session && !isStaff && pathname === "/login") {
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
