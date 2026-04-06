import * as vscode from 'vscode';
import * as path from 'path';
import { CodeEntry, Dependency } from '../types';
import { getParser } from '../parsers';
import { MAX_DEPTH, MIN_DEPTH } from '../utils/constants';

export class DependencyResolver {
  private visited: Set<string> = new Set();

  async resolve(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    depth: number = 1
  ): Promise<Dependency[]> {
    this.visited.clear();
    const clampedDepth = Math.min(Math.max(depth, MIN_DEPTH), MAX_DEPTH);

    const parser = getParser(document.languageId);
    if (!parser) {
      return [];
    }

    // Mark the current file as visited to avoid self-references
    const currentFileKey = document.uri.fsPath;
    this.visited.add(currentFileKey);

    const selectedText = document.getText(selection);
    const fullFileText = document.getText();
    let identifiers = parser.extractIdentifiers(selectedText);

    // If no imports found in selection, read full file imports
    // and filter to identifiers actually used in the selected code
    if (identifiers.length === 0) {
      const allImported = parser.extractIdentifiers(fullFileText);
      identifiers = allImported.filter((id) => {
        const regex = new RegExp(`\\b${escapeRegex(id)}\\b`);
        return regex.test(selectedText);
      });
    }

    // Detect namespace imports (import * as X) to resolve X.member accesses
    const namespaceNames = parser.extractNamespaceImports?.(fullFileText) ?? [];

    const dependencies: Dependency[] = [];

    for (const identifier of identifiers) {
      if (namespaceNames.includes(identifier)) {
        // Resolve namespace members by finding the module file directly
        await this.resolveNamespaceMembers(
          document,
          identifier,
          selectedText,
          fullFileText,
          1,
          clampedDepth,
          dependencies
        );
      } else {
        await this.resolveIdentifier(
          document,
          selection,
          identifier,
          1,
          clampedDepth,
          dependencies
        );
      }
    }

    return dependencies;
  }

  private async resolveNamespaceMembers(
    document: vscode.TextDocument,
    namespaceName: string,
    selectedText: string,
    fullFileText: string,
    currentDepth: number,
    maxDepth: number,
    results: Dependency[]
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    // Extract module specifier from the import statement
    const importRegex = new RegExp(
      `import\\s+\\*\\s+as\\s+${escapeRegex(namespaceName)}\\s+from\\s+['"]([^'"]+)['"]`
    );
    const importMatch = importRegex.exec(fullFileText);
    if (!importMatch) return;

    const moduleSpecifier = importMatch[1];

    // Resolve module path to an actual file
    const moduleUri = await this.resolveModulePath(document.uri, moduleSpecifier);
    if (!moduleUri) return;
    if (moduleUri.fsPath.includes('node_modules')) return;
    if (moduleUri.fsPath === document.uri.fsPath) return;

    let moduleDoc: vscode.TextDocument;
    try {
      moduleDoc = await vscode.workspace.openTextDocument(moduleUri);
    } catch {
      return;
    }

    // Find all X.member accesses in the selected text
    const memberRegex = new RegExp(`\\b${escapeRegex(namespaceName)}\\.(\\w+)\\b`, 'g');
    const seenMembers = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = memberRegex.exec(selectedText)) !== null) {
      const memberName = m[1];
      if (seenMembers.has(memberName)) continue;
      seenMembers.add(memberName);

      const fileKey = moduleUri.fsPath + ':' + memberName;
      if (this.visited.has(fileKey)) continue;
      this.visited.add(fileKey);

      // Find the exported symbol in the module file
      const extracted = await this.findSymbolInDocument(moduleDoc, memberName);
      if (!extracted) continue;

      const relativePath = vscode.workspace.asRelativePath(moduleUri);
      const dep: Dependency = {
        symbolName: memberName,
        filePath: relativePath,
        code: extracted.code,
        language: moduleDoc.languageId,
        depth: currentDepth,
        startLine: extracted.startLine,
        endLine: extracted.endLine,
      };

      const exists = results.some(
        (r) => r.filePath === dep.filePath && r.symbolName === dep.symbolName
      );
      if (!exists) {
        results.push(dep);
      }

      // Recurse into sub-dependencies
      if (currentDepth < maxDepth) {
        const subParser = getParser(moduleDoc.languageId);
        if (subParser) {
          const moduleFullText = moduleDoc.getText();
          const allImported = subParser.extractIdentifiers(moduleFullText);
          const usedIds = allImported.filter((id) => {
            const usage = new RegExp(`\\b${escapeRegex(id)}\\b`);
            return usage.test(extracted.code);
          });

          const fullSel = new vscode.Selection(
            new vscode.Position(0, 0),
            new vscode.Position(
              moduleDoc.lineCount - 1,
              moduleDoc.lineAt(moduleDoc.lineCount - 1).text.length
            )
          );

          for (const subId of usedIds) {
            await this.resolveIdentifier(
              moduleDoc,
              fullSel,
              subId,
              currentDepth + 1,
              maxDepth,
              results
            );
          }
        }
      }
    }
  }

  private async resolveModulePath(
    fromUri: vscode.Uri,
    specifier: string
  ): Promise<vscode.Uri | null> {
    if (!specifier.startsWith('.')) return null;

    const dir = path.dirname(fromUri.fsPath);
    const base = path.resolve(dir, specifier);

    const candidates = [
      base + '.ts',
      base + '.tsx',
      base + '.js',
      base + '.jsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      path.join(base, 'index.js'),
    ];

    for (const candidate of candidates) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
        return vscode.Uri.file(candidate);
      } catch {
        // File doesn't exist, try next
      }
    }

    return null;
  }

  private async findSymbolInDocument(
    document: vscode.TextDocument,
    symbolName: string
  ): Promise<{ code: string; startLine: number; endLine: number } | null> {
    // Try document symbol provider first
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (symbols) {
        const symbol = this.findSymbolFlat(symbols, symbolName);
        if (symbol) {
          return {
            code: document.getText(symbol.range),
            startLine: symbol.range.start.line + 1,
            endLine: symbol.range.end.line + 1,
          };
        }
      }
    } catch {
      // Symbol provider not available
    }

    // Fallback: find the export declaration by regex
    const text = document.getText();
    const exportRegex = new RegExp(
      `export\\s+(?:const|let|var|function|async\\s+function|class|type|interface|enum)\\s+${escapeRegex(symbolName)}\\b`
    );
    const match = exportRegex.exec(text);
    if (!match) return null;

    const startPos = document.positionAt(match.index);
    return this.expandDefinitionRange(document, new vscode.Range(startPos, startPos));
  }

  private findSymbolFlat(
    symbols: vscode.DocumentSymbol[],
    name: string
  ): vscode.DocumentSymbol | undefined {
    for (const symbol of symbols) {
      if (symbol.name === name) return symbol;
      if (symbol.children?.length) {
        const found = this.findSymbolFlat(symbol.children, name);
        if (found) return found;
      }
    }
    return undefined;
  }

  private async resolveIdentifier(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    identifier: string,
    currentDepth: number,
    maxDepth: number,
    results: Dependency[]
  ): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }

    const positions = this.findIdentifierPositions(document, selection, identifier);

    for (const position of positions) {
      const definitions = await this.getDefinitions(document.uri, position);

      for (const definition of definitions) {
        const defUri = definition.uri || (definition as any).targetUri;
        const defRange = definition.range || (definition as any).targetRange;

        if (!defUri || !defRange) {
          continue;
        }

        // Skip node_modules
        if (defUri.fsPath.includes('node_modules')) {
          continue;
        }

        // Skip same-file definitions
        if (defUri.fsPath === document.uri.fsPath) {
          continue;
        }

        const fileKey = defUri.fsPath + ':' + identifier;
        if (this.visited.has(fileKey)) {
          continue;
        }
        this.visited.add(fileKey);

        try {
          const defDocument = await vscode.workspace.openTextDocument(defUri);
          const extracted = await this.extractDefinitionCode(defDocument, defRange, identifier);

          if (!extracted) {
            continue;
          }

          const relativePath = vscode.workspace.asRelativePath(defUri);

          const dep: Dependency = {
            symbolName: identifier,
            filePath: relativePath,
            code: extracted.code,
            language: defDocument.languageId,
            depth: currentDepth,
            startLine: extracted.startLine,
            endLine: extracted.endLine,
          };

          // Avoid duplicates by filePath + symbolName
          const exists = results.some(
            (r) => r.filePath === dep.filePath && r.symbolName === dep.symbolName
          );
          if (!exists) {
            results.push(dep);
          }

          // Recurse into this dependency's own dependencies
          if (currentDepth < maxDepth) {
            const parser = getParser(defDocument.languageId);
            if (parser) {
              // Read the FULL file to get import statements
              const fullFileText = defDocument.getText();
              const allImportedIdentifiers = parser.extractIdentifiers(fullFileText);

              // Filter to only identifiers that are actually used in the dependency code
              const usedIdentifiers = allImportedIdentifiers.filter((id) => {
                const usageRegex = new RegExp(`\\b${escapeRegex(id)}\\b`);
                return usageRegex.test(extracted.code);
              });

              // Resolve each used identifier from the full file scope
              const fullFileSelection = new vscode.Selection(
                new vscode.Position(0, 0),
                new vscode.Position(defDocument.lineCount - 1, defDocument.lineAt(defDocument.lineCount - 1).text.length)
              );

              for (const subId of usedIdentifiers) {
                await this.resolveIdentifier(
                  defDocument,
                  fullFileSelection,
                  subId,
                  currentDepth + 1,
                  maxDepth,
                  results
                );
              }
            }
          }
        } catch {
          // File couldn't be opened or read — skip
        }
      }
    }
  }

  private findIdentifierPositions(
    document: vscode.TextDocument,
    selection: vscode.Selection,
    identifier: string
  ): vscode.Position[] {
    const positions: vscode.Position[] = [];
    const text = document.getText(selection);
    const regex = new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const offset = document.offsetAt(selection.start) + match.index;
      positions.push(document.positionAt(offset));
      // Only need the first occurrence for definition lookup
      break;
    }

    return positions;
  }

  private async getDefinitions(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<vscode.Location[]> {
    try {
      const result = await vscode.commands.executeCommand<
        (vscode.Location | vscode.LocationLink)[]
      >('vscode.executeDefinitionProvider', uri, position);

      if (!result || result.length === 0) {
        return [];
      }

      // Normalize LocationLink to Location
      return result.map((item) => {
        if ('targetUri' in item) {
          return new vscode.Location(item.targetUri, item.targetRange);
        }
        return item as vscode.Location;
      });
    } catch {
      return [];
    }
  }

  private async extractDefinitionCode(
    document: vscode.TextDocument,
    range: vscode.Range,
    symbolName: string
  ): Promise<{ code: string; startLine: number; endLine: number } | null> {
    // First, try to get document symbols to find the full definition
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );

      if (symbols) {
        const symbol = this.findSymbolByName(symbols, symbolName, range);
        if (symbol) {
          return {
            code: document.getText(symbol.range),
            startLine: symbol.range.start.line + 1,
            endLine: symbol.range.end.line + 1,
          };
        }
      }
    } catch {
      // Symbol provider not available
    }

    // Fallback: expand from the definition position to find the full block
    return this.expandDefinitionRange(document, range);
  }

  private findSymbolByName(
    symbols: vscode.DocumentSymbol[],
    name: string,
    range: vscode.Range
  ): vscode.DocumentSymbol | undefined {
    for (const symbol of symbols) {
      if (symbol.name === name && symbol.range.contains(range.start)) {
        return symbol;
      }
      // Search children
      if (symbol.children && symbol.children.length > 0) {
        const found = this.findSymbolByName(symbol.children, name, range);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }

  private expandDefinitionRange(
    document: vscode.TextDocument,
    range: vscode.Range
  ): { code: string; startLine: number; endLine: number } | null {
    const startLine = range.start.line;
    let endLine = range.end.line;
    const totalLines = document.lineCount;

    // Track bracket depth to find the end of a block
    let braceDepth = 0;
    let parenDepth = 0;
    let started = false;

    for (let i = startLine; i < totalLines; i++) {
      const lineText = document.lineAt(i).text;

      for (const ch of lineText) {
        if (ch === '{') {
          braceDepth++;
          started = true;
        } else if (ch === '}') {
          braceDepth--;
        } else if (ch === '(') {
          parenDepth++;
          started = true;
        } else if (ch === ')') {
          parenDepth--;
        }
      }

      endLine = i;

      // If we opened and closed all brackets, we found the end
      if (started && braceDepth <= 0 && parenDepth <= 0) {
        break;
      }

      // Safety limit: don't scan more than 200 lines
      if (i - startLine > 200) {
        break;
      }
    }

    const fullRange = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );

    const text = document.getText(fullRange).trim();
    if (!text) return null;

    return {
      code: text,
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
