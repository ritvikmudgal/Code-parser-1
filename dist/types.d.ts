/**
 * @module types
 * Minimal graph schema compatible with Cytoscape.js and AntV G6.
 */
export interface GraphNode {
    id: string;
}
export interface GraphEdge {
    source: string;
    target: string;
}
export interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}
export interface DependencyScannerOptions {
    /** Additional glob/directory ignore patterns (default includes node_modules, dist, .git, etc.) */
    ignore?: string[];
    /** File extensions to analyze (default: js, jsx, ts, tsx, mjs, cjs) */
    extensions?: string[];
}
//# sourceMappingURL=types.d.ts.map