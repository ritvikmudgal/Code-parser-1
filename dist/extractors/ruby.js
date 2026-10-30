"use strict";
/**
 * @module extractors/ruby
 * Language extractor for Ruby (.rb).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rubyExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const rbResolveOptions = {
    sourceExtensions: ['rb'],
    indexFiles: [],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect declared method names
    const localFunctionNames = new Set();
    const methodNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['method', 'singleton_method']));
    for (const m of methodNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(m, 'name');
        if (nameNode)
            localFunctionNames.add((0, astHelpers_1.nodeText)(nameNode));
    }
    const imports = extractRequires(root, filePath, projectRoot);
    const classes = extractClassesAndModules(root, sourceCode, localFunctionNames);
    const functions = extractTopLevelMethods(root, sourceCode, localFunctionNames);
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
// ─── Requires ─────────────────────────────────────────────────────────────────
function extractRequires(root, filePath, projectRoot) {
    const results = [];
    const calls = (0, astHelpers_1.findAllDescendants)(root, new Set(['call']));
    for (const call of calls) {
        const methodNode = (0, astHelpers_1.namedChild)(call, 'method');
        if (!methodNode)
            continue;
        const methodName = (0, astHelpers_1.nodeText)(methodNode);
        if (methodName === 'require' || methodName === 'require_relative' || methodName === 'load') {
            const argsNode = (0, astHelpers_1.namedChild)(call, 'arguments');
            if (!argsNode)
                continue;
            const strNode = (0, astHelpers_1.findAllDescendants)(argsNode, new Set(['string', 'simple_symbol']))[0];
            if (!strNode)
                continue;
            const rawSpec = (0, astHelpers_1.nodeText)(strNode).replace(/^['":]|['"]$/g, '');
            const isRelative = methodName === 'require_relative' || rawSpec.startsWith('.');
            let resolvedPath = null;
            let isExternal = true;
            if (isRelative) {
                const specToResolve = rawSpec.startsWith('.') ? rawSpec : `./${rawSpec}`;
                const resolved = (0, importResolver_1.resolveImportPath)(specToResolve, filePath, projectRoot, rbResolveOptions);
                resolvedPath = resolved.resolvedPath;
                isExternal = !resolvedPath;
            }
            const symbols = [{
                    name: rawSpec.split('/').pop(),
                    isDefault: true,
                }];
            results.push({
                rawSpecifier: rawSpec,
                resolvedPath,
                isExternal,
                symbols,
                isNamespace: false,
                isSideEffect: true,
                range: (0, astHelpers_1.nodeRange)(call),
                raw: (0, astHelpers_1.nodeText)(call),
            });
        }
    }
    return results;
}
// ─── Classes & Modules ────────────────────────────────────────────────────────
function extractClassesAndModules(root, sourceCode, localNames) {
    const results = [];
    const classNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['class', 'module']));
    for (const node of classNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
        if (!nameNode)
            continue;
        const name = (0, astHelpers_1.nodeText)(nameNode);
        const kind = node.type === 'module' ? 'trait' : 'class';
        const superClasses = [];
        const superNode = (0, astHelpers_1.namedChild)(node, 'superclass');
        if (superNode) {
            superClasses.push((0, astHelpers_1.nodeText)(superNode).replace(/^<\s*/, ''));
        }
        const properties = [];
        const methods = [];
        const constructors = [];
        const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
        if (bodyNode) {
            for (let j = 0; j < bodyNode.namedChildCount; j++) {
                const item = bodyNode.namedChild(j);
                if (item.type === 'method' || item.type === 'singleton_method') {
                    const method = parseMethod(item, name, sourceCode, localNames);
                    if (method) {
                        if (method.name === 'initialize') {
                            constructors.push(method);
                        }
                        else {
                            methods.push(method);
                        }
                    }
                }
                else if (item.type === 'call') {
                    // attr_accessor, attr_reader, attr_writer
                    const mName = (0, astHelpers_1.namedChild)(item, 'method');
                    if (mName && ['attr_accessor', 'attr_reader', 'attr_writer'].includes((0, astHelpers_1.nodeText)(mName))) {
                        const args = (0, astHelpers_1.namedChild)(item, 'arguments');
                        if (args) {
                            for (let k = 0; k < args.namedChildCount; k++) {
                                const arg = args.namedChild(k);
                                properties.push({
                                    name: (0, astHelpers_1.nodeText)(arg).replace(/^[:'"]|['"]$/g, ''),
                                    isStatic: false,
                                    range: (0, astHelpers_1.nodeRange)(arg),
                                });
                            }
                        }
                    }
                }
            }
        }
        results.push({
            name,
            kind,
            superClasses,
            interfaces: [],
            methods,
            properties,
            constructors,
            decorators: [],
            range: (0, astHelpers_1.nodeRange)(node),
            visibility: 'public',
            docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
            nestedClasses: [],
        });
    }
    return results;
}
// ─── Methods ──────────────────────────────────────────────────────────────────
function extractTopLevelMethods(root, sourceCode, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'method' || node.type === 'singleton_method') {
            const fn = parseMethod(node, undefined, sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
    }
    return results;
}
function parseMethod(node, parentClass, sourceCode, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    if (!nameNode)
        return null;
    const name = (0, astHelpers_1.nodeText)(nameNode);
    const isStatic = node.type === 'singleton_method';
    const parameters = [];
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters');
    if (paramsNode) {
        for (let i = 0; i < paramsNode.namedChildCount; i++) {
            const p = paramsNode.namedChild(i);
            parameters.push({
                name: (0, astHelpers_1.nodeText)(p).replace(/^[*&]/, ''),
                isRest: p.text.startsWith('*'),
            });
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
        body,
        range: (0, astHelpers_1.nodeRange)(node),
        calls,
        objectsAccessed,
        isAsync: false,
        isStatic,
        visibility: 'public',
        decorators: [],
        nestedFunctions: [],
        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
    };
}
// ─── Variables & Constants ────────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'assignment') {
            const left = (0, astHelpers_1.namedChild)(node, 'left');
            const right = (0, astHelpers_1.namedChild)(node, 'right');
            if (left && (left.type === 'constant' || left.type === 'identifier')) {
                const name = (0, astHelpers_1.nodeText)(left);
                const isConst = left.type === 'constant';
                results.push({
                    name,
                    kind: isConst ? 'constant' : 'variable',
                    initialValue: right ? (0, astHelpers_1.nodeText)(right) : undefined,
                    isExported: isConst,
                    range: (0, astHelpers_1.nodeRange)(node),
                    docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                });
            }
        }
    }
    return results;
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
exports.rubyExtractor = {
    languageId: 'ruby',
    extensions: ['rb', 'rake', 'gemspec'],
    wasmFile: 'tree-sitter-ruby.wasm',
    sourceExtensions: rbResolveOptions.sourceExtensions,
    indexFiles: rbResolveOptions.indexFiles,
    extract,
};
//# sourceMappingURL=ruby.js.map