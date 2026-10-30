"use strict";
/**
 * @module extractors/php
 * Language extractor for PHP (.php).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.phpExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const phpResolveOptions = {
    sourceExtensions: ['php'],
    indexFiles: ['index.php'],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect all declared function/method names
    const localFunctionNames = new Set();
    const fnNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['function_definition', 'method_declaration']));
    for (const fn of fnNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(fn, 'name');
        if (nameNode)
            localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
    }
    const imports = extractUseStatements(root, filePath, projectRoot);
    const classes = extractClasses(root, sourceCode, localFunctionNames);
    const functions = extractTopLevelFunctions(root, sourceCode, localFunctionNames);
    const variables = extractVariables(root);
    const exports = extractExports(functions, classes, variables);
    const comments = (0, astHelpers_1.collectComments)(root);
    const syntaxErrors = (0, astHelpers_1.collectSyntaxErrors)(root, sourceCode);
    return {
        imports,
        exports,
        functions,
        classes,
        variables,
        comments,
        syntaxErrors,
    };
}
// ─── Imports (namespace_use_declaration & require/include) ────────────────────
function extractUseStatements(root, filePath, projectRoot) {
    const results = [];
    const useNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['namespace_use_declaration']));
    for (const node of useNodes) {
        const raw = (0, astHelpers_1.nodeText)(node);
        const clauses = (0, astHelpers_1.findAllDescendants)(node, new Set(['namespace_use_clause']));
        for (const clause of clauses) {
            const nameNode = clause.child(0);
            if (!nameNode)
                continue;
            const rawSpec = (0, astHelpers_1.nodeText)(nameNode).replace(/^\\/, '');
            const aliasNode = (0, astHelpers_1.namedChild)(clause, 'alias');
            const alias = aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined;
            const parts = rawSpec.split('\\');
            const baseName = parts[parts.length - 1];
            const symbols = [{
                    name: baseName,
                    alias,
                    isDefault: true,
                }];
            // PSR-4 style resolution candidate
            const relPath = rawSpec.replace(/\\/g, '/');
            const resolved = (0, importResolver_1.resolveImportPath)(`./${relPath}`, filePath, projectRoot, phpResolveOptions);
            results.push({
                rawSpecifier: rawSpec,
                resolvedPath: resolved.resolvedPath,
                isExternal: !resolved.resolvedPath,
                symbols,
                isNamespace: false,
                isSideEffect: false,
                range: (0, astHelpers_1.nodeRange)(clause),
                raw,
            });
        }
    }
    return results;
}
// ─── Classes, Interfaces, Traits, Enums ───────────────────────────────────────
function extractClasses(root, sourceCode, localNames) {
    const results = [];
    const classTypes = new Set([
        'class_declaration',
        'interface_declaration',
        'trait_declaration',
        'enum_declaration',
    ]);
    const classNodes = (0, astHelpers_1.findAllDescendants)(root, classTypes);
    for (const node of classNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
        if (!nameNode)
            continue;
        const name = (0, astHelpers_1.nodeText)(nameNode);
        let kind = 'class';
        if (node.type === 'interface_declaration')
            kind = 'interface';
        else if (node.type === 'trait_declaration')
            kind = 'trait';
        else if (node.type === 'enum_declaration')
            kind = 'enum';
        const superClasses = [];
        const interfaces = [];
        const baseClause = node.children.find((c) => c.type === 'base_clause');
        if (baseClause) {
            const baseName = (0, astHelpers_1.namedChild)(baseClause, 'name') ?? baseClause.namedChild(0);
            if (baseName)
                superClasses.push((0, astHelpers_1.nodeText)(baseName));
        }
        const ifaceClause = node.children.find((c) => c.type === 'class_interface_clause');
        if (ifaceClause) {
            for (let i = 0; i < ifaceClause.namedChildCount; i++) {
                interfaces.push((0, astHelpers_1.nodeText)(ifaceClause.namedChild(i)));
            }
        }
        const properties = [];
        const methods = [];
        const constructors = [];
        const bodyNode = (0, astHelpers_1.namedChild)(node, 'body') ?? node.children.find((c) => c.type === 'declaration_list');
        if (bodyNode) {
            for (let j = 0; j < bodyNode.namedChildCount; j++) {
                const item = bodyNode.namedChild(j);
                if (item.type === 'method_declaration') {
                    const method = parseMethod(item, name, sourceCode, localNames);
                    if (method) {
                        if (method.name === '__construct') {
                            constructors.push(method);
                        }
                        else {
                            methods.push(method);
                        }
                    }
                }
                else if (item.type === 'property_declaration') {
                    const pType = (0, astHelpers_1.namedChild)(item, 'type');
                    const pElem = (0, astHelpers_1.findAllDescendants)(item, new Set(['property_element']))[0];
                    if (pElem) {
                        const pName = (0, astHelpers_1.namedChild)(pElem, 'name') ?? pElem.child(0);
                        if (pName) {
                            const mods = getModifiers(item);
                            properties.push({
                                name: (0, astHelpers_1.nodeText)(pName),
                                type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                                isStatic: mods.includes('static'),
                                visibility: mods.includes('public') ? 'public' : mods.includes('protected') ? 'protected' : 'private',
                                range: (0, astHelpers_1.nodeRange)(item),
                            });
                        }
                    }
                }
            }
        }
        results.push({
            name,
            kind,
            superClasses,
            interfaces,
            methods,
            properties,
            constructors,
            decorators: (0, astHelpers_1.collectDecorators)(node),
            range: (0, astHelpers_1.nodeRange)(node),
            visibility: 'public',
            docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
            nestedClasses: [],
        });
    }
    return results;
}
// ─── Methods ──────────────────────────────────────────────────────────────────
function parseMethod(node, parentClass, sourceCode, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    if (!nameNode)
        return null;
    const name = (0, astHelpers_1.nodeText)(nameNode);
    const modifiers = getModifiers(node);
    const isStatic = modifiers.includes('static');
    const visibility = modifiers.includes('public')
        ? 'public'
        : modifiers.includes('protected')
            ? 'protected'
            : 'private';
    const typeNode = (0, astHelpers_1.namedChild)(node, 'return_type');
    const returnType = typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined;
    const parameters = [];
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    if (paramsNode) {
        for (let i = 0; i < paramsNode.namedChildCount; i++) {
            const p = paramsNode.namedChild(i);
            if (p.type === 'simple_parameter' || p.type === 'variadic_parameter' || p.type === 'property_promotion_parameter') {
                const pName = (0, astHelpers_1.namedChild)(p, 'name');
                const pType = (0, astHelpers_1.namedChild)(p, 'type');
                parameters.push({
                    name: pName ? (0, astHelpers_1.nodeText)(pName) : `param${i}`,
                    type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                    isRest: p.type === 'variadic_parameter',
                });
            }
        }
    }
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const body = bodyNode ? (0, astHelpers_1.nodeText)(bodyNode) : '';
    const calls = bodyNode ? (0, astHelpers_1.extractCallsFromBody)(bodyNode, localNames) : [];
    const objectsAccessed = bodyNode ? (0, astHelpers_1.extractObjectsAccessed)(bodyNode) : [];
    return {
        name,
        parentClass,
        parameters,
        returnType,
        body,
        range: (0, astHelpers_1.nodeRange)(node),
        calls,
        objectsAccessed,
        isAsync: false,
        isStatic,
        visibility,
        decorators: (0, astHelpers_1.collectDecorators)(node),
        nestedFunctions: [],
        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
    };
}
// ─── Top-Level Functions ──────────────────────────────────────────────────────
function extractTopLevelFunctions(root, sourceCode, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_definition') {
            const fn = parseMethod(node, '', sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
    }
    return results;
}
// ─── Variables & Constants ────────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    const constNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['const_declaration']));
    for (const node of constNodes) {
        const elements = (0, astHelpers_1.findAllDescendants)(node, new Set(['const_element']));
        for (const elem of elements) {
            const nameNode = (0, astHelpers_1.namedChild)(elem, 'name');
            const valNode = (0, astHelpers_1.namedChild)(elem, 'value');
            if (nameNode) {
                results.push({
                    name: (0, astHelpers_1.nodeText)(nameNode),
                    kind: 'constant',
                    initialValue: valNode ? (0, astHelpers_1.nodeText)(valNode) : undefined,
                    isExported: true,
                    range: (0, astHelpers_1.nodeRange)(elem),
                    docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                });
            }
        }
    }
    return results;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getModifiers(node) {
    const mods = [];
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'visibility_modifier' || child.type === 'static_modifier' || child.type === 'final_modifier' || child.type === 'abstract_modifier') {
            mods.push((0, astHelpers_1.nodeText)(child));
        }
    }
    return mods;
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(functions, classes, variables) {
    const exports = [];
    for (const cls of classes) {
        exports.push({
            name: cls.name,
            kind: 'class',
            isDefault: false,
            range: cls.range,
        });
    }
    for (const fn of functions) {
        exports.push({
            name: fn.name,
            kind: 'function',
            isDefault: false,
            range: fn.range,
        });
    }
    for (const v of variables) {
        exports.push({
            name: v.name,
            kind: 'variable',
            isDefault: false,
            range: v.range,
        });
    }
    return exports;
}
exports.phpExtractor = {
    languageId: 'php',
    extensions: ['php', 'phtml'],
    wasmFile: 'tree-sitter-php.wasm',
    sourceExtensions: phpResolveOptions.sourceExtensions,
    indexFiles: phpResolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=php.js.map