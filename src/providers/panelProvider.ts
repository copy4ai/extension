import * as vscode from "vscode";
import type { ApiClient } from "../services/apiClient";
import { DependencyResolver } from "../services/dependencyResolver";
import { buildAIReadyMarkdown, buildMarkdown } from "../services/markdownBuilder";
import type { CodeEntry, Dependency, WebviewToExtensionMessage } from "../types";
import { DEFAULT_DEPTH } from "../utils/constants";
import { estimateCredits } from "../utils/tokenEstimator";

export class CopyPanelProvider {
    private static currentPanel: CopyPanelProvider | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private readonly resolver: DependencyResolver;
    private root: CodeEntry;
    private document: vscode.TextDocument;
    private selection: vscode.Selection;
    private dependencies: Dependency[];
    private currentDepth: number = DEFAULT_DEPTH;
    private disposables: vscode.Disposable[] = [];
    private onCopyCallback?: (root: CodeEntry, deps: Dependency[], markdown: string) => void;
    private generatedJSDoc?: string;
    private static apiClient?: ApiClient;
    private maxDepth: number = 3;

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        root: CodeEntry,
        dependencies: Dependency[],
        document: vscode.TextDocument,
        selection: vscode.Selection,
    ) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.root = root;
        this.dependencies = dependencies;
        this.document = document;
        this.selection = selection;
        this.resolver = new DependencyResolver();

        this.panel.webview.html = this.getHtmlContent();

        this.panel.webview.onDidReceiveMessage(
            (message: WebviewToExtensionMessage) => this.handleMessage(message),
            null,
            this.disposables,
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static setApiClient(client: ApiClient): void {
        CopyPanelProvider.apiClient = client;
    }

    public static showWarning(message: string): void {
        if (CopyPanelProvider.currentPanel) {
            CopyPanelProvider.currentPanel.panel.webview.postMessage({
                type: "showWarning",
                payload: { message },
            });
        }
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        root: CodeEntry,
        dependencies: Dependency[],
        document: vscode.TextDocument,
        selection: vscode.Selection,
        onCopy?: (root: CodeEntry, deps: Dependency[], markdown: string) => void,
    ): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (CopyPanelProvider.currentPanel) {
            const p = CopyPanelProvider.currentPanel;
            p.root = root;
            p.dependencies = dependencies;
            p.document = document;
            p.selection = selection;
            p.currentDepth = DEFAULT_DEPTH;
            p.generatedJSDoc = undefined;
            p.onCopyCallback = onCopy;
            p.panel.reveal(column);
            p.sendDataToWebview();
            return;
        }

        const panel = vscode.window.createWebviewPanel("copy4ai.panel", "Copy4AI", column || vscode.ViewColumn.Beside, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [extensionUri],
        });

        CopyPanelProvider.currentPanel = new CopyPanelProvider(
            panel,
            extensionUri,
            root,
            dependencies,
            document,
            selection,
        );
        CopyPanelProvider.currentPanel.onCopyCallback = onCopy;
        CopyPanelProvider.currentPanel.fetchMaxDepth();
    }

    private async fetchMaxDepth(): Promise<void> {
        if (!CopyPanelProvider.apiClient) return;
        try {
            const quota = await CopyPanelProvider.apiClient.getQuota();
            if (quota?.maxDepth) {
                this.maxDepth = quota.maxDepth;
                this.panel.webview.postMessage({ type: "setMaxDepth", payload: { maxDepth: this.maxDepth } });
            }
        } catch {
            // Use default maxDepth
        }
    }

    private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        switch (message.type) {
            case "copy": {
                const selectedDeps = this.dependencies.filter((d) =>
                    message.payload.selectedDependencies.includes(`${d.filePath}:${d.symbolName}`),
                );
                const result = message.payload.aiReady
                    ? buildAIReadyMarkdown(this.root, selectedDeps, this.generatedJSDoc)
                    : buildMarkdown(this.root, selectedDeps, this.generatedJSDoc);

                if (CopyPanelProvider.apiClient) {
                    try {
                        const fileName = this.root.filePath ? (this.root.filePath.split("/").pop() ?? null) : null;
                        await CopyPanelProvider.apiClient.trackUsage(
                            result.markdown,
                            this.root.language,
                            fileName,
                            selectedDeps.length,
                        );
                        vscode.commands.executeCommand("copy4ai.refreshQuota");
                    } catch (err: any) {
                        if (err?.code === "DAILY_CREDITS_EXCEEDED" || err?.code === "WEEKLY_CREDITS_EXCEEDED") {
                            this.panel.webview.postMessage({
                                type: "showWarning",
                                payload: {
                                    message: `Credit limit reached! ${err.message}. Upgrade your plan for more credits.`,
                                },
                            });
                            this.panel.webview.postMessage({ type: "copyBlocked" });
                            return;
                        }
                        // Other errors (network etc.) — allow copy anyway
                    }
                }

                await vscode.env.clipboard.writeText(result.markdown);
                this.panel.webview.postMessage({ type: "copySuccess" });
                vscode.window.showInformationMessage(
                    `Copied to clipboard! (${result.fileCount} file${result.fileCount > 1 ? "s" : ""}, ~${result.charCount} chars, ~${result.estimatedCredits} credit${result.estimatedCredits > 1 ? "s" : ""})`,
                );
                if (this.onCopyCallback) {
                    this.onCopyCallback(this.root, selectedDeps, result.markdown);
                }
                break;
            }

            case "depthChange": {
                this.currentDepth = message.payload.depth;
                await this.reResolveDependencies();
                break;
            }

            case "ready": {
                this.sendDataToWebview();
                break;
            }

            case "generateJSDoc": {
                await this.handleGenerateJSDoc();
                break;
            }

            case "feedback": {
                // Will be sent to analytics later
                break;
            }
        }
    }

    private async handleGenerateJSDoc(): Promise<void> {
        if (!CopyPanelProvider.apiClient) {
            this.panel.webview.postMessage({
                type: "jsdocResult",
                payload: { success: false, error: "Not signed in. Please sign in first." },
            });
            return;
        }

        this.panel.webview.postMessage({ type: "jsdocLoading", payload: { loading: true } });

        try {
            const result = await CopyPanelProvider.apiClient.generateJSDoc(this.root.code, this.root.language);
            const jsdocText = result.documentedCode;
            this.generatedJSDoc = jsdocText;
            this.panel.webview.postMessage({
                type: "jsdocResult",
                payload: { success: true, jsdoc: jsdocText },
            });

            // Copy generated JSDoc to clipboard
            await vscode.env.clipboard.writeText(jsdocText);
            vscode.window.showInformationMessage(
                `JSDoc generated and copied to clipboard! (${result.creditsCharged} credit${result.creditsCharged > 1 ? "s" : ""})`,
            );

            // Refresh quota in sidebar
            vscode.commands.executeCommand("copy4ai.refreshQuota");
        } catch (err: any) {
            const message = err?.message || "Failed to generate JSDoc";
            this.panel.webview.postMessage({
                type: "jsdocResult",
                payload: { success: false, error: message },
            });
        }

        this.panel.webview.postMessage({ type: "jsdocLoading", payload: { loading: false } });
    }

    private async reResolveDependencies(): Promise<void> {
        if (!this.document && this.root.filePath) {
            try {
                const files = await vscode.workspace.findFiles(`**/${this.root.filePath}`, null, 1);
                if (files.length > 0) {
                    this.document = await vscode.workspace.openTextDocument(files[0]);
                    const lastLine = this.document.lineCount - 1;
                    this.selection = new vscode.Selection(
                        new vscode.Position(0, 0),
                        new vscode.Position(lastLine, this.document.lineAt(lastLine).text.length),
                    );
                }
            } catch {
                // File not found — can't re-resolve
            }
        }

        if (!this.document || !this.selection) {
            return;
        }

        this.panel.webview.postMessage({ type: "loading", payload: { loading: true } });

        try {
            this.dependencies = await this.resolver.resolve(this.document, this.selection, this.currentDepth);
        } catch {
            this.dependencies = [];
        }

        this.panel.webview.postMessage({ type: "loading", payload: { loading: false } });
        this.sendDataToWebview();
    }

    private sendDataToWebview(): void {
        const totalChars = this.root.code.length + this.dependencies.reduce((sum, d) => sum + d.code.length, 0);

        this.panel.webview.postMessage({
            type: "setData",
            payload: {
                root: this.root,
                dependencies: this.dependencies,
                charCount: totalChars,
                estimatedCredits: estimateCredits(totalChars),
                currentDepth: this.currentDepth,
                isHistoryReplay: !this.document,
            },
        });
    }

    private getHtmlContent(): string {
        const webview = this.panel.webview;
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "panel", "panel.css"));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "out", "panel-view.js"));
        const csp = webview.cspSource;

        return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${csp}; script-src ${csp}; img-src ${csp} data:;">
  <link rel="stylesheet" href="${cssUri}">
  <title>Copy4AI</title>
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    private dispose(): void {
        CopyPanelProvider.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) {
                d.dispose();
            }
        }
    }
}
