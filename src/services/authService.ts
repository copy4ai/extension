import * as vscode from "vscode";
import { DASHBOARD_BASE, DASHBOARD_BASE_DEV, ENDPOINTS } from "../utils/constants";
import { getApiBase } from "./config";

const TOKEN_KEY = "copy4ai.authToken";

function getDashboardBase(): string {
    if (process.env.NODE_ENV === "production") {
        return DASHBOARD_BASE;
    }
    return DASHBOARD_BASE_DEV;
}

function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    return btoa(String.fromCharCode(...hashArray))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export class AuthService {
    private context: vscode.ExtensionContext;
    private token: string | null = null;
    private pendingCodeVerifier: string | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async initialize(): Promise<void> {
        this.token = (await this.context.secrets.get(TOKEN_KEY)) || null;
    }

    isAuthenticated(): boolean {
        return this.token !== null;
    }

    getToken(): string | null {
        return this.token;
    }

    async login(): Promise<void> {
        // Generate PKCE pair
        this.pendingCodeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(this.pendingCodeVerifier);

        const authUrl = `${getDashboardBase()}/login?code_challenge=${encodeURIComponent(codeChallenge)}`;
        await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    }

    async handleAuthCallback(code: string): Promise<void> {
        if (!this.pendingCodeVerifier) {
            throw new Error("No pending PKCE flow");
        }

        // Exchange code + code_verifier for JWT
        const url = `${getApiBase()}${ENDPOINTS.AUTH_TOKEN}`;
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code,
                code_verifier: this.pendingCodeVerifier,
            }),
        });

        const data = await response.json();
        this.pendingCodeVerifier = null;

        if (!response.ok || !data?.data?.token) {
            throw new Error(data?.error?.message || "Token exchange failed");
        }

        this.token = data.data.token as string;
        await this.context.secrets.store(TOKEN_KEY, this.token);
    }

    async logout(): Promise<void> {
        this.token = null;
        this.pendingCodeVerifier = null;
        await this.context.secrets.delete(TOKEN_KEY);
    }

    registerUriHandler(): vscode.Disposable {
        return vscode.window.registerUriHandler({
            handleUri: async (uri: vscode.Uri) => {
                if (uri.path === "/auth") {
                    const params = new URLSearchParams(uri.query);
                    const code = params.get("code");
                    const legacyToken = params.get("token");

                    if (code) {
                        // PKCE flow
                        try {
                            await this.handleAuthCallback(code);
                            vscode.window.showInformationMessage("Successfully signed in to Copy4AI!");
                            vscode.commands.executeCommand("copy4ai.authChanged");
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Sign in failed: ${err.message}`);
                        }
                    } else if (legacyToken) {
                        // Legacy direct token flow (fallback)
                        this.token = legacyToken;
                        await this.context.secrets.store(TOKEN_KEY, legacyToken);
                        vscode.window.showInformationMessage("Successfully signed in to Copy4AI!");
                        vscode.commands.executeCommand("copy4ai.authChanged");
                    }
                }
            },
        });
    }
}
