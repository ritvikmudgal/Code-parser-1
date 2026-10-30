/**
 * @module importResolver
 * Resolves local import specifiers to existing relative file paths.
 */
/**
 * Determine if a specifier is a local relative import or resolves to a local file.
 * Ignores third-party packages like 'react', 'express', 'os', 'json', 'rumps', etc.
 */
export declare function isLocalSpecifier(specifier: string, fromAbsFile?: string, projectRoot?: string): boolean;
/**
 * Resolves a local import specifier to its actual relative path within the project.
 * Checks relative imports and bare imports that exist locally in the project.
 * Returns null if the import cannot be resolved or is external.
 */
export declare function resolveLocalImport(specifier: string, fromAbsFile: string, projectRoot: string, extensions?: string[], indexFiles?: string[]): string | null;
//# sourceMappingURL=importResolver.d.ts.map