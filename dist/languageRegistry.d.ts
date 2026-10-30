/**
 * @module languageRegistry
 * Central registry that maps file extensions to language extractors.
 * New languages can be added at runtime via `register()`.
 */
import type { LanguageExtractor } from './types';
declare class LanguageRegistry {
    private byExtension;
    private byId;
    /** Register an extractor. Overwrites any previous registration for the same extensions. */
    register(extractor: LanguageExtractor): void;
    /** Look up an extractor by file extension (without leading dot). */
    getByExtension(ext: string): LanguageExtractor | undefined;
    /** Look up an extractor by its language ID. */
    getById(id: string): LanguageExtractor | undefined;
    /** Return all registered language IDs. */
    listLanguages(): string[];
    /** Return all registered file extensions. */
    listExtensions(): string[];
    /** Check whether a given file extension is supported. */
    isSupported(ext: string): boolean;
}
/** Singleton registry used throughout the parser. */
export declare const registry: LanguageRegistry;
export {};
//# sourceMappingURL=languageRegistry.d.ts.map