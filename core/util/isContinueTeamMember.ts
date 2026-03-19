/**
 * Utility to check if a user is a CodeIn / inBharat AI team member
 */
export function isCodeInTeamMember(email?: string): boolean {
  if (!email) return false;
  return email.endsWith("@inbharat.ai");
}

/** @deprecated Use isCodeInTeamMember instead */
export const isContinueTeamMember = isCodeInTeamMember;
