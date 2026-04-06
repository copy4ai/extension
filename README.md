# Copy4AI

**Copy code with its dependencies in AI-optimized Markdown format.**

Copy4AI is a VS Code extension that lets you select code, automatically resolve its dependencies (up to 3 levels deep), and copy everything as a structured Markdown snippet ready to paste into Claude, ChatGPT, or any other AI assistant. It also supports applying AI-generated code changes back into your files with a single shortcut.

| | |
|---|---|
| **Website** | [copy4ai.xyz](https://copy4ai.xyz) |
| **Dashboard** | [app.copy4ai.xyz](https://app.copy4ai.xyz) |
| **Documentation** | [docs.copy4ai.xyz](https://docs.copy4ai.xyz) |

---

## Features

### Copy with Context (`Ctrl+Shift+C` / `Cmd+Shift+C`)

Select any code in your editor and Copy4AI will:

- **Resolve dependencies** recursively using VS Code's native definition provider
- **Generate AI-optimized Markdown** with line numbers, file paths, and structured formatting
- **Copy to clipboard** in a format that AI assistants can immediately understand and work with

### Paste from AI (`Ctrl+Shift+V` / `Cmd+Shift+V`)

Parse AI-generated code responses and apply changes directly to your workspace files. Supports multiple response formats and lets you review each change before applying.

### Interactive Panel

A rich webview panel gives you full control over what gets copied:

- **Code preview** with syntax highlighting
- **Dependency tree** with checkboxes to include/exclude individual items
- **Depth control** (1-3 levels) to fine-tune how deep dependency resolution goes
- **Markdown preview** to inspect the output before copying
- **Filtering** by dependency type (types, functions, small snippets)

### AI-Powered JSDoc Generation

Generate documentation for your selected code using AI credits or your own API key (Anthropic or OpenAI).

### Sidebar

- GitHub OAuth authentication (PKCE)
- Team and project selection
- Credit quota tracking (daily and weekly)
- Copy history (last 5 snippets)

---

## Supported Languages

| Language             | Import Parsing | Dependency Resolution |
| -------------------- | -------------- | --------------------- |
| TypeScript           | Yes            | Yes                   |
| TypeScript (React)   | Yes            | Yes                   |
| JavaScript           | Yes            | Yes                   |
| JavaScript (React)   | Yes            | Yes                   |
| Python               | Yes            | Yes                   |
| Go                   | Yes            | Yes                   |

For unsupported languages, Copy4AI still copies the selected code -- dependency resolution is skipped gracefully with a warning banner.

---

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/copy4ai/extension.git
cd extension

# Install dependencies
pnpm install

# Build the extension
pnpm run build:dev

# Open in VS Code and press F5 to launch the Extension Development Host
code .
```

### From VS Code Marketplace

Search for **Copy4AI** in the VS Code Extensions panel, or install via the command line:

```bash
code --install-extension copy4ai.copy4ai
```

---

## Usage

1. **Select code** in any supported file
2. Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on macOS), or right-click and choose **"Copy with Copy4AI"**
3. The Copy4AI panel opens with your code and its resolved dependencies
4. Adjust depth, toggle dependencies, and preview the Markdown output
5. Click **Copy** to copy the AI-optimized Markdown to your clipboard
6. Paste into your AI assistant of choice

### Applying AI Responses

1. Copy the AI's code response to your clipboard
2. Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on macOS)
3. Copy4AI parses the response and applies changes to the correct files

The paste command understands the structured `<<<FILE: ... | LINES: ...>>>` format as well as common code-fence variations that AI assistants produce.

---

## Configuration

Available settings under `copy4ai.*` in VS Code:

| Setting                    | Default    | Description                                            |
| -------------------------- | ---------- | ------------------------------------------------------ |
| `copy4ai.apiUrl`           | `""`       | Custom API URL (leave empty for production)             |
| `copy4ai.aiProvider`       | `"copy4ai"`| AI provider for JSDoc: `copy4ai`, `anthropic`, `openai`|
| `copy4ai.anthropicApiKey`  | `""`       | Your Anthropic API key (bring-your-own-key mode)        |
| `copy4ai.openaiApiKey`     | `""`       | Your OpenAI API key (bring-your-own-key mode)           |

---

## Architecture

```
src/
  commands/           Command handlers (copy, paste)
  parsers/            Language-specific import extractors (TS, Python, Go)
  providers/          VS Code webview providers (panel, sidebar)
  services/           Core business logic
    apiClient.ts        REST API communication
    authService.ts      PKCE OAuth authentication
    config.ts           Environment configuration
    dependencyResolver.ts  Recursive dependency discovery
    historyService.ts   Local copy history
    markdownBuilder.ts  AI-optimized Markdown generation
  types/              Shared TypeScript interfaces
  utils/              Constants, token/credit estimation
  webview/
    panel/
      components/     React UI components (12+ components)
      hooks/          VS Code message handling hooks
      utils/          Syntax highlighting utilities
  extension.ts        Extension entry point

media/                Icons and CSS stylesheets
esbuild.js           Build configuration (dual-bundle)
```

### Key Design Decisions

- **Zero runtime dependencies** -- everything is self-contained; no npm packages bundled at runtime
- **Dual esbuild bundles** -- one for the Node.js extension host (CommonJS), one for the browser-based webview (IIFE with React)
- **VS Code native APIs** for definition resolution -- no custom language servers or AST parsers for dependency traversal
- **Regex-based import parsing** per language, with a strategy pattern for extensibility
- **PKCE OAuth** for secure authentication without exposing client secrets
- **Message-based communication** between extension and webview via a typed protocol

---

## Development

```bash
# Development build (with source maps)
pnpm run build:dev

# Production build (minified)
pnpm run build:prod

# Watch mode (rebuilds on file changes)
pnpm run watch

# Lint
pnpm run lint
```

### Adding a New Language Parser

1. Create a new file in `src/parsers/` implementing the parser interface
2. Export `extractIdentifiers(code: string): string[]` and optionally `extractNamespaceImports(code: string): string[]`
3. Register the parser in `src/parsers/index.ts`
4. Add the language ID to `SUPPORTED_LANGUAGES` in `src/utils/constants.ts`

---

## How It Works

1. **Selection** -- user selects code and triggers the copy command
2. **Parsing** -- a language-specific parser extracts imported identifiers from the selection (falls back to file-level imports filtered by usage)
3. **Resolution** -- the `DependencyResolver` uses VS Code's `vscode.executeDefinitionProvider` to locate each identifier's source, skipping `node_modules` and circular references
4. **Recursion** -- dependencies of dependencies are resolved up to the configured depth (max 3)
5. **Markdown generation** -- the `MarkdownBuilder` assembles a structured Markdown document with AI instructions, file paths, line numbers, and code blocks
6. **Clipboard** -- the result is copied and the interactive panel opens for review

---

## Credits and Pricing

Copy4AI uses a credit system for AI-powered features (JSDoc generation). Copy operations themselves are free. You can:

- Use **Copy4AI credits** (included with your account)
- Bring your own **Anthropic** or **OpenAI** API key

Credit costs scale with code size:

| Code Size         | Credits |
| ----------------- | ------- |
| Small (< 2K chars)  | 1       |
| Medium (< 8K chars) | 2       |
| Large (8K+ chars)    | 3       |
| JSDoc generation     | 2       |

---

## Requirements

- VS Code 1.85 or later
- Node.js 20+ (for development)
- pnpm (for development)

---

## License

See [LICENSE](LICENSE) for details.
