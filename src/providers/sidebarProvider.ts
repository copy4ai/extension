import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ApiClient } from "../services/apiClient";
import type { AuthService } from "../services/authService";
import type { HistoryService } from "../services/historyService";

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "copy4ai.sidebarView";
    private view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly authService: AuthService,
        private readonly apiClient: ApiClient,
        private readonly historyService: HistoryService,
        readonly _context: vscode.ExtensionContext,
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "login":
                    await this.authService.login();
                    break;
                case "logout":
                    await this.authService.logout();
                    this.refreshAuthState();
                    break;
                case "ready":
                    this.sendInitialState();
                    break;
                case "openHistory":
                    vscode.commands.executeCommand("copy4ai.openHistory", message.payload.id);
                    break;
                case "upgrade":
                    vscode.env.openExternal(vscode.Uri.parse("https://copy4ai.xyz/pricing"));
                    break;
                case "setShortcut": {
                    const { id, vscode: vscodeKey } = message.payload;
                    if (id === "shortcutCopy" && vscodeKey) {
                        this.updateKeybinding(
                            "copy4ai.copyWithContext",
                            vscodeKey,
                            "editorTextFocus && editorHasSelection",
                        );
                    }
                    break;
                }
                case "resetShortcuts":
                    this.resetKeybinding("copy4ai.copyWithContext");
                    break;
                case "openDocs":
                    vscode.env.openExternal(vscode.Uri.parse("https://docs.copy4ai.xyz/"));
                    break;
                case "reportIssue":
                    vscode.env.openExternal(vscode.Uri.parse("https://github.com/copy4ai/vscode-extension/issues"));
                    break;
                case "selectTeam": {
                    const { slug } = message.payload;
                    await vscode.commands.executeCommand("copy4ai.selectTeam", slug);
                    // Fetch projects for selected team
                    try {
                        const projects = await this.apiClient.getProjects(slug);
                        this.view?.webview.postMessage({ type: "updateProjects", payload: { projects } });
                    } catch {
                        this.view?.webview.postMessage({ type: "updateProjects", payload: { projects: [] } });
                    }
                    // Refresh quota for new team
                    this.refreshQuotaOnly();
                    break;
                }
                case "selectProject": {
                    const { slug } = message.payload;
                    await vscode.commands.executeCommand("copy4ai.selectProject", slug);
                    break;
                }
            }
        });
    }

    public async refreshAuthState(): Promise<void> {
        if (!this.view) return;

        const isAuth = this.authService.isAuthenticated();

        if (isAuth) {
            const [quotaResult, userResult, teamsResult] = await Promise.allSettled([
                this.apiClient.getTeamSlug() ? this.apiClient.getQuota() : Promise.resolve(null),
                this.apiClient.getUser(),
                this.apiClient.getTeams(),
            ]);
            const quota = quotaResult.status === "fulfilled" ? quotaResult.value : null;
            const userPayload = userResult.status === "fulfilled" ? userResult.value : null;
            const teams = teamsResult.status === "fulfilled" ? teamsResult.value : [];
            const user = (userPayload as any)?.user ?? null;

            const selectedTeam = this.apiClient.getTeamSlug();
            const selectedProject = this.apiClient.getProjectSlug();

            this.view.webview.postMessage({
                type: "authState",
                payload: { authenticated: true, quota, user, teams, selectedTeam, selectedProject },
            });

            // If team is selected, also fetch projects
            if (selectedTeam) {
                try {
                    const projects = await this.apiClient.getProjects(selectedTeam);
                    this.view.webview.postMessage({ type: "updateProjects", payload: { projects } });
                } catch {
                    // Silently fail
                }
            }

            const entries = this.historyService.getEntries();
            this.view.webview.postMessage({ type: "updateHistory", payload: { entries } });
        } else {
            this.view.webview.postMessage({ type: "authState", payload: { authenticated: false } });
            this.view.webview.postMessage({ type: "updateHistory", payload: { entries: [] } });
        }
    }

    public async refreshQuotaOnly(): Promise<void> {
        if (!this.view || !this.authService.isAuthenticated()) return;
        try {
            const quota = await this.apiClient.getQuota(true);
            this.view.webview.postMessage({ type: "updateQuota", payload: quota });
        } catch {
            // Silently fail — quota will refresh on next authChanged
        }
    }

    public showLoginPrompt(): void {
        if (!this.view) return;
        this.view.webview.postMessage({ type: "showLoginPrompt" });
    }

    private sendInitialState(): void {
        this.refreshAuthState();
    }

    private getKeybindingsPath(): string {
        // Detect VS Code variant folder name
        const appName = vscode.env.appName || "";
        let codeFolder = "Code";
        if (appName.includes("Insiders")) codeFolder = "Code - Insiders";
        else if (appName.includes("VSCodium")) codeFolder = "VSCodium";

        if (process.platform === "win32") {
            return path.join(process.env.APPDATA || "", codeFolder, "User", "keybindings.json");
        } else if (process.platform === "darwin") {
            return path.join(
                process.env.HOME || "",
                "Library",
                "Application Support",
                codeFolder,
                "User",
                "keybindings.json",
            );
        } else {
            return path.join(process.env.HOME || "", ".config", codeFolder, "User", "keybindings.json");
        }
    }

    private readKeybindings(): any[] {
        const filePath = this.getKeybindingsPath();
        try {
            const raw = fs.readFileSync(filePath, "utf-8");
            // Strip JSONC comments and trailing commas
            const clean = raw
                .replace(/\/\/.*$/gm, "")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/,(\s*[}\]])/g, "$1");
            return JSON.parse(clean);
        } catch {
            return [];
        }
    }

    private writeKeybindings(bindings: any[]): void {
        const filePath = this.getKeybindingsPath();
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(bindings, null, 2), "utf-8");
    }

    private updateKeybinding(command: string, newKey: string, when?: string): void {
        try {
            const bindings = this.readKeybindings();

            // Remove any existing entries for this command (both positive and negative)
            const filtered = bindings.filter((b: any) => b.command !== command && b.command !== `-${command}`);

            // Add negative entry to suppress the package.json default
            filtered.push({ key: "ctrl+shift+c", command: `-${command}` });
            if (process.platform === "darwin") {
                filtered.push({ key: "cmd+shift+c", command: `-${command}` });
            }

            // Add the new binding
            const entry: any = { key: newKey, command };
            if (when) entry.when = when;
            filtered.push(entry);

            this.writeKeybindings(filtered);
            vscode.window
                .showInformationMessage(`Shortcut updated! Reload window to apply.`, "Reload")
                .then((choice) => {
                    if (choice === "Reload") {
                        vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }
                });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to update shortcut: ${err.message}`);
        }
    }

    private resetKeybinding(command: string): void {
        try {
            const bindings = this.readKeybindings();
            // Remove all entries for this command (restores package.json default)
            const filtered = bindings.filter((b: any) => b.command !== command && b.command !== `-${command}`);
            this.writeKeybindings(filtered);
            vscode.window
                .showInformationMessage("Shortcuts reset to defaults! Reload window to apply.", "Reload")
                .then((choice) => {
                    if (choice === "Reload") {
                        vscode.commands.executeCommand("workbench.action.reloadWindow");
                    }
                });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to reset shortcuts: ${err.message}`);
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "sidebar", "sidebar.css"));
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "media", "sidebar", "sidebar.js"),
        );
        const _logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "icon.png"));
        const csp = webview.cspSource;

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${csp}; script-src ${csp}; img-src ${csp} https: data:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Copy4AI</title>
</head>
<body>

  <!-- ── Header ── -->
  <div class="s-header">
    <div class="s-brand">
      <img class="s-brand-logo" src="${_logoUri}" alt="Copy4AI" />
      Copy4AI
    </div>
    <span class="s-version">v0.1.0</span>
  </div>

  <!-- ── Login prompt (triggered when user copies without auth) ── -->
  <div class="s-login-prompt" id="loginPrompt">
    <span class="s-prompt-icon">&#x1F512;</span>
    <div class="s-prompt-title">Sign in required</div>
    <div class="s-prompt-text">You need to sign in to use Copy4AI</div>
  </div>

  <!-- ── Logged out ── -->
  <div id="viewLoggedOut">
    <div class="s-hero">
      <button class="s-btn-signin" id="loginBtn">
        Sign in
      </button>
      <ul class="s-features">
        <li class="s-feature">
          <span class="s-feature-icon">&#x1F517;</span>
          <span>Auto-include function dependencies</span>
        </li>
        <li class="s-feature">
          <span class="s-feature-icon">&#x2728;</span>
          <span>AI-optimized Markdown format</span>
        </li>
        <li class="s-feature">
          <span class="s-feature-icon">&#x1F4DD;</span>
          <span>Generate JSDoc documentation with AI</span>
        </li>
      </ul>
    </div>
  </div>

  <!-- ── Logged in ── -->
  <div id="viewLoggedIn" class="hidden">

    <!-- Tab bar -->
    <div class="s-tabs">
      <button class="s-tab active" data-tab="account">Account</button>
      <button class="s-tab" data-tab="history">History</button>
      <button class="s-tab" data-tab="settings">Settings</button>
    </div>

    <!-- Account tab -->
    <div class="s-tab-content" data-content="account">

      <!-- Profile card -->
      <div class="s-profile">
        <div class="s-avatar" id="avatarEl">?</div>
        <div class="s-profile-info">
          <div class="s-profile-name" id="userName">Loading&hellip;</div>
        </div>
      </div>

      <!-- Workspace selector -->
      <div class="ws">
          <div class="ws-section">
              <div class="ws-label">Team</div>
              <button class="ws-picker" id="teamPicker" type="button">
                  <span class="ws-picker-text" id="teamPickerText">Select team...</span>
                  <span class="ws-picker-badge hidden" id="teamPickerBadge"></span>
                  <span class="ws-chevron">&#x25BE;</span>
              </button>
              <div class="ws-dropdown hidden" id="teamDropdown">
                  <div class="ws-dropdown-list" id="teamList"></div>
              </div>
          </div>
          <div class="ws-section">
              <div class="ws-label">Project</div>
              <button class="ws-picker disabled" id="projectPicker" type="button" disabled>
                  <span class="ws-picker-text" id="projectPickerText">Select a team first</span>
                  <span class="ws-chevron">&#x25BE;</span>
              </button>
              <div class="ws-dropdown hidden" id="projectDropdown">
                  <div class="ws-dropdown-list" id="projectList"></div>
              </div>
          </div>
      </div>

      <!-- Credits card -->
      <div class="s-credits-card">
        <div class="s-credits-title">&#x26A1; Credits</div>

        <div class="s-credit-row">
          <div class="s-credit-label">
            <span class="s-credit-name">Daily</span>
            <span class="s-credit-value" id="dailyText">0 / 5</span>
          </div>
          <div class="s-credit-track">
            <div class="s-credit-fill daily" id="dailyBar" style="width:0%"></div>
          </div>
        </div>

        <div class="s-credit-row">
          <div class="s-credit-label">
            <span class="s-credit-name">Weekly</span>
            <span class="s-credit-value" id="weeklyText">0 / 20</span>
          </div>
          <div class="s-credit-track">
            <div class="s-credit-fill weekly" id="weeklyBar" style="width:0%"></div>
          </div>
        </div>

        <div class="s-credit-row">
          <div class="s-credit-label">
            <span class="s-credit-name">Monthly</span>
            <span class="s-credit-value" id="monthlyText">0 / 1000</span>
          </div>
          <div class="s-credit-track">
            <div class="s-credit-fill monthly" id="monthlyBar" style="width:0%"></div>
          </div>
        </div>
      </div>

      <!-- Upgrade to Pro (free users only) -->
      <div class="s-upgrade-card" id="upgradeCard" style="display:none">
        <div class="s-upgrade-card-title">&#x1F680; Upgrade to Pro</div>
        <div class="s-upgrade-features">
          <div class="s-upgrade-feature">
            <span class="s-upgrade-check">&#x2713;</span>
            <span><strong>2,000</strong> daily credits <span class="s-upgrade-vs">vs 50 free</span></span>
          </div>
          <div class="s-upgrade-feature">
            <span class="s-upgrade-check">&#x2713;</span>
            <span><strong>10,000</strong> weekly credits <span class="s-upgrade-vs">vs 200 free</span></span>
          </div>
          <div class="s-upgrade-feature">
            <span class="s-upgrade-check">&#x2713;</span>
            <span>Deep dependency analysis (L3)</span>
          </div>
          <div class="s-upgrade-feature">
            <span class="s-upgrade-check">&#x2713;</span>
            <span>Priority JSDoc generation</span>
          </div>
          <div class="s-upgrade-feature">
            <span class="s-upgrade-check">&#x2713;</span>
            <span>Export to Markdown &amp; XML</span>
          </div>
        </div>
        <button class="s-upgrade-btn" id="upgradeBtn">
          &#x2B06; Upgrade to Pro
        </button>
      </div>

      <!-- Sign out -->
      <button class="s-signout-btn" id="logoutBtn">&#x23FB;&nbsp; Sign out</button>

    </div>

    <!-- History tab -->
    <div class="s-tab-content hidden" data-content="history">
      <ul class="s-history-list" id="historyList"></ul>
    </div>

    <!-- Settings tab -->
    <div class="s-tab-content hidden" data-content="settings">

      <!-- Keyboard Shortcuts -->
      <div class="s-settings-card">
        <div class="s-settings-title">&#x2328; Keyboard Shortcuts</div>
        <div class="s-shortcut-row">
          <span class="s-shortcut-label">Copy with Copy4AI</span>
          <kbd class="s-shortcut-key" id="shortcutCopy">Ctrl+Shift+C</kbd>
        </div>
        <div class="s-shortcut-row">
          <span class="s-shortcut-label">Copy (in panel)</span>
          <kbd class="s-shortcut-key" id="shortcutPanelCopy">Ctrl+Enter</kbd>
        </div>
        <div class="s-shortcut-row">
          <span class="s-shortcut-label">Depth 1 / 2 / 3</span>
          <kbd class="s-shortcut-key">1 &middot; 2 &middot; 3</kbd>
        </div>
        <div class="s-shortcut-row">
          <span class="s-shortcut-label">Select / Deselect all</span>
          <kbd class="s-shortcut-key" id="shortcutSelectAll">Ctrl+A / Ctrl+Shift+A</kbd>
        </div>
        <div class="s-shortcut-row">
          <span class="s-shortcut-label">Undo selection</span>
          <kbd class="s-shortcut-key" id="shortcutUndo">Ctrl+Z</kbd>
        </div>
        <div class="s-shortcut-hint">Click any shortcut to change it. Esc to cancel.</div>
        <button class="s-settings-btn s-reset-btn" id="resetShortcutsBtn">Reset to defaults</button>
      </div>

      <!-- Quick Links -->
      <div class="s-settings-card">
        <div class="s-settings-title">&#x1F517; Quick Links</div>
        <button class="s-link-btn" id="docsBtn">&#x1F4D6; Documentation</button>
        <button class="s-link-btn" id="issueBtn">&#x1F41B; Report an issue</button>
      </div>

    </div>

  </div>

  <!-- ── Footer ── -->
  <div class="s-footer">
    Select code, then <kbd id="footerShortcut">Ctrl+Shift+C</kbd>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
    }
}
