"use strict";
/**
 * @module languageRegistry
 * Central registry that maps file extensions to language extractors.
 * New languages can be added at runtime via `register()`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registry = void 0;
class LanguageRegistry {
    constructor() {
        this.byExtension = new Map();
        this.byId = new Map();
    }
    /** Register an extractor. Overwrites any previous registration for the same extensions. */
    register(extractor) {
        this.byId.set(extractor.languageId, extractor);
        for (const ext of extractor.extensions) {
            this.byExtension.set(ext.toLowerCase(), extractor);
        }
    }
    /** Look up an extractor by file extension (without leading dot). */
    getByExtension(ext) {
        return this.byExtension.get(ext.toLowerCase());
    }
    /** Look up an extractor by its language ID. */
    getById(id) {
        return this.byId.get(id);
    }
    /** Return all registered language IDs. */
    listLanguages() {
        return [...this.byId.keys()];
    }
    /** Return all registered file extensions. */
    listExtensions() {
        return [...this.byExtension.keys()];
    }
    /** Check whether a given file extension is supported. */
    isSupported(ext) {
        return this.byExtension.has(ext.toLowerCase());
    }
}
/** Singleton registry used throughout the parser. */
exports.registry = new LanguageRegistry();
//# sourceMappingURL=languageRegistry.js.map