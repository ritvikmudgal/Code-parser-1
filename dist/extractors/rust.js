"use strict";
/**
 * @module extractors/rust
 * Language extractor for Rust (.rs).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rustExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const resolveOptions = {
    sourceExtensions: ['rs'],
    indexFiles: ['mod.rs'],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect all local function names
    const localFunctionNames = new Set();
    const fnNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['function_item']));
    for (const fn of fnNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(fn, 'name');
        if (nameNode)
            localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
    }
    const imports = extractImports(root, filePath, projectRoot);
    const classes = extractStructsAndEnums(root, sourceCode, localFunctionNames);
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
// ─── Imports (use_declaration) ────────────────────────────────────────────────
function extractImports(root, filePath, projectRoot) {
    const results = [];
    const useNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['use_declaration']));
    for (const node of useNodes) {
        const raw = (0, astHelpers_1.nodeText)(node);
        const argument = (0, astHelpers_1.namedChild)(node, 'argument');
        if (!argument)
            continue;
        const rawSpec = (0, astHelpers_1.nodeText)(argument);
        const isCrateOrSuper = rawSpec.startsWith('crate::') || rawSpec.startsWith('super::') || rawSpec.startsWith('self::');
        const symbols = [];
        let isNamespace = false;
        // Check for use_wildcard
        if (rawSpec.endsWith('::*')) {
            isNamespace = true;
        }
        else if (argument.type === 'use_list') {
            for (let i = 0; i < argument.namedChildCount; i++) {
                const item = argument.namedChild(i);
                symbols.push({ name: (0, astHelpers_1.nodeText)(item), isDefault: false });
            }
        }
        else {
            const parts = rawSpec.split('::');
            const lastName = parts[parts.length - 1];
            symbols.push({ name: lastName, isDefault: false });
        }
        // Try resolving if relative / crate
        let resolvedPath = null;
        if (isCrateOrSuper) {
            const rel = rawSpec
                .replace(/^crate::/, '')
                .replace(/^super::/, '../')
                .replace(/^self::/, './')
                .replace(/::/g, '/');
            const resolved = (0, importResolver_1.resolveImportPath)(rel.startsWith('.') ? rel : `./${rel}`, filePath, projectRoot, resolveOptions);
            resolvedPath = resolved.resolvedPath;
        }
        results.push({
            rawSpecifier: rawSpec,
            resolvedPath,
            isExternal: !isCrateOrSuper && !resolvedPath,
            symbols,
            isNamespace,
            isSideEffect: false,
            range: (0, astHelpers_1.nodeRange)(node),
            raw,
        });
    }
    return results;
}
// ─── Functions ────────────────────────────────────────────────────────────────
function extractTopLevelFunctions(root, sourceCode, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_item') {
            const fn = parseFunctionItem(node, undefined, sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
    }
    return results;
}
function parseFunctionItem(node, parentClass, sourceCode, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    if (!nameNode)
        return null;
    const name = (0, astHelpers_1.nodeText)(nameNode);
    let visibility;
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'visibility_modifier') {
            visibility = (0, astHelpers_1.nodeText)(child);
            break;
        }
    }
    let isAsync = false;
    for (let i = 0; i < node.childCount; i++) {
        if (node.child(i).type === 'async') {
            isAsync = true;
            break;
        }
    }
    const parameters = [];
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    let hasSelf = false;
    if (paramsNode) {
        for (let i = 0; i < paramsNode.namedChildCount; i++) {
            const param = paramsNode.namedChild(i);
            if (param.type === 'self_parameter') {
                hasSelf = true;
            }
            else if (param.type === 'parameter') {
                const pPattern = (0, astHelpers_1.namedChild)(param, 'pattern');
                const pType = (0, astHelpers_1.namedChild)(param, 'type');
                parameters.push({
                    name: pPattern ? (0, astHelpers_1.nodeText)(pPattern) : `param${i}`,
                    type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                });
            }
        }
    }
    const returnTypeNode = (0, astHelpers_1.namedChild)(node, 'return_type');
    const returnType = returnTypeNode ? (0, astHelpers_1.nodeText)(returnTypeNode).replace(/^->\s*/, '') : undefined;
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
        isAsync,
        isStatic: !hasSelf,
        visibility: visibility || 'private',
        decorators: (0, astHelpers_1.collectDecorators)(node),
        nestedFunctions: [],
        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
    };
}
// ─── Structs, Enums, Traits and Impl blocks ───────────────────────────────────
function extractStructsAndEnums(root, sourceCode, localNames) {
    const classMap = new Map();
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'struct_item' || node.type === 'enum_item' || node.type === 'union_item' || node.type === 'trait_item') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            if (!nameNode)
                continue;
            const name = (0, astHelpers_1.nodeText)(nameNode);
            let kind = 'struct';
            if (node.type === 'enum_item')
                kind = 'enum';
            else if (node.type === 'trait_item')
                kind = 'trait';
            let visibility;
            for (let j = 0; j < node.childCount; j++) {
                if (node.child(j).type === 'visibility_modifier') {
                    visibility = (0, astHelpers_1.nodeText)(node.child(j));
                    break;
                }
            }
            const properties = [];
            const fieldList = (0, astHelpers_1.namedChild)(node, 'body') || (0, astHelpers_1.namedChild)(node, 'field_declaration_list');
            if (fieldList) {
                for (let j = 0; j < fieldList.namedChildCount; j++) {
                    const field = fieldList.namedChild(j);
                    if (field.type === 'field_declaration') {
                        const fName = (0, astHelpers_1.namedChild)(field, 'name');
                        const fType = (0, astHelpers_1.namedChild)(field, 'type');
                        if (fName) {
                            properties.push({
                                name: (0, astHelpers_1.nodeText)(fName),
                                type: fType ? (0, astHelpers_1.nodeText)(fType) : undefined,
                                isStatic: false,
                                range: (0, astHelpers_1.nodeRange)(field),
                            });
                        }
                    }
                }
            }
            classMap.set(name, {
                name,
                kind,
                superClasses: [],
                interfaces: [],
                methods: [],
                properties,
                constructors: [],
                decorators: (0, astHelpers_1.collectDecorators)(node),
                range: (0, astHelpers_1.nodeRange)(node),
                visibility: visibility || 'private',
                docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                nestedClasses: [],
            });
        }
    }
    // Next, attach methods from impl_item
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'impl_item') {
            const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
            if (!typeNode)
                continue;
            const typeName = (0, astHelpers_1.nodeText)(typeNode);
            const traitNode = (0, astHelpers_1.namedChild)(node, 'trait');
            const traitName = traitNode ? (0, astHelpers_1.nodeText)(traitNode) : undefined;
            let cls = classMap.get(typeName);
            if (!cls) {
                cls = {
                    name: typeName,
                    kind: 'struct',
                    superClasses: [],
                    interfaces: [],
                    methods: [],
                    properties: [],
                    constructors: [],
                    decorators: [],
                    range: (0, astHelpers_1.nodeRange)(node),
                    visibility: 'public',
                    nestedClasses: [],
                };
                classMap.set(typeName, cls);
            }
            if (traitName && !cls.interfaces.includes(traitName)) {
                cls.interfaces.push(traitName);
            }
            const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
            if (bodyNode) {
                for (let j = 0; j < bodyNode.namedChildCount; j++) {
                    const item = bodyNode.namedChild(j);
                    if (item.type === 'function_item') {
                        const method = parseFunctionItem(item, typeName, sourceCode, localNames);
                        if (method) {
                            if (method.name === 'new') {
                                cls.constructors.push(method);
                            }
                            else {
                                cls.methods.push(method);
                            }
                        }
                    }
                }
            }
        }
    }
    return [...classMap.values()];
}
// ─── Variables and Constants ──────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'const_item' || node.type === 'static_item') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
            const valNode = (0, astHelpers_1.namedChild)(node, 'value');
            let isPub = false;
            for (let j = 0; j < node.childCount; j++) {
                if (node.child(j).type === 'visibility_modifier') {
                    isPub = true;
                    break;
                }
            }
            if (nameNode) {
                results.push({
                    name: (0, astHelpers_1.nodeText)(nameNode),
                    kind: node.type === 'const_item' ? 'constant' : 'variable',
                    type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                    initialValue: valNode ? (0, astHelpers_1.nodeText)(valNode) : undefined,
                    isExported: isPub,
                    range: (0, astHelpers_1.nodeRange)(node),
                    docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                });
            }
        }
    }
    return results;
}
// ─── Exports (pub items) ──────────────────────────────────────────────────────
function extractExports(functions, classes, variables) {
    const exports = [];
    for (const fn of functions) {
        if (fn.visibility?.startsWith('pub')) {
            exports.push({
                name: fn.name,
                kind: 'function',
                isDefault: false,
                range: fn.range,
            });
        }
    }
    for (const cls of classes) {
        if (cls.visibility?.startsWith('pub')) {
            exports.push({
                name: cls.name,
                kind: cls.kind === 'trait' ? 'interface' : 'class',
                isDefault: false,
                range: cls.range,
            });
        }
    }
    for (const v of variables) {
        if (v.isExported) {
            exports.push({
                name: v.name,
                kind: 'variable',
                isDefault: false,
                range: v.range,
            });
        }
    }
    return exports;
}
exports.rustExtractor = {
    languageId: 'rust',
    extensions: ['rs'],
    wasmFile: 'tree-sitter-rust.wasm',
    sourceExtensions: resolveOptions.sourceExtensions,
    indexFiles: resolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=rust.js.map