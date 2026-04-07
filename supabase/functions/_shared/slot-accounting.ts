export type SignupStatus = "active" | "pending_approval";

export interface SignupStatusInput {
  totalUsers: number;
  activeUsers: number;
  maxActiveUsers: number;
}

export interface SignupStatusDecision {
  status: SignupStatus;
  isAdmin: boolean;
}

/**
 * Decides what status a brand-new signup should get.
 *
 * Rules:
 * - The very first user (totalUsers === 0) is always active and admin.
 *   This bootstraps a fresh deploy without needing manual SQL.
 * - Otherwise, if activeUsers < maxActiveUsers, the new user is active (non-admin).
 * - Otherwise, the new user is pending_approval (waiting for admin).
 *
 * Pure function — no DB calls. The caller queries totalUsers / activeUsers / maxActiveUsers
 * before invoking this and applies the decision when inserting the user row.
 */
export function decideSignupStatus(input: SignupStatusInput): SignupStatusDecision {
  if (input.totalUsers === 0) {
    return { status: "active", isAdmin: true };
  }
  if (input.activeUsers < input.maxActiveUsers) {
    return { status: "active", isAdmin: false };
  }
  return { status: "pending_approval", isAdmin: false };
}
