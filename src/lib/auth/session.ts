import { getSupabase, isSupabaseConfigured } from "./supabaseClient";
import type { UserProfile, UserRole } from "./types";

export async function validateInviteCode(code: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("validate_invite_code", {
    p_code: code.trim(),
  });
  if (error) throw error;
  return Boolean(data);
}

export async function redeemInviteCode(code: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("redeem_invite_code", {
    p_code: code.trim(),
  });
  if (error) throw error;
  return Boolean(data);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  const { error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

export async function signUpWithInvite(input: {
  email: string;
  password: string;
  captainName: string;
  inviteCode: string;
}): Promise<{ needsEmailConfirm: boolean }> {
  const ok = await validateInviteCode(input.inviteCode);
  if (!ok) throw new Error("That invite code is invalid or already used.");

  const { data, error } = await getSupabase().auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { captain_name: input.captainName.trim() || "Captain" },
    },
  });
  if (error) throw error;
  if (!data.session && data.user) {
    // Email confirmation required — invite redeem waits until first session.
    return { needsEmailConfirm: true };
  }
  if (data.session) {
    const redeemed = await redeemInviteCode(input.inviteCode);
    if (!redeemed) {
      await getSupabase().auth.signOut();
      throw new Error("Invite code could not be redeemed. Contact the Admin Captain.");
    }
  }
  return { needsEmailConfirm: false };
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().auth.signOut();
}

export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchProfile(): Promise<UserProfile | null> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, captain_name, role")
    .eq("id", auth.user.id)
    .maybeSingle();
  // Fall back to auth metadata if RLS/grants briefly block profiles.
  if (error) {
    console.warn("profiles fetch failed; using auth metadata", error.message);
    return {
      id: auth.user.id,
      email: auth.user.email ?? null,
      captainName:
        (auth.user.user_metadata?.captain_name as string | undefined) ||
        "Captain",
      role: "beta",
    };
  }
  if (!data) {
    return {
      id: auth.user.id,
      email: auth.user.email ?? null,
      captainName:
        (auth.user.user_metadata?.captain_name as string | undefined) ||
        "Captain",
      role: "beta",
    };
  }
  return {
    id: data.id as string,
    email: (data.email as string | null) ?? auth.user.email ?? null,
    captainName: (data.captain_name as string) || "Captain",
    role: (data.role as UserRole) || "beta",
  };
}

/** Pending invite code held until email confirm creates a session. */
const PENDING_INVITE_KEY = "st:pendingInvite";

export function stashPendingInvite(code: string): void {
  sessionStorage.setItem(PENDING_INVITE_KEY, code.trim());
}

export function takePendingInvite(): string | null {
  const code = sessionStorage.getItem(PENDING_INVITE_KEY);
  sessionStorage.removeItem(PENDING_INVITE_KEY);
  return code;
}
