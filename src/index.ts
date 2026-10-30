/**
 * @module code-parser
 * Lightweight static file dependency parser for VS Code extensions.
 */

export * from './types';
export { resolveLocalImport, isLocalSpecifier } from './importResolver';
export { buildDependencyGraph, extractImportSpecifiers } from './dependencyParser';
