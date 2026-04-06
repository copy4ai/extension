import { Parser } from './index';

/**
 * Python parser.
 * Extracts imported identifiers from Python code.
 */
export class PythonParser implements Parser {
  extractIdentifiers(code: string): string[] {
    const identifiers = new Set<string>();

    // from module import foo, bar
    // from module import foo as bar
    // from .module import foo
    const fromImportRegex =
      /from\s+[.\w]+\s+import\s+(.+)/g;

    let match: RegExpExecArray | null;
    while ((match = fromImportRegex.exec(code)) !== null) {
      const imports = match[1].split(',').map((s) => s.trim());
      for (const imp of imports) {
        const asMatch = imp.match(/(\w+)\s+as\s+(\w+)/);
        if (asMatch) {
          identifiers.add(asMatch[2]);
        } else {
          const name = imp.match(/^(\w+)/);
          if (name) {
            identifiers.add(name[1]);
          }
        }
      }
    }

    // import module
    // import module as alias
    const importRegex = /^import\s+(\w+)(?:\s+as\s+(\w+))?/gm;
    while ((match = importRegex.exec(code)) !== null) {
      if (match[2]) {
        identifiers.add(match[2]);
      } else {
        identifiers.add(match[1]);
      }
    }

    // Filter out Python built-ins
    const builtins = new Set([
      'print', 'len', 'range', 'str', 'int', 'float', 'bool',
      'list', 'dict', 'set', 'tuple', 'type', 'isinstance',
      'None', 'True', 'False', 'self', 'cls',
      'if', 'else', 'elif', 'for', 'while', 'break', 'continue',
      'return', 'def', 'class', 'import', 'from', 'as', 'try',
      'except', 'finally', 'raise', 'with', 'pass', 'lambda',
      'and', 'or', 'not', 'in', 'is', 'async', 'await', 'yield',
    ]);

    return Array.from(identifiers).filter((id) => !builtins.has(id));
  }
}
