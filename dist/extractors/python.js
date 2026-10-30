"use strict";
/**
 * @module extractors/python
 * Language extractor for Python.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pythonExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const resolveOptions = {
    sourceExtensions: ['py', 'pyi'],
    indexFiles: ['__init__.py'],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    const topLevelFunctionNames = new Set();
    gatherFunctionNames(root, topLevelFunctionNames);
    return {
        imports: extractImports(root, filePath, projectRoot),
        exports: extractExports(root),
        functions: extractFunctions(root, topLevelFunctionNames),
        classes: extractClasses(root, topLevelFunctionNames),
        variables: extractVariables(root),
        comments: (0, astHelpers_1.collectComments)(root),
        syntaxErrors: (0, astHelpers_1.collectSyntaxErrors)(root, sourceCode),
    };
}
function gatherFunctionNames(root, names) {
    const fnTypes = new Set(['function_definition']);
    const nodes = (0, astHelpers_1.findAllDescendants)(root, fnTypes);
    for (const node of nodes) {
        const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
        if (nameNode)
            names.add((0, astHelpers_1.nodeText)(nameNode));
    }
}
// ─── Imports ──────────────────────────────────────────────────────────────────
function extractImports(root, filePath, projectRoot) {
    const results = [];
    // import X, import X as Y
    const importStmts = (0, astHelpers_1.findAllDescendants)(root, new Set(['import_statement']));
    for (const node of importStmts) {
        const raw = (0, astHelpers_1.nodeText)(node);
        const nameNodes = (0, astHelpers_1.findAllDescendants)(node, new Set(['dotted_name', 'aliased_import']));
        for (const nn of nameNodes) {
            if (nn.type === 'aliased_import') {
                const nameNode = (0, astHelpers_1.namedChild)(nn, 'name');
                const aliasNode = (0, astHelpers_1.namedChild)(nn, 'alias');
                const moduleName = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '';
                const resolved = resolvePythonImport(moduleName, filePath, projectRoot);
                results.push({
                    rawSpecifier: moduleName,
                    resolvedPath: resolved.resolvedPath,
                    isExternal: resolved.isExternal,
                    symbols: [{ name: moduleName, alias: aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined, isDefault: false }],
                    isNamespace: false,
                    isSideEffect: false,
                    range: (0, astHelpers_1.nodeRange)(node),
                    raw,
                });
            }
            else if (nn.type === 'dotted_name' && nn.parent?.type === 'import_statement') {
                const moduleName = (0, astHelpers_1.nodeText)(nn);
                const resolved = resolvePythonImport(moduleName, filePath, projectRoot);
                results.push({
                    rawSpecifier: moduleName,
                    resolvedPath: resolved.resolvedPath,
                    isExternal: resolved.isExternal,
                    symbols: [{ name: moduleName, isDefault: false }],
                    isNamespace: false,
                    isSideEffect: false,
                    range: (0, astHelpers_1.nodeRange)(node),
                    raw,
                });
            }
        }
    }
    // from X import Y, Z
    const fromImports = (0, astHelpers_1.findAllDescendants)(root, new Set(['import_from_statement']));
    for (const node of fromImports) {
        const raw = (0, astHelpers_1.nodeText)(node);
        const moduleNode = (0, astHelpers_1.namedChild)(node, 'module_name');
        const moduleName = moduleNode ? (0, astHelpers_1.nodeText)(moduleNode) : '';
        const symbols = [];
        let isNamespace = false;
        // Check for wildcard import
        const wildcardNode = node.children.find((c) => c.type === 'wildcard_import');
        if (wildcardNode) {
            isNamespace = true;
            symbols.push({ name: '*', isDefault: false });
        }
        // Named imports
        const importedNames = (0, astHelpers_1.findAllDescendants)(node, new Set(['dotted_name', 'aliased_import']));
        for (const nn of importedNames) {
            if (nn === moduleNode)
                continue;
            if (nn.type === 'aliased_import') {
                const nameNode = (0, astHelpers_1.namedChild)(nn, 'name');
                const aliasNode = (0, astHelpers_1.namedChild)(nn, 'alias');
                symbols.push({
                    name: nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '',
                    alias: aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined,
                    isDefault: false,
                });
            }
            else if (nn.type === 'dotted_name' && nn.parent === node) {
                symbols.push({ name: (0, astHelpers_1.nodeText)(nn), isDefault: false });
            }
        }
        // Also check for plain identifiers used as imported names
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child.type === 'identifier' && child !== moduleNode) {
                // Check this isn't 'from' or 'import' keyword (those are keywords, not identifiers in tree-sitter)
                const text = (0, astHelpers_1.nodeText)(child);
                if (!symbols.some((s) => s.name === text)) {
                    symbols.push({ name: text, isDefault: false });
                }
            }
        }
        const resolved = resolvePythonImport(moduleName, filePath, projectRoot);
        results.push({
            rawSpecifier: moduleName,
            resolvedPath: resolved.resolvedPath,
            isExternal: resolved.isExternal,
            symbols,
            isNamespace,
            isSideEffect: false,
            range: (0, astHelpers_1.nodeRange)(node),
            raw,
        });
    }
    return results;
}
function resolvePythonImport(moduleName, filePath, projectRoot) {
    // Relative imports (starting with .)
    if (moduleName.startsWith('.')) {
        const dots = moduleName.match(/^\.+/)?.[0] ?? '.';
        const relModule = moduleName.slice(dots.length);
        const depth = dots.length - 1;
        let relPath = './' + '../'.repeat(depth);
        if (relModule) {
            relPath += relModule.replace(/\./g, '/');
        }
        return (0, importResolver_1.resolveImportPath)(relPath, filePath, projectRoot, resolveOptions);
    }
    // Absolute-looking imports: check if it matches a local file relative to projectRoot
    const parts = moduleName.split('.');
    const relPath = './' + parts.join('/');
    const result = (0, importResolver_1.resolveImportPath)(relPath, filePath, projectRoot, {
        ...resolveOptions,
        sourceExtensions: ['py', 'pyi'],
    });
    if (result.resolvedPath)
        return result;
    // If not resolved, treat as external
    return { resolvedPath: null, isExternal: true };
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(root) {
    // Python doesn't have explicit exports; we extract __all__ if present
    const results = [];
    const assignments = (0, astHelpers_1.findAllDescendants)(root, new Set(['assignment', 'expression_statement']));
    for (const node of assignments) {
        let targetNode = node;
        if (node.type === 'expression_statement') {
            const child = node.namedChild(0);
            if (child && child.type === 'assignment') {
                targetNode = child;
            }
            else {
                continue;
            }
        }
        const left = (0, astHelpers_1.namedChild)(targetNode, 'left');
        if (left && (0, astHelpers_1.nodeText)(left) === '__all__') {
            const right = (0, astHelpers_1.namedChild)(targetNode, 'right');
            if (right) {
                const strings = (0, astHelpers_1.findAllDescendants)(right, new Set(['string']));
                for (const s of strings) {
                    const name = (0, astHelpers_1.nodeText)(s).replace(/^['"]|['"]$/g, '');
                    results.push({ name, kind: 'unknown', isDefault: false, range: (0, astHelpers_1.nodeRange)(s) });
                }
            }
        }
    }
    // Also treat top-level function and class definitions as exports
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_definition') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            if (nameNode) {
                const name = (0, astHelpers_1.nodeText)(nameNode);
                if (!name.startsWith('_')) {
                    results.push({ name, kind: 'function', isDefault: false, range: (0, astHelpers_1.nodeRange)(node) });
                }
            }
        }
        else if (node.type === 'class_definition') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            if (nameNode) {
                const name = (0, astHelpers_1.nodeText)(nameNode);
                if (!name.startsWith('_')) {
                    results.push({ name, kind: 'class', isDefault: false, range: (0, astHelpers_1.nodeRange)(node) });
                }
            }
        }
    }
    return results;
}
// ─── Functions ────────────────────────────────────────────────────────────────
function extractFunctions(root, localNames, parentClass) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_definition') {
            results.push(buildFunctionInfo(node, localNames, parentClass));
        }
        else if (node.type === 'decorated_definition') {
            const defNode = node.namedChild(node.namedChildCount - 1);
            if (defNode && defNode.type === 'function_definition') {
                results.push(buildFunctionInfo(defNode, localNames, parentClass));
            }
        }
    }
    return results;
}
function buildFunctionInfo(node, localNames, parentClass) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>';
    const parameters = extractParameters(node);
    const returnTypeNode = (0, astHelpers_1.namedChild)(node, 'return_type');
    const returnType = returnTypeNode ? (0, astHelpers_1.nodeText)(returnTypeNode).replace(/^->\s*/, '') : undefined;
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const body = bodyNode ? (0, astHelpers_1.nodeText)(bodyNode) : '';
    const calls = bodyNode ? (0, astHelpers_1.extractCallsFromBody)(bodyNode, localNames) : [];
    const objectsAccessed = bodyNode ? (0, astHelpers_1.extractObjectsAccessed)(bodyNode) : [];
    // Check for async
    const isAsync = node.parent?.type === 'decorated_definition'
        ? (0, astHelpers_1.nodeText)(node).startsWith('async ')
        : (0, astHelpers_1.nodeText)(node).startsWith('async ');
    // Check for staticmethod/classmethod
    const decorators = (0, astHelpers_1.collectDecorators)(node.parent?.type === 'decorated_definition' ? node.parent : node);
    const isStatic = decorators.some((d) => d.includes('staticmethod'));
    const docComment = extractDocstring(bodyNode);
    // Nested functions
    const nestedFunctions = [];
    if (bodyNode) {
        for (let i = 0; i < bodyNode.namedChildCount; i++) {
            const child = bodyNode.namedChild(i);
            if (child.type === 'function_definition') {
                nestedFunctions.push(buildFunctionInfo(child, localNames, parentClass));
            }
        }
    }
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
        decorators,
        nestedFunctions,
        docComment,
    };
}
function extractParameters(node) {
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    if (!paramsNode)
        return [];
    const params = [];
    for (let i = 0; i < paramsNode.namedChildCount; i++) {
        const param = paramsNode.namedChild(i);
        if (param.type === 'identifier') {
            params.push({ name: (0, astHelpers_1.nodeText)(param) });
        }
        else if (param.type === 'typed_parameter') {
            const pName = (0, astHelpers_1.namedChild)(param, 'name') ?? param.child(0);
            const pType = (0, astHelpers_1.namedChild)(param, 'type');
            params.push({
                name: pName ? (0, astHelpers_1.nodeText)(pName) : (0, astHelpers_1.nodeText)(param),
                type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
            });
        }
        else if (param.type === 'default_parameter' || param.type === 'typed_default_parameter') {
            const pName = (0, astHelpers_1.namedChild)(param, 'name') ?? param.child(0);
            const pValue = (0, astHelpers_1.namedChild)(param, 'value');
            const pType = (0, astHelpers_1.namedChild)(param, 'type');
            params.push({
                name: pName ? (0, astHelpers_1.nodeText)(pName) : (0, astHelpers_1.nodeText)(param),
                type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                defaultValue: pValue ? (0, astHelpers_1.nodeText)(pValue) : undefined,
            });
        }
        else if (param.type === 'list_splat_pattern' || param.type === 'dictionary_splat_pattern') {
            const inner = param.namedChild(0);
            params.push({
                name: inner ? (0, astHelpers_1.nodeText)(inner) : (0, astHelpers_1.nodeText)(param),
                isRest: true,
            });
        }
    }
    return params;
}
function extractDocstring(bodyNode) {
    if (!bodyNode)
        return undefined;
    const first = bodyNode.namedChild(0);
    if (!first)
        return undefined;
    if (first.type === 'expression_statement') {
        const expr = first.namedChild(0);
        if (expr && (expr.type === 'string' || expr.type === 'concatenated_string')) {
            return (0, astHelpers_1.nodeText)(expr);
        }
    }
    return undefined;
}
// ─── Classes ──────────────────────────────────────────────────────────────────
function extractClasses(root, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'class_definition') {
            results.push(buildClassInfo(node, localNames));
        }
        else if (node.type === 'decorated_definition') {
            const defNode = node.namedChild(node.namedChildCount - 1);
            if (defNode && defNode.type === 'class_definition') {
                results.push(buildClassInfo(defNode, localNames));
            }
        }
    }
    return results;
}
function buildClassInfo(node, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>';
    // Superclasses
    const superClasses = [];
    const argsNode = (0, astHelpers_1.namedChild)(node, 'superclasses') ?? (0, astHelpers_1.namedChild)(node, 'argument_list');
    if (argsNode) {
        for (let i = 0; i < argsNode.namedChildCount; i++) {
            const arg = argsNode.namedChild(i);
            if (arg.type === 'identifier' || arg.type === 'attribute') {
                superClasses.push((0, astHelpers_1.nodeText)(arg));
            }
        }
    }
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const methods = [];
    const properties = [];
    const constructors = [];
    const nestedClasses = [];
    if (bodyNode) {
        for (let i = 0; i < bodyNode.namedChildCount; i++) {
            const member = bodyNode.namedChild(i);
            if (member.type === 'function_definition') {
                const fnName = (0, astHelpers_1.namedChild)(member, 'name');
                const fnNameStr = fnName ? (0, astHelpers_1.nodeText)(fnName) : '';
                if (fnNameStr === '__init__') {
                    constructors.push(buildFunctionInfo(member, localNames, name));
                }
                else {
                    methods.push(buildFunctionInfo(member, localNames, name));
                }
            }
            else if (member.type === 'decorated_definition') {
                const defNode = member.namedChild(member.namedChildCount - 1);
                if (defNode && defNode.type === 'function_definition') {
                    const fnName = (0, astHelpers_1.namedChild)(defNode, 'name');
                    const fnNameStr = fnName ? (0, astHelpers_1.nodeText)(fnName) : '';
                    if (fnNameStr === '__init__') {
                        constructors.push(buildFunctionInfo(defNode, localNames, name));
                    }
                    else {
                        methods.push(buildFunctionInfo(defNode, localNames, name));
                    }
                }
                else if (defNode && defNode.type === 'class_definition') {
                    nestedClasses.push(buildClassInfo(defNode, localNames));
                }
            }
            else if (member.type === 'expression_statement') {
                const expr = member.namedChild(0);
                if (expr && (expr.type === 'assignment' || expr.type === 'type_alias_statement')) {
                    const left = (0, astHelpers_1.namedChild)(expr, 'left');
                    if (left && left.type === 'identifier') {
                        const typeNode = (0, astHelpers_1.namedChild)(expr, 'type');
                        const right = (0, astHelpers_1.namedChild)(expr, 'right');
                        properties.push({
                            name: (0, astHelpers_1.nodeText)(left),
                            type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                            defaultValue: right ? (0, astHelpers_1.nodeText)(right) : undefined,
                            isStatic: true,
                            range: (0, astHelpers_1.nodeRange)(member),
                        });
                    }
                }
            }
            else if (member.type === 'class_definition') {
                nestedClasses.push(buildClassInfo(member, localNames));
            }
        }
    }
    const decorators = (0, astHelpers_1.collectDecorators)(node.parent?.type === 'decorated_definition' ? node.parent : node);
    const docComment = bodyNode ? extractDocstring(bodyNode) : undefined;
    return {
        name,
        kind: 'class',
        superClasses,
        interfaces: [],
        methods,
        properties,
        constructors,
        decorators,
        range: (0, astHelpers_1.nodeRange)(node),
        docComment,
        nestedClasses,
    };
}
// ─── Variables ────────────────────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'expression_statement') {
            const expr = node.namedChild(0);
            if (expr && expr.type === 'assignment') {
                const left = (0, astHelpers_1.namedChild)(expr, 'left');
                const right = (0, astHelpers_1.namedChild)(expr, 'right');
                const typeNode = (0, astHelpers_1.namedChild)(expr, 'type');
                if (left && left.type === 'identifier') {
                    const name = (0, astHelpers_1.nodeText)(left);
                    const isConst = name === name.toUpperCase() && name.length > 1;
                    results.push({
                        name,
                        kind: isConst ? 'constant' : 'variable',
                        type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                        initialValue: right ? (0, astHelpers_1.nodeText)(right) : undefined,
                        isExported: !name.startsWith('_'),
                        range: (0, astHelpers_1.nodeRange)(node),
                    });
                }
            }
        }
    }
    return results;
}
// ─── Extractor ────────────────────────────────────────────────────────────────
exports.pythonExtractor = {
    languageId: 'python',
    extensions: ['py', 'pyi'],
    wasmFile: 'tree-sitter-python.wasm',
    sourceExtensions: resolveOptions.sourceExtensions,
    indexFiles: resolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=python.js.map