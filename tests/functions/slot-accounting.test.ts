import { describe, it, expect } from "vitest";
import { decideSignupStatus } from "../../supabase/functions/_shared/slot-accounting.js";

describe("decideSignupStatus", () => {
  it("makes the very first user an active admin", () => {
    expect(decideSignupStatus({ totalUsers: 0, activeUsers: 0, maxActiveUsers: 15 }))
      .toEqual({ status: "active", isAdmin: true });
  });

  it("makes the second user an active non-admin if a slot is free", () => {
    expect(decideSignupStatus({ totalUsers: 1, activeUsers: 1, maxActiveUsers: 15 }))
      .toEqual({ status: "active", isAdmin: false });
  });

  it("activates new users until the cap", () => {
    expect(decideSignupStatus({ totalUsers: 14, activeUsers: 14, maxActiveUsers: 15 }))
      .toEqual({ status: "active", isAdmin: false });
  });

  it("waitlists once active count reaches the cap", () => {
    expect(decideSignupStatus({ totalUsers: 15, activeUsers: 15, maxActiveUsers: 15 }))
      .toEqual({ status: "pending_approval", isAdmin: false });
  });

  it("waitlists when active is at cap even if pending users exist", () => {
    expect(decideSignupStatus({ totalUsers: 18, activeUsers: 15, maxActiveUsers: 15 }))
      .toEqual({ status: "pending_approval", isAdmin: false });
  });

  it("respects a custom max", () => {
    expect(decideSignupStatus({ totalUsers: 5, activeUsers: 5, maxActiveUsers: 5 }))
      .toEqual({ status: "pending_approval", isAdmin: false });
    expect(decideSignupStatus({ totalUsers: 4, activeUsers: 4, maxActiveUsers: 5 }))
      .toEqual({ status: "active", isAdmin: false });
  });

  it("first-user check beats slot check (cap=0 still admits the first user)", () => {
    expect(decideSignupStatus({ totalUsers: 0, activeUsers: 0, maxActiveUsers: 0 }))
      .toEqual({ status: "active", isAdmin: true });
  });
});
