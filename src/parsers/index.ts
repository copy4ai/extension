import { TypeScriptParser } from './typescript';
import { PythonParser } from './python';
import { GoParser } from './go';

export interface Parser {
  extractIdentifiers(code: string): string[];
  extractNamespaceImports?(code: string): string[];
}

const tsParser = new TypeScriptParser();
const pyParser = new PythonParser();
const goParser = new GoParser();

const parserMap: Record<string, Parser> = {
  typescript: tsParser,
  typescriptreact: tsParser,
  javascript: tsParser,
  javascriptreact: tsParser,
  python: pyParser,
  go: goParser,
};

export function getParser(languageId: string): Parser | null {
  return parserMap[languageId] || null;
}
