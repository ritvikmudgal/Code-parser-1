/**
 * @module astHelpers
 * Shared utilities for walking Tree-sitter ASTs and extracting common patterns.
 * Used by all language extractors.
 */
import type Parser from 'web-tree-sitter';
import type { SourceRange, SyntaxError, CommentInfo, FunctionCallInfo } from './types';
/** Convert a Tree-sitter SyntaxNode position to our SourceRange (1-indexed lines). */
export declare function nodeRange(node: Parser.SyntaxNode): SourceRange;
/** Get the full source text of a node. */
export declare function nodeText(node: Parser.SyntaxNode): string;
/** Safely get a named child, returning undefined if absent. */
export declare function namedChild(node: Parser.SyntaxNode, fieldName: string): Parser.SyntaxNode | null;
/**
 * Collect all descendant nodes matching one or more type strings.
 * Uses a fast iterative DFS.
 */
export declare function findAllDescendants(root: Parser.SyntaxNode, types: Set<string>): Parser.SyntaxNode[];
/**
 * Collect immediate children matching a type.
 */
export declare function childrenOfType(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode[];
/**
 * Collect syntax errors from the tree.
 */
export declare function collectSyntaxErrors(root: Parser.SyntaxNode, sourceCode: string): SyntaxError[];
/**
 * Extract comments from the tree.
 * Handles line comments (//) and block comments (/* ... * /) for C-family,
 * and # comments for Python/Ruby.
 */
export declare function collectComments(root: Parser.SyntaxNode): CommentInfo[];
/**
 * Extract function calls from within a function body.
 * This is a best-effort static analysis — it doesn't resolve dynamic calls.
 */
export declare function extractCallsFromBody(bodyNode: Parser.SyntaxNode, localFunctionNames: Set<string>): FunctionCallInfo[];
/**
 * Extract object/class names accessed in member expressions within a body.
 */
export declare function extractObjectsAccessed(bodyNode: Parser.SyntaxNode): string[];
/**
 * Get the doc comment immediately preceding a node (if any).
 */
export declare function getPrecedingDocComment(node: Parser.SyntaxNode): string | undefined;
/**
 * Collect the names of all decorators / annotations on a node.
 */
export declare function collectDecorators(node: Parser.SyntaxNode): string[];
//# sourceMappingURL=astHelpers.d.ts.map