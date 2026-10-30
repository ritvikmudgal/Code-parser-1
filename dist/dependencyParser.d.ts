/**
 * @module dependencyParser
 * Scans directories, extracts local imports, and generates graph JSON.
 */
import type { DependencyGraph, DependencyScannerOptions } from './types';
/**
 * Extracts raw import specifiers from file contents using fast regex.
 * Supports JavaScript, TypeScript, and Python import statements.
 */
export declare function extractImportSpecifiers(source: string): string[];
/**
 * Builds a clean Cytoscape/G6 compatible dependency graph.
 */
export declare function buildDependencyGraph(projectRoot: string, options?: DependencyScannerOptions): Promise<DependencyGraph>;
//# sourceMappingURL=dependencyParser.d.ts.map