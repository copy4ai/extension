import * as vscode from "vscode";
import { CopyPanelProvider } from "../providers/panelProvider";
import { DependencyResolver } from "../services/dependencyResolver";
import type { HistoryService } from "../services/historyService";
import type { CodeEntry } from "../types";
import { DEFAULT_DEPTH, LANGUAGE_DISPLAY_NAMES, SUPPORTED_LANGUAGES } from "../utils/constants";
import { estimateCredits } from "../utils/tokenEstimator";

function getFunctionName(document: vscode.TextDocument, selection: vscode.Selection): string {
    // Check the first few lines of selection for function/class patterns
    const startLine = selection.start.line;
    const endLine = Math.min(startLine + 3, selection.end.line);

    for (let i = startLine; i <= endLine; i++) {
        const line = document.lineAt(i).text;
        const patterns = [
            /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
            /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/,
            /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/,
            /(?:export\s+)?(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/,
            /(?:export\s+)?(?:class|interface|type|enum)\s+(\w+)/,
            /def\s+(\w+)\s*\(/,
            /func\s+(\w+)\s*\(/,
        ];

        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                return match[1];
            }
        }
    }

    return "Selected Code";
}

export async function copyWithContext(extensionUri: vscode.Uri, historyService: HistoryService): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage("No active editor found.");
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage("Please select some code first.");
        return;
    }

    const document = editor.document;
    const languageId = document.languageId;

    const isUnsupported = !SUPPORTED_LANGUAGES.includes(languageId as any);

    const selectedText = document.getText(selection);
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const functionName = getFunctionName(document, selection);

    const root: CodeEntry = {
        filePath: relativePath,
        code: selectedText,
        language: languageId,
        symbolName: functionName,
        isMain: true,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
    };

    // Resolve dependencies at default depth (skip for unsupported languages)
    const resolver = new DependencyResolver();
    let dependencies = [];
    if (!isUnsupported) {
        try {
            dependencies = await resolver.resolve(document, selection, DEFAULT_DEPTH);
        } catch {
            // Dependency resolution failed — continue with no deps
        }
    }

    // Open panel with data
    CopyPanelProvider.createOrShow(
        extensionUri,
        root,
        dependencies,
        document,
        selection,
        // onCopy callback — save to history
        (copiedRoot, copiedDeps, markdown) => {
            const totalChars = markdown.length;
            historyService.addEntry({
                functionName: copiedRoot.symbolName || "Selected Code",
                filePath: copiedRoot.filePath,
                charCount: totalChars,
                estimatedCredits: estimateCredits(totalChars),
                dependencyCount: copiedDeps.length,
                markdown: markdown,
                root: copiedRoot,
                dependencies: copiedDeps,
            });
        },
    );

    // Show warning in panel for unsupported languages
    if (isUnsupported) {
        const supported = SUPPORTED_LANGUAGES.map((l) => LANGUAGE_DISPLAY_NAMES[l] || l)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(", ");
        CopyPanelProvider.showWarning(
            `Dependency resolution is not supported for "${languageId}". You can still copy the code. Supported: ${supported}`,
        );
    }
}
