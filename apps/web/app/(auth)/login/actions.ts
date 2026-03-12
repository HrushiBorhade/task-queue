"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function checkUserExists(email: string) {
  const supabase = createAdminClient();
  email = email.trim().toLowerCase();

  // Paginate through all users to find by email.
  // getUserByEmail doesn't exist in this supabase-js version, so we use listUsers.
  let existingUser = null;
  let page = 1;
  while (!existingUser) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data.users.length) break;
    existingUser = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
    if (data.users.length < 1000) break; // last page
    page++;
  }

  if (!existingUser) {
    return { exists: false, type: "email" as const, normalized: email, provider: null, hasPassword: false };
  }

  const appMeta = existingUser.app_metadata ?? {};
  const providers: string[] = appMeta.providers ?? [appMeta.provider ?? "email"];
  const hasEmailProvider = providers.includes("email");
  const oauthProvider = providers.find((p: string) => p !== "email") ?? null;
  const isOAuthOnly = !!oauthProvider && !hasEmailProvider;

  return {
    exists: true,
    type: "email" as const,
    normalized: email,
    provider: isOAuthOnly ? oauthProvider : null,
    hasPassword: hasEmailProvider,
  };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = await createClient();
  const baseUrl = getBaseUrl();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const baseUrl = getBaseUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect(data.url);
}

export async function resendConfirmationEmail(email: string) {
  const supabase = await createClient();
  const baseUrl = getBaseUrl();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function resetPasswordForEmail(email: string) {
  const supabase = await createClient();
  const baseUrl = getBaseUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function updatePassword(password: string) {
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
