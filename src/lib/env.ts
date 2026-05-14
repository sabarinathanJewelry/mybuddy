const raw = process.env.NEXT_PUBLIC_APP_ENV;

export type DeployEnv = "local" | "server";

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  deployEnv: (raw === "server" ? "server" : "local") as DeployEnv,
  envLabel:
    process.env.NEXT_PUBLIC_APP_ENV_LABEL ??
    (raw === "server" ? "SERVER" : "LOCAL"),
};
