import { cache } from "react";
import { createClient } from "./supabase/server";

export type AuthUser = {
  id: string;
  email: string;
  role: "user" | "admin";
};

async function fetchUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Auth service error — throw so callers can distinguish from "no session"
  if (error) throw new Error(`Auth service error: ${error.message}`);

  // No session — user is not logged in
  if (!user) return null;

  // Role lookup — log failures but don't block auth
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleError) {
    console.error(`Role lookup failed for user ${user.id}:`, roleError.message);
  }

  return {
    id: user.id,
    email: user.email!,
    role: (roleRow?.role ?? "user") as AuthUser["role"],
  };
}

export const getUser = cache(fetchUser);
