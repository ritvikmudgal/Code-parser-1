"use strict";
/**
 * @module astHelpers
 * Shared utilities for walking Tree-sitter ASTs and extracting common patterns.
 * Used by all language extractors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeRange = nodeRange;
exports.nodeText = nodeText;
exports.namedChild = namedChild;
exports.findAllDescendants = findAllDescendants;
exports.childrenOfType = childrenOfType;
exports.collectSyntaxErrors = collectSyntaxErrors;
exports.collectComments = collectComments;
exports.extractCallsFromBody = extractCallsFromBody;
exports.extractObjectsAccessed = extractObjectsAccessed;
exports.getPrecedingDocComment = getPrecedingDocComment;
exports.collectDecorators = collectDecorators;
/** Convert a Tree-sitter SyntaxNode position to our SourceRange (1-indexed lines). */
function nodeRange(node) {
    return {
        startLine: node.startPosition.row + 1,
        startColumn: node.startPosition.column,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column,
    };
}
/** Get the full source text of a node. */
function nodeText(node) {
    return node.text;
}
/** Safely get a named child, returning undefined if absent. */
function namedChild(node, fieldName) {
    return node.childForFieldName(fieldName);
}
/**
 * Collect all descendant nodes matching one or more type strings.
 * Uses a fast iterative DFS.
 */
function findAllDescendants(root, types) {
    const result = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (types.has(node.type)) {
            result.push(node);
        }
        for (let i = node.childCount - 1; i >= 0; i--) {
            stack.push(node.child(i));
        }
    }
    return result;
}
/**
 * Collect immediate children matching a type.
 */
function childrenOfType(node, type) {
    const result = [];
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === type) {
            result.push(child);
        }
    }
    return result;
}
/**
 * Collect syntax errors from the tree.
 */
function collectSyntaxErrors(root, sourceCode) {
    const errors = [];
    const stack = [root];
    while (stack.length > 0) {
        const node = stack.pop();
        if (node.type === 'ERROR' || node.isMissing) {
            const range = nodeRange(node);
            const lines = sourceCode.split('\n');
            const contextLine = lines[range.startLine - 1] || '';
            errors.push({
                message: node.isMissing
                    ? `Missing expected syntax: ${node.type}`
                    : `Syntax error at line ${range.startLine}`,
                range,
                context: contextLine.trim(),
            });
        }
        for (let i = node.childCount - 1; i >= 0; i--) {
            stack.push(node.child(i));
        }
    }
    return errors;
}
/**
 * Extract comments from the tree.
 * Handles line comments (//) and block comments (/* ... * /) for C-family,
 * and # comments for Python/Ruby.
 */
function collectComments(root) {
    const commentTypes = new Set(['comment', 'line_comment', 'block_comment', 'doc_comment']);
    const nodes = findAllDescendants(root, commentTypes);
    return nodes.map((node) => {
        const text = nodeText(node);
        let kind = 'line';
        if (node.type === 'doc_comment' ||
            text.startsWith('/**') ||
            text.startsWith('///') ||
            text.startsWith('//!') ||
            text.startsWith('"""') ||
            text.startsWith("'''")) {
            kind = 'doc';
        }
        else if (node.type === 'block_comment' ||
            text.startsWith('/*')) {
            kind = 'block';
        }
        return { text, kind, range: nodeRange(node) };
    });
}
/**
 * Extract function calls from within a function body.
 * This is a best-effort static analysis — it doesn't resolve dynamic calls.
 */
function extractCallsFromBody(bodyNode, localFunctionNames) {
    const callTypes = new Set(['call_expression', 'new_expression']);
    const calls = [];
    const seen = new Set();
    const callNodes = findAllDescendants(bodyNode, callTypes);
    for (const callNode of callNodes) {
        const functionNode = callNode.childForFieldName('function') ??
            callNode.childForFieldName('constructor') ??
            callNode.child(0);
        if (!functionNode)
            continue;
        let callee = '';
        let object;
        if (functionNode.type === 'member_expression' || functionNode.type === 'field_expression') {
            const objNode = functionNode.childForFieldName('object');
            const propNode = functionNode.childForFieldName('property') ?? functionNode.childForFieldName('field');
            object = objNode ? nodeText(objNode) : undefined;
            callee = propNode ? nodeText(propNode) : nodeText(functionNode);
        }
        else if (functionNode.type === 'scoped_identifier' || functionNode.type === 'qualified_name') {
            callee = nodeText(functionNode);
        }
        else {
            callee = nodeText(functionNode);
        }
        // Deduplicate by callee+range
        const key = `${callee}:${callNode.startPosition.row}:${callNode.startPosition.column}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const isLocal = localFunctionNames.has(callee);
        calls.push({
            callee,
            object,
            range: nodeRange(callNode),
            isLocal,
        });
    }
    return calls;
}
/**
 * Extract object/class names accessed in member expressions within a body.
 */
function extractObjectsAccessed(bodyNode) {
    const memberTypes = new Set(['member_expression', 'field_expression']);
    const nodes = findAllDescendants(bodyNode, memberTypes);
    const objects = new Set();
    for (const node of nodes) {
        const objNode = node.childForFieldName('object');
        if (objNode) {
            const text = nodeText(objNode);
            // Only keep simple identifiers, not deep chains
            if (objNode.type === 'identifier' || objNode.type === 'this') {
                objects.add(text);
            }
        }
    }
    return [...objects];
}
/**
 * Get the doc comment immediately preceding a node (if any).
 */
function getPrecedingDocComment(node) {
    let prev = node.previousNamedSibling;
    while (prev) {
        if (prev.type === 'comment' || prev.type === 'doc_comment' || prev.type === 'line_comment' || prev.type === 'block_comment') {
            const text = nodeText(prev);
            if (text.startsWith('/**') || text.startsWith('///') || text.startsWith('//!') ||
                text.startsWith('"""') || text.startsWith("'''") || text.startsWith('#')) {
                return text;
            }
            // Also return regular comments immediately above
            if (prev.endPosition.row === node.startPosition.row - 1 ||
                prev.endPosition.row === node.startPosition.row) {
                return text;
            }
        }
        break;
    }
    return undefined;
}
/**
 * Collect the names of all decorators / annotations on a node.
 */
function collectDecorators(node) {
    const decorators = [];
    let sibling = node.previousNamedSibling;
    while (sibling && (sibling.type === 'decorator' || sibling.type === 'annotation' || sibling.type === 'attribute')) {
        decorators.push(nodeText(sibling));
        sibling = sibling.previousNamedSibling;
    }
    // Also check children
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'decorator' || child.type === 'decorator_list' || child.type === 'annotation' || child.type === 'attribute') {
            if (child.type === 'decorator_list') {
                for (let j = 0; j < child.childCount; j++) {
                    decorators.push(nodeText(child.child(j)));
                }
            }
            else {
                decorators.push(nodeText(child));
            }
        }
    }
    return decorators;
}
//# sourceMappingURL=astHelpers.js.map