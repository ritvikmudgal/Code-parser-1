"use strict";
/**
 * @module extractors/go
 * Language extractor for Go (.go).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.goExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const resolveOptions = {
    sourceExtensions: ['go'],
    indexFiles: [],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect all declared function names for local call matching
    const localFunctionNames = new Set();
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_declaration') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            if (nameNode)
                localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
        }
        else if (node.type === 'method_declaration') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            if (nameNode)
                localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
        }
    }
    const imports = extractImports(root, filePath, projectRoot);
    const functions = extractFunctions(root, sourceCode, localFunctionNames);
    const classes = extractTypesAndStructs(root);
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
// ─── Imports ──────────────────────────────────────────────────────────────────
function extractImports(root, filePath, projectRoot) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type !== 'import_declaration')
            continue;
        const specs = [];
        const specList = node.children.find((c) => c.type === 'import_spec_list');
        if (specList) {
            for (let j = 0; j < specList.namedChildCount; j++) {
                const child = specList.namedChild(j);
                if (child.type === 'import_spec')
                    specs.push(child);
            }
        }
        else {
            const singleSpec = node.children.find((c) => c.type === 'import_spec');
            if (singleSpec)
                specs.push(singleSpec);
        }
        for (const spec of specs) {
            const pathNode = (0, astHelpers_1.namedChild)(spec, 'path');
            if (!pathNode)
                continue;
            const rawSpec = (0, astHelpers_1.nodeText)(pathNode).replace(/^["']|["']$/g, '');
            const aliasNode = (0, astHelpers_1.namedChild)(spec, 'name');
            const alias = aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined;
            const { resolvedPath, isExternal } = (0, importResolver_1.resolveImportPath)(rawSpec, filePath, projectRoot, resolveOptions);
            const symbols = [];
            const isNamespace = alias === '.';
            if (alias && alias !== '.' && alias !== '_') {
                symbols.push({ name: alias, isDefault: false });
            }
            else {
                // Last segment of path is the default package identifier in Go
                const parts = rawSpec.split('/');
                const defaultName = parts[parts.length - 1];
                symbols.push({ name: defaultName, isDefault: true });
            }
            results.push({
                rawSpecifier: rawSpec,
                resolvedPath,
                isExternal: isExternal || !rawSpec.startsWith('.'),
                symbols,
                isNamespace,
                isSideEffect: alias === '_',
                range: (0, astHelpers_1.nodeRange)(spec),
                raw: (0, astHelpers_1.nodeText)(spec),
            });
        }
    }
    return results;
}
// ─── Functions & Methods ──────────────────────────────────────────────────────
function extractFunctions(root, sourceCode, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_declaration') {
            const fn = parseFunction(node, undefined, sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
        else if (node.type === 'method_declaration') {
            const receiverNode = (0, astHelpers_1.namedChild)(node, 'receiver');
            let parentClass;
            if (receiverNode) {
                // receiver is usually (r *MyStruct) or (r MyStruct)
                const typeNodes = (0, astHelpers_1.findAllDescendants)(receiverNode, new Set(['type_identifier']));
                if (typeNodes.length > 0) {
                    parentClass = (0, astHelpers_1.nodeText)(typeNodes[0]);
                }
            }
            const fn = parseFunction(node, parentClass, sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
    }
    return results;
}
function parseFunction(node, parentClass, sourceCode, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    if (!nameNode)
        return null;
    const name = (0, astHelpers_1.nodeText)(nameNode);
    const isPublic = name[0] === name[0].toUpperCase();
    const visibility = isPublic ? 'public' : 'private';
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    const parameters = [];
    if (paramsNode) {
        for (let i = 0; i < paramsNode.namedChildCount; i++) {
            const param = paramsNode.namedChild(i);
            if (param.type === 'parameter_declaration') {
                const nameChild = (0, astHelpers_1.namedChild)(param, 'name');
                const typeChild = (0, astHelpers_1.namedChild)(param, 'type');
                parameters.push({
                    name: nameChild ? (0, astHelpers_1.nodeText)(nameChild) : `param${i}`,
                    type: typeChild ? (0, astHelpers_1.nodeText)(typeChild) : undefined,
                    isRest: param.text.startsWith('...'),
                });
            }
            else if (param.type === 'variadic_parameter_declaration') {
                const nameChild = (0, astHelpers_1.namedChild)(param, 'name');
                const typeChild = (0, astHelpers_1.namedChild)(param, 'type');
                parameters.push({
                    name: nameChild ? (0, astHelpers_1.nodeText)(nameChild) : `param${i}`,
                    type: typeChild ? (0, astHelpers_1.nodeText)(typeChild) : undefined,
                    isRest: true,
                });
            }
        }
    }
    const resultNode = (0, astHelpers_1.namedChild)(node, 'result');
    const returnType = resultNode ? (0, astHelpers_1.nodeText)(resultNode) : undefined;
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
        isStatic: !parentClass,
        visibility,
        decorators: [],
        nestedFunctions: [],
        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
    };
}
// ─── Structs and Interfaces ───────────────────────────────────────────────────
function extractTypesAndStructs(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type !== 'type_declaration')
            continue;
        for (let j = 0; j < node.namedChildCount; j++) {
            const spec = node.namedChild(j);
            if (spec.type !== 'type_spec')
                continue;
            const nameNode = (0, astHelpers_1.namedChild)(spec, 'name');
            if (!nameNode)
                continue;
            const name = (0, astHelpers_1.nodeText)(nameNode);
            const isPublic = name[0] === name[0].toUpperCase();
            const visibility = isPublic ? 'public' : 'private';
            const typeNode = (0, astHelpers_1.namedChild)(spec, 'type');
            if (!typeNode)
                continue;
            let kind = 'struct';
            const properties = [];
            const superClasses = [];
            const interfaces = [];
            if (typeNode.type === 'struct_type') {
                kind = 'struct';
                const fieldList = (0, astHelpers_1.namedChild)(typeNode, 'fields');
                if (fieldList) {
                    for (let k = 0; k < fieldList.namedChildCount; k++) {
                        const field = fieldList.namedChild(k);
                        if (field.type === 'field_declaration') {
                            const fName = (0, astHelpers_1.namedChild)(field, 'name');
                            const fType = (0, astHelpers_1.namedChild)(field, 'type');
                            if (fName) {
                                properties.push({
                                    name: (0, astHelpers_1.nodeText)(fName),
                                    type: fType ? (0, astHelpers_1.nodeText)(fType) : undefined,
                                    isStatic: false,
                                    visibility: (0, astHelpers_1.nodeText)(fName)[0] === (0, astHelpers_1.nodeText)(fName)[0].toUpperCase() ? 'public' : 'private',
                                    range: (0, astHelpers_1.nodeRange)(field),
                                });
                            }
                            else if (fType) {
                                // Embedded / anonymous struct field (inheritance-like composition in Go)
                                superClasses.push((0, astHelpers_1.nodeText)(fType));
                            }
                        }
                    }
                }
            }
            else if (typeNode.type === 'interface_type') {
                kind = 'interface';
            }
            results.push({
                name,
                kind,
                superClasses,
                interfaces,
                methods: [],
                properties,
                constructors: [],
                decorators: [],
                range: (0, astHelpers_1.nodeRange)(spec),
                visibility,
                docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                nestedClasses: [],
            });
        }
    }
    return results;
}
// ─── Variables and Constants ──────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'var_declaration' || node.type === 'const_declaration') {
            const isConst = node.type === 'const_declaration';
            const specType = isConst ? 'const_spec' : 'var_spec';
            for (let j = 0; j < node.namedChildCount; j++) {
                const spec = node.namedChild(j);
                if (spec.type === specType) {
                    const nameNode = (0, astHelpers_1.namedChild)(spec, 'name');
                    if (nameNode) {
                        const name = (0, astHelpers_1.nodeText)(nameNode);
                        const typeNode = (0, astHelpers_1.namedChild)(spec, 'type');
                        const valueNode = (0, astHelpers_1.namedChild)(spec, 'value');
                        results.push({
                            name,
                            kind: isConst ? 'constant' : 'variable',
                            type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                            initialValue: valueNode ? (0, astHelpers_1.nodeText)(valueNode) : undefined,
                            isExported: name[0] === name[0].toUpperCase(),
                            range: (0, astHelpers_1.nodeRange)(spec),
                            docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                        });
                    }
                }
            }
        }
    }
    return results;
}
// ─── Exports (In Go, identifiers starting with uppercase are exported) ────────
function extractExports(functions, classes, variables) {
    const exports = [];
    for (const fn of functions) {
        if (!fn.parentClass && fn.visibility === 'public') {
            exports.push({
                name: fn.name,
                kind: 'function',
                isDefault: false,
                range: fn.range,
            });
        }
    }
    for (const cls of classes) {
        if (cls.visibility === 'public') {
            exports.push({
                name: cls.name,
                kind: cls.kind === 'interface' ? 'interface' : 'class',
                isDefault: false,
                range: cls.range,
            });
        }
    }
    for (const v of variables) {
        if (v.isExported) {
            exports.push({
                name: v.name,
                kind: v.kind === 'constant' ? 'variable' : 'variable',
                isDefault: false,
                range: v.range,
            });
        }
    }
    return exports;
}
exports.goExtractor = {
    languageId: 'go',
    extensions: ['go'],
    wasmFile: 'tree-sitter-go.wasm',
    sourceExtensions: resolveOptions.sourceExtensions,
    indexFiles: resolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=go.js.map