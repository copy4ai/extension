import { ENDPOINTS } from "../utils/constants";
import type { AuthService } from "./authService";
import { getApiBase } from "./config";

const EXTENSION_VERSION = "0.1.0";

interface RequestOptions {
    method?: string;
    body?: unknown;
    skipAuth?: boolean;
}

export class ApiClient {
    private authService: AuthService;
    private cachedQuota: { data: any; timestamp: number } | null = null;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Active team/project selection
    private teamSlug: string | null = null;
    private projectSlug: string | null = null;

    constructor(authService: AuthService) {
        this.authService = authService;
    }

    setTeamSlug(slug: string | null): void {
        this.teamSlug = slug;
        this.cachedQuota = null; // Invalidate cache on team change
    }

    setProjectSlug(slug: string | null): void {
        this.projectSlug = slug;
    }

    getTeamSlug(): string | null {
        return this.teamSlug;
    }

    getProjectSlug(): string | null {
        return this.projectSlug;
    }

    private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const url = `${getApiBase()}${path}`;
        const token = this.authService.getToken();
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "X-Extension-Version": EXTENSION_VERSION,
        };

        if (token && !options.skipAuth) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: options.method || "GET",
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new ApiError(
                data?.error?.code || "UNKNOWN_ERROR",
                data?.error?.message || "Unknown error",
                response.status,
            );
        }

        return data.data as T;
    }

    // --- Auth ---

    async verifyToken(): Promise<{ valid: boolean; userId: string; email: string }> {
        return this.request(ENDPOINTS.AUTH_VERIFY, { method: "POST" });
    }

    // --- User ---

    async getUser(): Promise<any> {
        return this.request(ENDPOINTS.USER_ME);
    }

    // --- Teams & Projects ---

    async getTeams(): Promise<any[]> {
        return this.request(ENDPOINTS.TEAMS);
    }

    async getProjects(teamSlug: string): Promise<any[]> {
        return this.request(ENDPOINTS.TEAM_PROJECTS(teamSlug));
    }

    // --- Credits ---

    async getQuota(forceRefresh = false): Promise<any> {
        if (!this.teamSlug) throw new Error("No team selected");

        if (!forceRefresh && this.cachedQuota && Date.now() - this.cachedQuota.timestamp < this.CACHE_TTL) {
            return this.cachedQuota.data;
        }

        try {
            const data = await this.request(ENDPOINTS.TEAM_CREDITS(this.teamSlug));
            this.cachedQuota = { data, timestamp: Date.now() };
            return data;
        } catch {
            if (this.cachedQuota) return this.cachedQuota.data;
            throw new Error("Unable to fetch quota and no cached data available");
        }
    }

    // --- AI Operations ---

    async trackUsage(
        content: string,
        language: string,
        fileName: string | null,
        dependencyCount: number,
    ): Promise<any> {
        if (!this.teamSlug || !this.projectSlug) throw new Error("No team/project selected");

        const result = await this.request(ENDPOINTS.COPY(this.teamSlug, this.projectSlug), {
            method: "POST",
            body: { content, language, fileName, dependencyCount },
        });

        this.cachedQuota = null;
        return result;
    }

    async generateJSDoc(code: string, language: string): Promise<any> {
        if (!this.teamSlug || !this.projectSlug) throw new Error("No team/project selected");

        const result = await this.request(ENDPOINTS.JSDOC(this.teamSlug, this.projectSlug), {
            method: "POST",
            body: { code, language },
        });

        this.cachedQuota = null;
        return result;
    }

    // --- Referral ---

    async applyReferral(code: string): Promise<any> {
        return this.request(ENDPOINTS.REFERRAL, {
            method: "POST",
            body: { code },
        });
    }

    invalidateCache(): void {
        this.cachedQuota = null;
    }
}

export class ApiError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status: number) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = "ApiError";
    }
}
