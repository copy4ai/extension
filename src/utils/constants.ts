export const EXTENSION_ID = "copy4ai";
export const COMMAND_COPY_WITH_CONTEXT = "copy4ai.copyWithContext";
export const VIEW_SIDEBAR = "copy4ai.sidebarView";

export const SUPPORTED_LANGUAGES = [
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
    "python",
    "go",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
    typescript: "TypeScript",
    typescriptreact: "TypeScript (React)",
    javascript: "JavaScript",
    javascriptreact: "JavaScript (React)",
    python: "Python",
    go: "Go",
};

export const CREDIT_THRESHOLDS = {
    small: 2_000,
    medium: 8_000,
} as const;

export const CREDIT_COSTS = {
    small: 1,
    medium: 2,
    large: 3,
    jsdoc: 2,
} as const;

export const DEFAULT_DEPTH = 1;
export const MAX_DEPTH = 3;
export const MIN_DEPTH = 1;

export const HISTORY_MAX_ENTRIES = 5;

export const API_BASE = "https://copy4ai.xyz/api";
export const API_BASE_DEV = "http://localhost:3000";

export const DASHBOARD_BASE = "https://copy4ai.xyz/api";
export const DASHBOARD_BASE_DEV = "http://localhost:5174";

// Extension API endpoint paths (all prefixed with /api/v1/extension)
export const ENDPOINTS = {
    AUTH_GITHUB: "/api/v1/extension/auth/github",
    AUTH_VERIFY: "/api/v1/extension/auth/verify",
    AUTH_CODE: "/api/v1/extension/auth/code",
    AUTH_TOKEN: "/api/v1/extension/auth/token",
    USER_ME: "/api/v1/extension/user/me",
    TEAMS: "/api/v1/extension/teams",
    TEAM_PROJECTS: (teamSlug: string) => `/api/v1/extension/teams/${teamSlug}/projects`,
    TEAM_CREDITS: (teamSlug: string) => `/api/v1/extension/teams/${teamSlug}/credits`,
    COPY: (teamSlug: string, projectSlug: string) => `/api/v1/extension/teams/${teamSlug}/projects/${projectSlug}/copy`,
    JSDOC: (teamSlug: string, projectSlug: string) =>
        `/api/v1/extension/teams/${teamSlug}/projects/${projectSlug}/jsdoc`,
    REFERRAL: "/api/v1/extension/referral/apply",
} as const;
