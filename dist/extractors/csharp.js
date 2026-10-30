"use strict";
/**
 * @module extractors/csharp
 * Language extractor for C# (.cs).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.csharpExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const csResolveOptions = {
    sourceExtensions: ['cs'],
    indexFiles: [],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect all local method names
    const localFunctionNames = new Set();
    const methodNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['method_declaration', 'local_function_statement']));
    for (const m of methodNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(m, 'name');
        if (nameNode)
            localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
    }
    const imports = extractUsingDirectives(root, filePath, projectRoot);
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
// ─── Usings ───────────────────────────────────────────────────────────────────
function extractUsingDirectives(root, filePath, projectRoot) {
    const results = [];
    const usingNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['using_directive']));
    for (const node of usingNodes) {
        const raw = (0, astHelpers_1.nodeText)(node);
        let rawSpec = '';
        let alias;
        const first = node.namedChild(0);
        const second = node.namedChild(1);
        if (first && first.type === 'name_equals') {
            alias = (0, astHelpers_1.nodeText)(first).replace(/\s*=$/, '').trim();
            if (second)
                rawSpec = (0, astHelpers_1.nodeText)(second);
        }
        else if (first) {
            rawSpec = (0, astHelpers_1.nodeText)(first);
        }
        if (!rawSpec)
            continue;
        const symbols = [];
        if (alias) {
            symbols.push({ name: alias, alias, isDefault: false });
        }
        else {
            const parts = rawSpec.split('.');
            symbols.push({ name: parts[parts.length - 1], isDefault: true });
        }
        // Try resolving relative if local project namespace matches folder structure
        const relPath = rawSpec.replace(/\./g, '/');
        const resolved = (0, importResolver_1.resolveImportPath)(`./${relPath}`, filePath, projectRoot, csResolveOptions);
        results.push({
            rawSpecifier: rawSpec,
            resolvedPath: resolved.resolvedPath,
            isExternal: !resolved.resolvedPath,
            symbols,
            isNamespace: !alias,
            isSideEffect: false,
            range: (0, astHelpers_1.nodeRange)(node),
            raw,
        });
    }
    return results;
}
// ─── Classes, Structs, Interfaces, Records ────────────────────────────────────
function extractClasses(root, sourceCode, localNames) {
    const results = [];
    const classTypes = new Set([
        'class_declaration',
        'interface_declaration',
        'struct_declaration',
        'enum_declaration',
        'record_declaration',
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
        else if (node.type === 'struct_declaration')
            kind = 'struct';
        else if (node.type === 'enum_declaration')
            kind = 'enum';
        const modifiers = getModifiers(node);
        const isPublic = modifiers.includes('public');
        const visibility = isPublic ? 'public' : modifiers.includes('protected') ? 'protected' : 'private';
        const superClasses = [];
        const interfaces = [];
        const baseList = node.children.find((c) => c.type === 'base_list');
        if (baseList) {
            for (let i = 0; i < baseList.namedChildCount; i++) {
                const item = baseList.namedChild(i);
                const text = (0, astHelpers_1.nodeText)(item);
                if (text.startsWith('I') && text.length > 1 && text[1] === text[1].toUpperCase()) {
                    interfaces.push(text);
                }
                else {
                    superClasses.push(text);
                }
            }
        }
        const properties = [];
        const methods = [];
        const constructors = [];
        const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
        if (bodyNode) {
            for (let j = 0; j < bodyNode.namedChildCount; j++) {
                const item = bodyNode.namedChild(j);
                if (item.type === 'method_declaration') {
                    const method = parseMethod(item, name, sourceCode, localNames);
                    if (method)
                        methods.push(method);
                }
                else if (item.type === 'constructor_declaration') {
                    const ctor = parseMethod(item, name, sourceCode, localNames);
                    if (ctor)
                        constructors.push(ctor);
                }
                else if (item.type === 'property_declaration') {
                    const pName = (0, astHelpers_1.namedChild)(item, 'name');
                    const pType = (0, astHelpers_1.namedChild)(item, 'type');
                    const pMods = getModifiers(item);
                    if (pName) {
                        properties.push({
                            name: (0, astHelpers_1.nodeText)(pName),
                            type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                            isStatic: pMods.includes('static'),
                            visibility: pMods.includes('public') ? 'public' : 'private',
                            range: (0, astHelpers_1.nodeRange)(item),
                        });
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
            visibility,
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
    const isAsync = modifiers.includes('async');
    const visibility = modifiers.includes('public')
        ? 'public'
        : modifiers.includes('protected')
            ? 'protected'
            : 'private';
    const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
    const returnType = typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined;
    const parameters = [];
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    if (paramsNode) {
        for (let i = 0; i < paramsNode.namedChildCount; i++) {
            const p = paramsNode.namedChild(i);
            if (p.type === 'parameter') {
                const pName = (0, astHelpers_1.namedChild)(p, 'name');
                const pType = (0, astHelpers_1.namedChild)(p, 'type');
                parameters.push({
                    name: pName ? (0, astHelpers_1.nodeText)(pName) : `param${i}`,
                    type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
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
        isAsync,
        isStatic,
        visibility,
        decorators: (0, astHelpers_1.collectDecorators)(node),
        nestedFunctions: [],
        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
    };
}
// ─── Top-level functions & variables ──────────────────────────────────────────
function extractTopLevelFunctions(root, sourceCode, localNames) {
    const results = [];
    const globalStatements = (0, astHelpers_1.findAllDescendants)(root, new Set(['local_function_statement']));
    for (const node of globalStatements) {
        const fn = parseMethod(node, '', sourceCode, localNames);
        if (fn)
            results.push(fn);
    }
    return results;
}
function extractVariables(root) {
    const results = [];
    return results;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getModifiers(node) {
    const mods = [];
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type === 'modifier') {
            mods.push((0, astHelpers_1.nodeText)(child));
        }
    }
    return mods;
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(functions, classes, variables) {
    const exports = [];
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
    return exports;
}
exports.csharpExtractor = {
    languageId: 'csharp',
    extensions: ['cs'],
    wasmFile: 'tree-sitter-c_sharp.wasm',
    sourceExtensions: csResolveOptions.sourceExtensions,
    indexFiles: csResolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=csharp.js.map