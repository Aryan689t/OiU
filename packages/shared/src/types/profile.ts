export interface UserProfile {
  displayName: string;
  aliases: string[];
  identifiers: string[]; // Registration numbers, roll numbers, employee IDs
}

export const DEFAULT_PROFILE: UserProfile = {
  displayName: "",
  aliases: [],
  identifiers: [],
};

export function parseCommaSeparatedList(input: string): string[] {
  if (!input) return [];
  const items = input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return Array.from(new Set(items));
}

export function formatCommaSeparatedList(list: string[]): string {
  if (!list || !Array.isArray(list)) return "";
  return list.join(", ");
}

export function validateProfile(profile: Partial<UserProfile>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!profile.displayName || profile.displayName.trim().length === 0) {
    errors.push("Display name cannot be empty");
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}
