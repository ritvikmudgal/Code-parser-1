/**
 * @module parser
 * Production-ready multi-language code parser using Tree-sitter.
 * Provides caching, robust error handling, normalized JSON schemas,
 * and seamless integration into VS Code extensions.
 */
import type { ParsedFile, LanguageExtractor } from './types';
export interface CodeParserOptions {
    /**
     * Custom directory containing tree-sitter WASM files.
     * If omitted, searches standard node_modules/tree-sitter-wasms/out locations.
     */
    wasmDir?: string;
    /**
     * Custom function to resolve a WASM filename to an absolute file path.
     * Useful when bundled inside a VS Code extension.
     */
    wasmResolver?: (wasmFile: string) => string;
    /** Maximum number of parsed files to retain in memory cache (default: 200). */
    maxCacheEntries?: number;
    /** Maximum file size in bytes to parse (default: 4MB). */
    maxFileSizeBytes?: number;
    /** Whether parsing cache is enabled by default (default: true). */
    enableCache?: boolean;
}
export interface ParseOptions {
    /** Bypass and refresh cache for this call. */
    bypassCache?: boolean;
    /** Override the language ID instead of inferring from file extension. */
    languageOverride?: string;
}
export declare class CodeParser {
    private isInitialized;
    private initPromise;
    private languageCache;
    private fileCache;
    private readonly options;
    constructor(options?: CodeParserOptions);
    /**
     * Initialize web-tree-sitter. Safe to call multiple times.
     */
    init(): Promise<void>;
    /**
     * Parse a file from disk with caching and error recovery.
     *
     * @param filePath - Absolute or relative path to the file.
     * @param projectRoot - Absolute path to the workspace/project root.
     * @param parseOptions - Optional parsing overrides.
     */
    parseFile(filePath: string, projectRoot: string, parseOptions?: ParseOptions): Promise<ParsedFile>;
    /**
     * Parse in-memory source code (e.g. from an active VS Code text buffer).
     *
     * @param sourceCode - String content of the file.
     * @param filePath - File path used for extension detection and import resolution.
     * @param projectRoot - Workspace root path.
     * @param parseOptions - Optional parsing overrides.
     * @param knownFileSize - Optional size in bytes.
     */
    parseSource(sourceCode: string, filePath: string, projectRoot: string, parseOptions?: ParseOptions, knownFileSize?: number): Promise<ParsedFile>;
    /**
     * Determine whether a given file path or extension is supported by the parser.
     */
    isSupported(filePathOrExt: string): boolean;
    /** Get list of all supported language IDs. */
    getSupportedLanguages(): string[];
    /** Get list of all supported file extensions. */
    getSupportedExtensions(): string[];
    /** Look up an extractor for an extension or language ID. */
    getExtractor(extOrId: string): LanguageExtractor | undefined;
    /** Invalidate the cache for a specific file. */
    invalidateFile(filePath: string): void;
    /** Clear all cached parse results. */
    clearCache(): void;
    private loadLanguage;
    private resolveWasmPath;
    private detectWasmDir;
    private addToCache;
    /**
     * Aggregate function calls across top-level functions and class methods
     * into caller -> callee relationship mappings.
     */
    private extractFunctionRelationships;
}
/** Global default parser instance for convenience. */
export declare const defaultParser: CodeParser;
//# sourceMappingURL=parser.d.ts.map