"use strict";
/**
 * @module parser
 * Production-ready multi-language code parser using Tree-sitter.
 * Provides caching, robust error handling, normalized JSON schemas,
 * and seamless integration into VS Code extensions.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultParser = exports.CodeParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
const languageRegistry_1 = require("./languageRegistry");
const extractors_1 = require("./extractors");
// Ensure all built-in extractors are registered immediately
(0, extractors_1.registerBuiltinExtractors)();
class CodeParser {
    constructor(options = {}) {
        this.isInitialized = false;
        this.initPromise = null;
        this.languageCache = new Map();
        this.fileCache = new Map();
        this.options = {
            wasmDir: options.wasmDir || this.detectWasmDir(),
            wasmResolver: options.wasmResolver,
            maxCacheEntries: options.maxCacheEntries ?? 200,
            maxFileSizeBytes: options.maxFileSizeBytes ?? 4 * 1024 * 1024, // 4MB
            enableCache: options.enableCache ?? true,
        };
    }
    /**
     * Initialize web-tree-sitter. Safe to call multiple times.
     */
    async init() {
        if (this.isInitialized)
            return;
        if (this.initPromise)
            return this.initPromise;
        this.initPromise = (async () => {
            await web_tree_sitter_1.default.init();
            this.isInitialized = true;
        })();
        return this.initPromise;
    }
    /**
     * Parse a file from disk with caching and error recovery.
     *
     * @param filePath - Absolute or relative path to the file.
     * @param projectRoot - Absolute path to the workspace/project root.
     * @param parseOptions - Optional parsing overrides.
     */
    async parseFile(filePath, projectRoot, parseOptions = {}) {
        await this.init();
        const absPath = path.resolve(projectRoot, filePath);
        const absRoot = path.resolve(projectRoot);
        if (!fs.existsSync(absPath)) {
            throw new Error(`File not found: ${absPath}`);
        }
        const stat = await fs.promises.stat(absPath);
        if (stat.isDirectory()) {
            throw new Error(`Expected a file but received directory: ${absPath}`);
        }
        if (stat.size > this.options.maxFileSizeBytes) {
            throw new Error(`File size (${stat.size} bytes) exceeds limit of ${this.options.maxFileSizeBytes} bytes: ${absPath}`);
        }
        // Cache check
        if (this.options.enableCache && !parseOptions.bypassCache) {
            const cached = this.fileCache.get(absPath);
            if (cached &&
                cached.mtimeMs === stat.mtimeMs &&
                cached.fileSizeBytes === stat.size) {
                return cached.result;
            }
        }
        const sourceCode = await fs.promises.readFile(absPath, 'utf8');
        const result = await this.parseSource(sourceCode, absPath, absRoot, parseOptions, stat.size);
        // Save to cache
        if (this.options.enableCache) {
            this.addToCache(absPath, {
                mtimeMs: stat.mtimeMs,
                fileSizeBytes: stat.size,
                result,
            });
        }
        return result;
    }
    /**
     * Parse in-memory source code (e.g. from an active VS Code text buffer).
     *
     * @param sourceCode - String content of the file.
     * @param filePath - File path used for extension detection and import resolution.
     * @param projectRoot - Workspace root path.
     * @param parseOptions - Optional parsing overrides.
     * @param knownFileSize - Optional size in bytes.
     */
    async parseSource(sourceCode, filePath, projectRoot, parseOptions = {}, knownFileSize) {
        await this.init();
        const absPath = path.resolve(projectRoot, filePath);
        const absRoot = path.resolve(projectRoot);
        const ext = path.extname(absPath).slice(1).toLowerCase();
        const extractor = parseOptions.languageOverride
            ? languageRegistry_1.registry.getById(parseOptions.languageOverride)
            : languageRegistry_1.registry.getByExtension(ext);
        if (!extractor) {
            throw new Error(`Unsupported language for extension '.${ext}' (file: ${path.basename(absPath)}). Supported extensions: ${languageRegistry_1.registry.listExtensions().join(', ')}`);
        }
        // Load language grammar WASM
        const lang = await this.loadLanguage(extractor);
        const parser = new web_tree_sitter_1.default();
        parser.setLanguage(lang);
        let tree;
        try {
            tree = parser.parse(sourceCode);
        }
        catch (err) {
            throw new Error(`Tree-sitter parse failure for ${absPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
        // Extract language-specific data
        let extracted;
        try {
            extracted = extractor.extract(tree, sourceCode, absPath, absRoot);
        }
        catch (err) {
            throw new Error(`Extraction failure for ${absPath} (${extractor.languageId}): ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            tree.delete();
        }
        const relPath = path.relative(absRoot, absPath);
        const fileSizeBytes = knownFileSize ?? Buffer.byteLength(sourceCode, 'utf8');
        const fileMeta = {
            fileName: path.basename(absPath),
            fileExtension: ext,
            absolutePath: absPath,
            relativePath: relPath.startsWith('..') ? absPath : relPath,
            language: extractor.languageId,
            fileSizeBytes,
        };
        // Build comprehensive function relationships
        const functionRelationships = this.extractFunctionRelationships(extracted.functions, extracted.classes);
        const parsedFile = {
            schemaVersion: '1.0.0',
            parsedAt: new Date().toISOString(),
            file: fileMeta,
            syntaxErrors: extracted.syntaxErrors,
            imports: extracted.imports,
            exports: extracted.exports,
            functions: extracted.functions,
            classes: extracted.classes,
            variables: extracted.variables,
            comments: extracted.comments,
            functionRelationships,
        };
        return parsedFile;
    }
    /**
     * Determine whether a given file path or extension is supported by the parser.
     */
    isSupported(filePathOrExt) {
        const ext = filePathOrExt.includes('.')
            ? path.extname(filePathOrExt).slice(1).toLowerCase()
            : filePathOrExt.toLowerCase();
        return languageRegistry_1.registry.isSupported(ext);
    }
    /** Get list of all supported language IDs. */
    getSupportedLanguages() {
        return languageRegistry_1.registry.listLanguages();
    }
    /** Get list of all supported file extensions. */
    getSupportedExtensions() {
        return languageRegistry_1.registry.listExtensions();
    }
    /** Look up an extractor for an extension or language ID. */
    getExtractor(extOrId) {
        return languageRegistry_1.registry.getByExtension(extOrId) ?? languageRegistry_1.registry.getById(extOrId);
    }
    /** Invalidate the cache for a specific file. */
    invalidateFile(filePath) {
        const absPath = path.resolve(filePath);
        this.fileCache.delete(absPath);
    }
    /** Clear all cached parse results. */
    clearCache() {
        this.fileCache.clear();
    }
    // ─── Internal Helpers ───────────────────────────────────────────────────────
    async loadLanguage(extractor) {
        const cached = this.languageCache.get(extractor.languageId);
        if (cached)
            return cached;
        const wasmPath = this.resolveWasmPath(extractor.wasmFile);
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`Tree-sitter WASM file not found: ${wasmPath} for language ${extractor.languageId}`);
        }
        const language = await web_tree_sitter_1.default.Language.load(wasmPath);
        this.languageCache.set(extractor.languageId, language);
        return language;
    }
    resolveWasmPath(wasmFile) {
        if (this.options.wasmResolver) {
            return this.options.wasmResolver(wasmFile);
        }
        return path.join(this.options.wasmDir, wasmFile);
    }
    detectWasmDir() {
        const candidates = [
            path.resolve(__dirname, '../../node_modules/tree-sitter-wasms/out'),
            path.resolve(__dirname, '../node_modules/tree-sitter-wasms/out'),
            path.resolve(process.cwd(), 'node_modules/tree-sitter-wasms/out'),
        ];
        for (const c of candidates) {
            if (fs.existsSync(c)) {
                return c;
            }
        }
        return candidates[0];
    }
    addToCache(absPath, entry) {
        if (this.fileCache.size >= this.options.maxCacheEntries) {
            // Evict oldest entry
            const oldestKey = this.fileCache.keys().next().value;
            if (oldestKey)
                this.fileCache.delete(oldestKey);
        }
        this.fileCache.set(absPath, entry);
    }
    /**
     * Aggregate function calls across top-level functions and class methods
     * into caller -> callee relationship mappings.
     */
    extractFunctionRelationships(functions, classes) {
        const relationships = [];
        const seen = new Set();
        const processFunction = (callerName, fn) => {
            for (const call of fn.calls) {
                const key = `${callerName}->${call.callee}@${call.range.startLine}:${call.range.startColumn}`;
                if (seen.has(key))
                    continue;
                seen.add(key);
                relationships.push({
                    caller: callerName,
                    callee: call.callee,
                    calleeObject: call.object,
                    callLocation: call.range,
                    isLocalCall: call.isLocal,
                });
            }
            for (const nested of fn.nestedFunctions) {
                processFunction(`${callerName}.${nested.name}`, nested);
            }
        };
        // Top-level functions
        for (const fn of functions) {
            processFunction(fn.name, fn);
        }
        // Class methods and constructors
        for (const cls of classes) {
            for (const ctor of cls.constructors) {
                processFunction(`${cls.name}.constructor`, ctor);
            }
            for (const method of cls.methods) {
                const callerName = method.isStatic
                    ? `${cls.name}.${method.name}`
                    : `${cls.name}#${method.name}`;
                processFunction(callerName, method);
            }
            for (const inner of cls.nestedClasses) {
                for (const method of inner.methods) {
                    processFunction(`${cls.name}.${inner.name}#${method.name}`, method);
                }
            }
        }
        return relationships;
    }
}
exports.CodeParser = CodeParser;
/** Global default parser instance for convenience. */
exports.defaultParser = new CodeParser();
//# sourceMappingURL=parser.js.map