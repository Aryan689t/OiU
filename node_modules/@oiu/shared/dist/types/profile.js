export const DEFAULT_PROFILE = {
    displayName: "",
    aliases: [],
    identifiers: [],
};
export function parseCommaSeparatedList(input) {
    if (!input)
        return [];
    const items = input
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return Array.from(new Set(items));
}
export function formatCommaSeparatedList(list) {
    if (!list || !Array.isArray(list))
        return "";
    return list.join(", ");
}
export function validateProfile(profile) {
    const errors = [];
    if (!profile.displayName || profile.displayName.trim().length === 0) {
        errors.push("Display name cannot be empty");
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
