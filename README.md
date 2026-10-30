# @anthropic/code-parser

A production-ready, reusable, multi-language static code analysis parser built on [Tree-sitter](https://tree-sitter.github.io/) (`web-tree-sitter`) for seamless integration into VS Code extensions.

Zero external cloud or LLM dependencies. Operates 100% locally with high-performance WebAssembly grammar parsers.

---

## Supported Languages

| Language | File Extensions | Grammar WASM | Extraction Features |
|---|---|---|---|
| **TypeScript** | `.ts`, `.mts`, `.cts` | `tree-sitter-typescript.wasm` | Classes, interfaces, types, functions, arrow fns, methods, decorators, imports/exports, calls |
| **TSX / JSX** | `.tsx`, `.jsx` | `tree-sitter-tsx.wasm` / `javascript` | React components, JSX expressions, props, hooks, imports/exports |
| **JavaScript** | `.js`, `.mjs`, `.cjs` | `tree-sitter-javascript.wasm` | ES6+ syntax, CommonJS imports, classes, functions, closures, calls |
| **Python** | `.py`, `.pyi` | `tree-sitter-python.wasm` | Classes, methods, functions, async def, docstrings, decorators, relative/absolute imports |
| **Java** | `.java` | `tree-sitter-java.wasm` | Classes, interfaces, enums, constructors, methods, annotations, imports |
| **C / C++** | `.c`, `.h`, `.cpp`, `.hpp`, `.cc`, `.cxx` | `tree-sitter-c.wasm`, `tree-sitter-cpp.wasm` | Structs, classes, templates, preprocessor includes/defines, methods, namespaces |
| **Go** | `.go` | `tree-sitter-go.wasm` | Packages, imports, structs, interfaces, methods with receivers, exports (uppercase) |
| **Rust** | `.rs` | `tree-sitter-rust.wasm` | Structs, enums, traits, `impl` blocks, `use` statements, `pub` visibility, calls |
| **C#** | `.cs` | `tree-sitter-c_sharp.wasm` | Namespaces, classes, interfaces, records, methods, properties, using directives |
| **Ruby** | `.rb`, `.rake`, `.gemspec` | `tree-sitter-ruby.wasm` | Classes, modules, `def` methods, `attr_accessor`, `require`/`require_relative` |
| **PHP** | `.php`, `.phtml` | `tree-sitter-php.wasm` | Namespaces, `use` statements, classes, traits, interfaces, methods, visibility |

---

## Architecture

```
code-parser/
├── src/
│   ├── index.ts              # Public API entry point
│   ├── types.ts              # Canonical normalized JSON schema
│   ├── parser.ts             # Core CodeParser class with LRU caching & error recovery
│   ├── languageRegistry.ts   # Extensible registry for language extractors
│   ├── importResolver.ts     # Local import resolution (relative paths, index files)
│   ├── astHelpers.ts         # Fast AST traversal, node utilities, comments, calls
│   ├── extractors/           # Language-specific AST extraction logic
│   │   ├── index.ts          # Extractor registration
│   │   ├── typescript.ts     # JS / TS / TSX / JSX
│   │   ├── python.ts         # Python
│   │   ├── java.ts           # Java
│   │   ├── go.ts             # Go
│   │   ├── rust.ts           # Rust
│   │   ├── c_cpp.ts          # C & C++
│   │   ├── csharp.ts         # C#
│   │   ├── ruby.ts           # Ruby
│   │   └── php.ts            # PHP
│   └── test/
│       └── smoke.ts          # Comprehensive multi-language test suite
├── dist/                     # Compiled JavaScript & TypeScript .d.ts definitions
├── package.json
└── tsconfig.json
```

---

## Quickstart & Usage in a VS Code Extension

### 1. Basic File Parsing

```typescript
import { parseFile, parseSource, CodeParser } from '@anthropic/code-parser';

// Parse a file on disk
const result = await parseFile('/path/to/project/src/index.ts', '/path/to/project');
console.log(result.file.language);         // 'typescript'
console.log(result.functions.length);       // 12
console.log(result.classes.length);         // 3
console.log(result.functionRelationships);  // Caller -> Callee mapping
```

### 2. Parse from an Active VS Code Text Buffer (Unsaved Editor Tab)

```typescript
import * as vscode from 'vscode';
import { parseSource } from '@anthropic/code-parser';

export async function analyzeActiveEditor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const projectRoot = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

  const parsed = await parseSource(
    document.getText(),
    document.uri.fsPath,
    projectRoot
  );

  return parsed;
}
```

### 3. Custom WASM Path for Bundled Extensions

In a packaged extension (`vsce`), WASM files can be bundled under the extension directory:

```typescript
import { CodeParser } from '@anthropic/code-parser';
import * as path from 'path';

export function createExtensionParser(context: vscode.ExtensionContext) {
  const wasmDir = context.asAbsolutePath('dist/wasms');
  return new CodeParser({
    wasmDir,
    maxCacheEntries: 500,
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  });
}
```

---

## Output Schema (`ParsedFile`)

```typescript
interface ParsedFile {
  schemaVersion: string;         // '1.0.0'
  parsedAt: string;              // ISO-8601 timestamp

  file: {
    fileName: string;
    fileExtension: string;
    absolutePath: string;
    relativePath: string;
    language: string;
    fileSizeBytes: number;
  };

  syntaxErrors: Array<{
    message: string;
    range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
    context?: string;
  }>;

  imports: Array<{
    rawSpecifier: string;
    resolvedPath: string | null;   // Absolute local path if resolved, null if external package
    isExternal: boolean;           // True for npm, pip, crates, standard library
    symbols: Array<{ name: string; alias?: string; isDefault: boolean }>;
    isNamespace: boolean;          // e.g. `import * as X`
    isSideEffect: boolean;         // e.g. `import './style.css'`
    range: SourceRange;
    raw: string;
  }>;

  exports: Array<{
    name: string;
    alias?: string;
    kind: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'unknown';
    isDefault: boolean;
    range: SourceRange;
  }>;

  functions: Array<{
    name: string;
    parentClass?: string;
    parameters: Array<{ name: string; type?: string; defaultValue?: string; isRest?: boolean; isOptional?: boolean }>;
    returnType?: string;
    body: string;
    range: SourceRange;
    calls: Array<{ callee: string; object?: string; range: SourceRange; isLocal: boolean }>;
    objectsAccessed: string[];
    isAsync: boolean;
    isStatic: boolean;
    visibility?: 'public' | 'private' | 'protected' | string;
    decorators: string[];
    nestedFunctions: FunctionInfo[];
    docComment?: string;
  }>;

  classes: Array<{
    name: string;
    kind: 'class' | 'interface' | 'struct' | 'enum' | 'trait' | 'abstract_class';
    superClasses: string[];
    interfaces: string[];
    methods: FunctionInfo[];
    properties: Array<{ name: string; type?: string; isStatic: boolean; visibility?: string; range: SourceRange }>;
    constructors: FunctionInfo[];
    decorators: string[];
    range: SourceRange;
    docComment?: string;
    visibility?: string;
    nestedClasses: ClassInfo[];
  }>;

  variables: Array<{
    name: string;
    kind: 'variable' | 'constant' | string;
    type?: string;
    initialValue?: string;
    isExported: boolean;
    range: SourceRange;
    docComment?: string;
  }>;

  comments: Array<{
    text: string;
    kind: 'line' | 'block' | 'doc';
    range: SourceRange;
  }>;

  functionRelationships: Array<{
    caller: string;               // e.g. 'DataPipeline.compute' or 'runService'
    callee: string;               // e.g. '_validate' or 'calculate_metric'
    calleeObject?: string;        // e.g. 'this' or 'pipeline'
    callLocation: SourceRange;
    isLocalCall: boolean;         // True if the callee is defined in this file
  }>;
}
```

---

## Function Relationship Extraction

Functions, methods, and closures extract all invocations inside their bodies.
The parser automatically calculates `functionRelationships`:
- **Caller**: Fully-qualified caller identifier (e.g., `ServiceWorker#processData` or top-level `runService`).
- **Callee**: Name of called function/method (e.g., `filterData`).
- **Callee Object**: Target instance or receiver (e.g. `this`, `s`, `console`).
- **Location**: Exact line and column coordinates of the call expression.
- **`isLocalCall`**: Boolean indicating whether the callee matches a function or method defined within the same file.

---

## Import Resolution

The `importResolver` utility distinguishes between:
1. **Local imports**: Relative paths (`./...`, `../...`), index files (`index.ts`, `mod.rs`, `__init__.py`, `index.php`), and common language conventions.
2. **External packages**: Unresolved third-party packages (`axios`, `numpy`, `fmt`, `std::collections`) are flagged with `isExternal: true` and `resolvedPath: null`, preserving the raw specifier.

---

## Performance & Caching

- **Fast AST Queries**: Optimized iterative depth-first traversal prevents stack overflows on deeply nested ASTs.
- **Grammar WASM Caching**: Language WASM binaries are loaded once and reused across all subsequent files.
- **LRU File Cache**: `parseFile` caches parsed AST results keyed by file path, checking modification timestamp (`mtimeMs`) and file size to avoid redundant work.
- **Invalidation**: Call `parser.invalidateFile(path)` or `parser.clearCache()`.

---

## Testing

```bash
npm run build
npm test
```
