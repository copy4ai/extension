import * as vscode from "vscode";
import { copyWithContext } from "./commands/copyWithContext";
import { pasteFromAI } from "./commands/pasteFromAI";
import { CopyPanelProvider } from "./providers/panelProvider";
import { SidebarProvider } from "./providers/sidebarProvider";
import { ApiClient } from "./services/apiClient";
import { AuthService } from "./services/authService";
import { HistoryService } from "./services/historyService";
import { COMMAND_COPY_WITH_CONTEXT } from "./utils/constants";

const TEAM_STATE_KEY = "copy4ai.selectedTeam";
const PROJECT_STATE_KEY = "copy4ai.selectedProject";

export async function activate(context: vscode.ExtensionContext) {
    // Initialize services
    const authService = new AuthService(context);
    await authService.initialize();

    const apiClient = new ApiClient(authService);
    CopyPanelProvider.setApiClient(apiClient);
    const historyService = new HistoryService(context);

    // Restore team/project selection from global state
    const savedTeam = context.globalState.get<string>(TEAM_STATE_KEY) || null;
    const savedProject = context.globalState.get<string>(PROJECT_STATE_KEY) || null;
    apiClient.setTeamSlug(savedTeam);
    apiClient.setProjectSlug(savedProject);

    // Register URI handler for OAuth callback
    context.subscriptions.push(authService.registerUriHandler());

    // Register sidebar — note: SidebarProvider now takes context as 5th arg
    const sidebarProvider = new SidebarProvider(context.extensionUri, authService, apiClient, historyService, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider));

    // Register auth changed command (fired after OAuth callback)
    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.authChanged", () => {
            sidebarProvider.refreshAuthState();
        }),
    );

    // Register quota refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.refreshQuota", () => {
            sidebarProvider.refreshQuotaOnly();
        }),
    );

    // Register team/project selection commands
    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.selectTeam", async (teamSlug: string) => {
            apiClient.setTeamSlug(teamSlug);
            apiClient.setProjectSlug(null); // Reset project when team changes
            await context.globalState.update(TEAM_STATE_KEY, teamSlug);
            await context.globalState.update(PROJECT_STATE_KEY, undefined);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.selectProject", async (projectSlug: string) => {
            apiClient.setProjectSlug(projectSlug);
            await context.globalState.update(PROJECT_STATE_KEY, projectSlug);
        }),
    );

    // Register set token command (for dev)
    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.setToken", async () => {
            const token = await vscode.window.showInputBox({
                prompt: "Paste the auth token from the browser callback page",
                placeHolder: "eyJhbGciOiJIUzI...",
                ignoreFocusOut: true,
            });
            if (token) {
                // Direct token set (dev shortcut, bypasses PKCE)
                await context.secrets.store("copy4ai.authToken", token);
                await authService.initialize(); // reload token
                vscode.window.showInformationMessage("Successfully signed in to Copy4AI!");
                vscode.commands.executeCommand("copy4ai.authChanged");
            }
        }),
    );

    // Register open history command
    context.subscriptions.push(
        vscode.commands.registerCommand("copy4ai.openHistory", (entryId: string) => {
            const entries = historyService.getEntries();
            const entry = entries.find((e) => e.id === entryId);
            if (!entry?.root) {
                vscode.window.showWarningMessage("This history entry has no stored data.");
                return;
            }
            CopyPanelProvider.createOrShow(
                context.extensionUri,
                entry.root,
                entry.dependencies || [],
                undefined as any,
                undefined as any,
                (copiedRoot, copiedDeps, markdown) => {
                    const totalChars = markdown.length;
                    const { estimateCredits } = require("./utils/tokenEstimator");
                    historyService.addEntry({
                        functionName: copiedRoot.symbolName || "Selected Code",
                        filePath: copiedRoot.filePath,
                        charCount: totalChars,
                        estimatedCredits: estimateCredits(totalChars),
                        dependencyCount: copiedDeps.length,
                        markdown,
                        root: copiedRoot,
                        dependencies: copiedDeps,
                    });
                },
            );
        }),
    );

    // Register copy command — check auth + team/project first
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_COPY_WITH_CONTEXT, async () => {
            if (!authService.isAuthenticated()) {
                await vscode.commands.executeCommand("copy4ai.sidebarView.focus");
                sidebarProvider.showLoginPrompt();
                return;
            }
            if (!apiClient.getTeamSlug() || !apiClient.getProjectSlug()) {
                await vscode.commands.executeCommand("copy4ai.sidebarView.focus");
                vscode.window.showWarningMessage("Please select a team and project in the Copy4AI sidebar first.");
                return;
            }
            copyWithContext(context.extensionUri, historyService);
        }),
    );

    // Register paste from AI command
    context.subscriptions.push(vscode.commands.registerCommand("copy4ai.pasteFromAI", () => pasteFromAI()));
}

export function deactivate() {}
