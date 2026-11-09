export interface UserProfile {
    displayName: string;
    aliases: string[];
    identifiers: string[];
    keywords: string[];
}
export declare const DEFAULT_PROFILE: UserProfile;
export declare function parseCommaSeparatedList(input: string): string[];
export declare function formatCommaSeparatedList(list: string[]): string;
export declare function validateProfile(profile: Partial<UserProfile>): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=profile.d.ts.map