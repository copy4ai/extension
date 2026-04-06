import { CodeEntry, Dependency, CopyResult } from '../types';
import { estimateCredits } from '../utils/tokenEstimator';

const AI_PROMPT_HEADER = `## Instructions for AI

Below is source code from a project. After making changes, return
the result in EXACTLY this format for each modified file.

IMPORTANT: Wrap your ENTIRE response in a single code block so the
user can copy it cleanly. Example:

\`\`\`
<<<FILE: relative/path/to/file.ts | LINES: 5-17>>>
// complete replacement code for that line range
<<<END>>>

<<<FILE: relative/path/to/other.ts | LINES: 1-10>>>
// complete replacement code for that line range
<<<END>>>
\`\`\`

Rules:
- Only include files you actually changed
- Keep the FILE/LINES/END markers exactly as shown
- LINES refers to the original line range in the source file
- Return the COMPLETE replacement code for that line range
- Do not change the markers format
- ALL output MUST be inside a single code block

---

`;

function getLanguageId(language: string): string {
  const map: Record<string, string> = {
    typescriptreact: 'tsx',
    javascriptreact: 'jsx',
  };
  return map[language] || language;
}

export function buildMarkdown(
  root: CodeEntry,
  dependencies: Dependency[] = [],
  jsdoc?: string
): CopyResult {
  const langId = getLanguageId(root.language);
  let md = `## Function: ${root.symbolName || 'Selected Code'}\n\n`;

  if (jsdoc) {
    md += `${jsdoc}\n\n`;
  }

  md += `\`\`\`${langId}\n// ${root.filePath}\n${root.code}\n\`\`\`\n`;

  if (dependencies.length > 0) {
    md += `\n## Dependencies\n`;

    for (const dep of dependencies) {
      const depLang = getLanguageId(dep.language);
      md += `\n### ${dep.symbolName} (${dep.filePath})\n\n`;
      md += `\`\`\`${depLang}\n${dep.code}\n\`\`\`\n`;
    }
  }

  const charCount = md.length;
  const estimatedCredits = estimateCredits(charCount);

  return {
    markdown: md,
    charCount,
    estimatedCredits,
    fileCount: 1 + dependencies.length,
  };
}

export function buildAIReadyMarkdown(
  root: CodeEntry,
  dependencies: Dependency[] = [],
  jsdoc?: string
): CopyResult {
  const langId = getLanguageId(root.language);
  let md = AI_PROMPT_HEADER;

  md += `## Function: ${root.symbolName || 'Selected Code'}\n\n`;

  if (jsdoc) {
    md += `${jsdoc}\n\n`;
  }

  const rootLineInfo = `| Lines: ${root.startLine}-${root.endLine}`;
  md += `\`\`\`${langId}\n// File: ${root.filePath} ${rootLineInfo}\n${root.code}\n\`\`\`\n`;

  if (dependencies.length > 0) {
    md += `\n## Dependencies\n`;

    for (const dep of dependencies) {
      const depLang = getLanguageId(dep.language);
      const depLineInfo = dep.startLine && dep.endLine
        ? ` | Lines: ${dep.startLine}-${dep.endLine}`
        : '';
      md += `\n### ${dep.symbolName} (${dep.filePath}${depLineInfo})\n\n`;
      md += `\`\`\`${depLang}\n// File: ${dep.filePath}${depLineInfo}\n${dep.code}\n\`\`\`\n`;
    }
  }

  const charCount = md.length;
  const credits = estimateCredits(charCount);

  return {
    markdown: md,
    charCount,
    estimatedCredits: credits,
    fileCount: 1 + dependencies.length,
  };
}
