import { Parser } from './index';

/**
 * Go parser.
 * Extracts imported identifiers from Go code.
 */
export class GoParser implements Parser {
  extractIdentifiers(code: string): string[] {
    const identifiers = new Set<string>();

    // Single import: import "fmt"
    const singleImportRegex = /import\s+"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = singleImportRegex.exec(code)) !== null) {
      const parts = match[1].split('/');
      identifiers.add(parts[parts.length - 1]);
    }

    // Grouped import: import ( "fmt" \n "os" )
    const groupImportRegex = /import\s*\(([\s\S]*?)\)/g;
    while ((match = groupImportRegex.exec(code)) !== null) {
      const block = match[1];
      const lineRegex = /(?:(\w+)\s+)?"([^"]+)"/g;
      let lineMatch: RegExpExecArray | null;
      while ((lineMatch = lineRegex.exec(block)) !== null) {
        if (lineMatch[1]) {
          // Aliased import
          identifiers.add(lineMatch[1]);
        } else {
          const parts = lineMatch[2].split('/');
          identifiers.add(parts[parts.length - 1]);
        }
      }
    }

    // Also look for package-qualified calls: pkg.Function
    const qualifiedRegex = /\b(\w+)\.\w+/g;
    while ((match = qualifiedRegex.exec(code)) !== null) {
      const pkg = match[1];
      if (identifiers.has(pkg)) {
        // Already tracked
        continue;
      }
    }

    // Filter out Go built-ins and keywords
    const builtins = new Set([
      'fmt', 'os', 'io', 'log', 'strings', 'strconv', 'errors',
      'context', 'sync', 'time', 'math', 'sort', 'bytes', 'net',
      'http', 'json', 'encoding', 'reflect', 'testing', 'flag',
      'if', 'else', 'for', 'range', 'switch', 'case', 'default',
      'break', 'continue', 'return', 'go', 'select', 'chan',
      'func', 'var', 'const', 'type', 'struct', 'interface',
      'map', 'package', 'import', 'defer', 'nil', 'true', 'false',
      'make', 'new', 'append', 'len', 'cap', 'close', 'delete',
      'copy', 'panic', 'recover', 'print', 'println',
      'error', 'string', 'int', 'bool', 'float64', 'float32',
      'int8', 'int16', 'int32', 'int64', 'uint', 'byte', 'rune',
    ]);

    return Array.from(identifiers).filter((id) => !builtins.has(id));
  }
}
