export type UserRole = "admin" | "beta";

export interface UserProfile {
  id: string;
  email: string | null;
  captainName: string;
  role: UserRole;
}

export function isAdmin(profile: UserProfile | null | undefined): boolean {
  return profile?.role === "admin";
}
