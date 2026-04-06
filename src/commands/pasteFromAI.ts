import * as vscode from 'vscode';

interface AICodeBlock {
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Primary: <<<FILE: path | LINES: 5-17>>> ... <<<END>>>
function parseMarkerFormat(text: string): AICodeBlock[] {
  const blocks: AICodeBlock[] = [];
  // Tolerant regex: optional backticks around markers, flexible whitespace, case-insensitive
  const regex = /`{0,3}\s*<<<\s*FILE:\s*(.+?)\s*\|\s*LINES:\s*(\d+)\s*-\s*(\d+)\s*>>>\s*`{0,3}\n([\s\S]*?)`{0,3}\s*<<<\s*END\s*>>>\s*`{0,3}/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const code = stripWrappingCodeFence(match[4]).trim();
    if (code) {
      blocks.push({
        filePath: match[1].trim(),
        startLine: parseInt(match[2], 10),
        endLine: parseInt(match[3], 10),
        code,
      });
    }
  }
  return blocks;
}

// Fallback 1: code fence with // File: path | Lines: 5-17 comment on first line
function parseCodeFenceComment(text: string): AICodeBlock[] {
  const blocks: AICodeBlock[] = [];
  const regex = /```\w*\n\s*(?:\/\/|#|--|\/\*)\s*File:\s*(.+?)\s*\|\s*Lines?:\s*(\d+)\s*-\s*(\d+)[\s*\/]*\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const code = match[4].trim();
    if (code) {
      blocks.push({
        filePath: match[1].trim(),
        startLine: parseInt(match[2], 10),
        endLine: parseInt(match[3], 10),
        code,
      });
    }
  }
  return blocks;
}

// Fallback 2: **File:** `path` **Lines:** `5-17` followed by code fence
function parseMarkdownLabels(text: string): AICodeBlock[] {
  const blocks: AICodeBlock[] = [];
  const regex = /\*{0,2}File:?\*{0,2}\s*`?([^`\n]+?)`?\s*(?:\||,|\*{0,2})\s*\*{0,2}Lines?:?\*{0,2}\s*`?(\d+)\s*-\s*(\d+)`?\s*\n+\s*```\w*\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const code = match[4].trim();
    if (code) {
      blocks.push({
        filePath: match[1].trim(),
        startLine: parseInt(match[2], 10),
        endLine: parseInt(match[3], 10),
        code,
      });
    }
  }
  return blocks;
}

// Strip wrapping code fences if AI put them inside the markers
function stripWrappingCodeFence(code: string): string {
  const trimmed = code.trim();
  const fenceStart = /^```\w*\n/;
  const fenceEnd = /\n```\s*$/;
  if (fenceStart.test(trimmed) && fenceEnd.test(trimmed)) {
    return trimmed.replace(fenceStart, '').replace(fenceEnd, '');
  }
  return trimmed;
}

async function findFileInWorkspace(relativePath: string): Promise<vscode.Uri | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return undefined;

  // Clean path: remove leading ./ or /
  const cleanPath = relativePath.replace(/^\.?\//, '');

  for (const folder of workspaceFolders) {
    const uri = vscode.Uri.joinPath(folder.uri, cleanPath);
    try {
      await vscode.workspace.fs.stat(uri);
      return uri;
    } catch {
      // File not found in this folder
    }
  }

  // Fallback: search by filename
  const fileName = cleanPath.split('/').pop() || cleanPath;
  const results = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 5);
  if (results.length === 1) {
    return results[0];
  }
  if (results.length > 1) {
    const match = results.find(r => r.fsPath.replace(/\\/g, '/').endsWith(cleanPath));
    return match || results[0];
  }
  return undefined;
}

export async function pasteFromAI(): Promise<void> {
  const rawClipText = await vscode.env.clipboard.readText();

  if (!rawClipText.trim()) {
    vscode.window.showWarningMessage('Clipboard is empty.');
    return;
  }

  const clipText = normalize(rawClipText);

  // Try parsers in order of specificity
  let blocks = parseMarkerFormat(clipText);

  if (blocks.length === 0) {
    blocks = parseCodeFenceComment(clipText);
  }

  if (blocks.length === 0) {
    blocks = parseMarkdownLabels(clipText);
  }

  if (blocks.length === 0) {
    const preview = clipText.substring(0, 300).replace(/\n/g, '\\n');
    const channel = vscode.window.createOutputChannel('Copy4AI');
    channel.clear();
    channel.appendLine('=== Paste from AI: Parse failed ===');
    channel.appendLine('');
    channel.appendLine('Clipboard length: ' + clipText.length);
    channel.appendLine('Has <<<: ' + clipText.includes('<<<'));
    channel.appendLine('Has FILE: ' + clipText.includes('FILE:'));
    channel.appendLine('Has END: ' + clipText.includes('END'));
    channel.appendLine('Has LINES: ' + clipText.includes('LINES:'));
    channel.appendLine('');
    channel.appendLine('--- RAW CLIPBOARD (first 500 chars) ---');
    channel.appendLine(clipText.substring(0, 500));
    channel.appendLine('--- END ---');
    channel.appendLine('');
    channel.appendLine('--- CHAR CODES (first 100 chars) ---');
    channel.appendLine(Array.from(clipText.substring(0, 100)).map(c => c.charCodeAt(0)).join(' '));
    channel.appendLine('--- END ---');
    channel.show(true);

    vscode.window.showWarningMessage(
      `No AI code blocks found. Clipboard preview: ${preview.substring(0, 120)}...`,
      'Show Output'
    ).then(choice => {
      if (choice === 'Show Output') channel.show(true);
    });
    return;
  }

  // Show summary and ask for confirmation
  const fileList = blocks.map(b => `${b.filePath} (lines ${b.startLine}-${b.endLine})`);
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'Apply All', description: `${blocks.length} file change(s)`, detail: fileList.join(', '), value: 'all' as const },
      { label: 'Review One by One', description: 'Approve each change individually', value: 'review' as const },
      { label: 'Cancel', value: 'cancel' as const },
    ],
    { placeHolder: `Paste from AI: ${blocks.length} change(s) detected` }
  );

  if (!pick || pick.value === 'cancel') {
    return;
  }

  const approvedBlocks: AICodeBlock[] = [];

  if (pick.value === 'all') {
    approvedBlocks.push(...blocks);
  } else {
    for (const block of blocks) {
      const action = await vscode.window.showQuickPick(
        [
          { label: 'Apply', value: 'apply' as const },
          { label: 'Skip', value: 'skip' as const },
          { label: 'Cancel All', value: 'cancel' as const },
        ],
        { placeHolder: `${block.filePath} lines ${block.startLine}-${block.endLine}` }
      );
      if (!action || action.value === 'cancel') break;
      if (action.value === 'apply') {
        approvedBlocks.push(block);
      }
    }
  }

  if (approvedBlocks.length === 0) {
    vscode.window.showInformationMessage('No changes applied.');
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  const skipped: string[] = [];

  for (const block of approvedBlocks) {
    const uri = await findFileInWorkspace(block.filePath);
    if (!uri) {
      skipped.push(block.filePath);
      continue;
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    const lastLineIdx = Math.min(block.endLine, doc.lineCount) - 1;
    const range = new vscode.Range(
      new vscode.Position(block.startLine - 1, 0),
      new vscode.Position(lastLineIdx, doc.lineAt(lastLineIdx).text.length)
    );
    edit.replace(uri, range, block.code);
  }

  const success = await vscode.workspace.applyEdit(edit);

  if (success) {
    const applied = approvedBlocks.length - skipped.length;
    let msg = `Applied ${applied} change(s).`;
    if (skipped.length > 0) {
      msg += ` Skipped ${skipped.length} (file not found: ${skipped.join(', ')})`;
    }
    vscode.window.showInformationMessage(msg);
  } else {
    vscode.window.showErrorMessage('Failed to apply changes.');
  }
}
