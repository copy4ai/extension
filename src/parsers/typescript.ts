import { Parser } from './index';

/**
 * TypeScript/JavaScript parser.
 * Extracts imported identifiers from code text by analyzing import statements
 * and identifying referenced symbols.
 */
export class TypeScriptParser implements Parser {
  extractIdentifiers(code: string): string[] {
    const identifiers = new Set<string>();

    // Extract from import statements:
    // import { foo, bar } from './module'
    // import { foo as bar } from './module'
    // import foo from './module'
    // import * as foo from './module'
    const importRegex =
      /import\s+(?:(?:\{([^}]+)\})|(?:\*\s+as\s+(\w+))|(?:(\w+)))(?:\s*,\s*(?:\{([^}]+)\}))?\s+from\s+['"][^'"]+['"]/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(code)) !== null) {
      // Named imports: { foo, bar, baz as qux }
      if (match[1]) {
        const names = match[1].split(',').map((s) => s.trim());
        for (const name of names) {
          const asMatch = name.match(/(\w+)\s+as\s+(\w+)/);
          if (asMatch) {
            identifiers.add(asMatch[2]); // Use the alias
          } else if (name) {
            identifiers.add(name);
          }
        }
      }
      // Namespace import: * as foo
      if (match[2]) {
        identifiers.add(match[2]);
      }
      // Default import: import foo
      if (match[3]) {
        identifiers.add(match[3]);
      }
      // Additional named imports after default: import foo, { bar }
      if (match[4]) {
        const names = match[4].split(',').map((s) => s.trim());
        for (const name of names) {
          const asMatch = name.match(/(\w+)\s+as\s+(\w+)/);
          if (asMatch) {
            identifiers.add(asMatch[2]);
          } else if (name) {
            identifiers.add(name);
          }
        }
      }
    }

    // Extract require() calls:
    // const foo = require('./module')
    // const { foo, bar } = require('./module')
    const requireRegex =
      /(?:const|let|var)\s+(?:(\w+)|\{([^}]+)\})\s*=\s*require\s*\(\s*['"][^'"]+['"]\s*\)/g;

    while ((match = requireRegex.exec(code)) !== null) {
      if (match[1]) {
        identifiers.add(match[1]);
      }
      if (match[2]) {
        const names = match[2].split(',').map((s) => s.trim());
        for (const name of names) {
          if (name) {
            identifiers.add(name);
          }
        }
      }
    }

    // Filter out common JS/TS keywords that shouldn't be resolved
    const keywords = new Set([
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
      'continue', 'return', 'throw', 'try', 'catch', 'finally',
      'new', 'delete', 'typeof', 'instanceof', 'void', 'in', 'of',
      'class', 'extends', 'super', 'this', 'import', 'export',
      'default', 'from', 'as', 'async', 'await', 'yield',
      'function', 'const', 'let', 'var', 'type', 'interface',
      'enum', 'namespace', 'module', 'declare', 'abstract',
      'implements', 'readonly', 'private', 'protected', 'public',
      'static', 'true', 'false', 'null', 'undefined',
      'console', 'process', 'require', 'module', 'exports',
      'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean',
      'Map', 'Set', 'Date', 'Error', 'RegExp', 'JSON', 'Math',
      'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    ]);

    return Array.from(identifiers).filter((id) => !keywords.has(id));
  }

  extractNamespaceImports(code: string): string[] {
    const namespaces: string[] = [];
    const regex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code)) !== null) {
      namespaces.push(match[1]);
    }
    return namespaces;
  }
}
