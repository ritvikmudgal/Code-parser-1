"use strict";
/**
 * @module extractors/c_cpp
 * Language extractor for C and C++ (.c, .h, .cpp, .hpp, .cc, .cxx).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cppExtractor = exports.cExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
const cResolveOptions = {
    sourceExtensions: ['h', 'hpp', 'c', 'cpp', 'cc'],
    indexFiles: [],
};
function extract(tree, sourceCode, filePath, projectRoot) {
    const root = tree.rootNode;
    // 1. Collect declared function names
    const localFunctionNames = new Set();
    const fnDefs = (0, astHelpers_1.findAllDescendants)(root, new Set(['function_definition']));
    for (const fn of fnDefs) {
        const decl = (0, astHelpers_1.namedChild)(fn, 'declarator');
        if (decl) {
            const name = extractDeclaratorName(decl);
            if (name)
                localFunctionNames.add(name);
        }
    }
    const imports = extractIncludes(root, filePath, projectRoot);
    const classes = extractClassesAndStructs(root, sourceCode, localFunctionNames);
    const functions = extractFunctions(root, sourceCode, localFunctionNames);
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
// ─── Includes (preproc_include) ───────────────────────────────────────────────
function extractIncludes(root, filePath, projectRoot) {
    const results = [];
    const includeNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['preproc_include']));
    for (const node of includeNodes) {
        const pathNode = (0, astHelpers_1.namedChild)(node, 'path');
        if (!pathNode)
            continue;
        const rawText = (0, astHelpers_1.nodeText)(pathNode);
        const isSystem = rawText.startsWith('<') && rawText.endsWith('>');
        const cleanPath = rawText.replace(/^[<"]|[>"]$/g, '');
        let resolvedPath = null;
        let isExternal = isSystem;
        if (!isSystem) {
            const resolved = (0, importResolver_1.resolveImportPath)(cleanPath.startsWith('.') ? cleanPath : `./${cleanPath}`, filePath, projectRoot, cResolveOptions);
            resolvedPath = resolved.resolvedPath;
            isExternal = !resolvedPath;
        }
        const symbols = [{
                name: cleanPath,
                isDefault: true,
            }];
        results.push({
            rawSpecifier: cleanPath,
            resolvedPath,
            isExternal,
            symbols,
            isNamespace: false,
            isSideEffect: true,
            range: (0, astHelpers_1.nodeRange)(node),
            raw: (0, astHelpers_1.nodeText)(node),
        });
    }
    return results;
}
// ─── Functions ────────────────────────────────────────────────────────────────
function extractDeclaratorName(declNode) {
    if (declNode.type === 'identifier' || declNode.type === 'field_identifier') {
        return (0, astHelpers_1.nodeText)(declNode);
    }
    if (declNode.type === 'scoped_identifier' || declNode.type === 'qualified_identifier') {
        return (0, astHelpers_1.nodeText)(declNode);
    }
    if (declNode.type === 'function_declarator' || declNode.type === 'pointer_declarator' || declNode.type === 'reference_declarator') {
        const inner = declNode.childForFieldName('declarator') ?? declNode.child(0);
        if (inner)
            return extractDeclaratorName(inner);
    }
    return undefined;
}
function extractFunctions(root, sourceCode, localNames) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'function_definition') {
            const fn = parseFunctionDefinition(node, undefined, sourceCode, localNames);
            if (fn)
                results.push(fn);
        }
    }
    return results;
}
function parseFunctionDefinition(node, parentClass, sourceCode, localNames) {
    const declNode = (0, astHelpers_1.namedChild)(node, 'declarator');
    if (!declNode)
        return null;
    const rawName = extractDeclaratorName(declNode);
    if (!rawName)
        return null;
    let name = rawName;
    let resolvedParent = parentClass;
    if (rawName.includes('::') && !parentClass) {
        const parts = rawName.split('::');
        name = parts.pop();
        resolvedParent = parts.join('::');
    }
    const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
    const returnType = typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined;
    const parameters = [];
    const paramListNode = (0, astHelpers_1.findAllDescendants)(declNode, new Set(['parameter_list']))[0];
    if (paramListNode) {
        for (let i = 0; i < paramListNode.namedChildCount; i++) {
            const pNode = paramListNode.namedChild(i);
            if (pNode.type === 'parameter_declaration') {
                const pType = (0, astHelpers_1.namedChild)(pNode, 'type');
                const pDecl = (0, astHelpers_1.namedChild)(pNode, 'declarator');
                const pName = pDecl ? extractDeclaratorName(pDecl) : `param${i}`;
                parameters.push({
                    name: pName || `param${i}`,
                    type: pType ? (0, astHelpers_1.nodeText)(pType) : undefined,
                });
            }
        }
    }
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const body = bodyNode ? (0, astHelpers_1.nodeText)(bodyNode) : '';
    const calls = bodyNode ? (0, astHelpers_1.extractCallsFromBody)(bodyNode, localNames) : [];
    const objectsAccessed = bodyNode ? (0, astHelpers_1.extractObjectsAccessed)(bodyNode) : [];
    let isStatic = false;
    for (let i = 0; i < node.childCount; i++) {
        if (node.child(i).type === 'storage_class_specifier' && node.child(i).text === 'static') {
            isStatic = true;
            break;
        }
    }
    return {
        name,
        parentClass: resolvedParent,
        parameters,
        returnType,
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
// ─── Classes & Structs ────────────────────────────────────────────────────────
function extractClassesAndStructs(root, sourceCode, localNames) {
    const results = [];
    const classNodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['class_specifier', 'struct_specifier', 'enum_specifier']));
    for (const node of classNodes) {
        const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
        if (!nameNode)
            continue;
        const name = (0, astHelpers_1.nodeText)(nameNode);
        let kind = 'struct';
        if (node.type === 'class_specifier')
            kind = 'class';
        else if (node.type === 'enum_specifier')
            kind = 'enum';
        const superClasses = [];
        const baseClause = node.children.find((c) => c.type === 'base_class_clause');
        if (baseClause) {
            const baseTypes = (0, astHelpers_1.findAllDescendants)(baseClause, new Set(['type_identifier']));
            for (const bt of baseTypes) {
                superClasses.push((0, astHelpers_1.nodeText)(bt));
            }
        }
        const properties = [];
        const methods = [];
        const constructors = [];
        const bodyNode = (0, astHelpers_1.namedChild)(node, 'body') ?? node.children.find((c) => c.type === 'field_declaration_list');
        if (bodyNode) {
            for (let j = 0; j < bodyNode.namedChildCount; j++) {
                const item = bodyNode.namedChild(j);
                if (item.type === 'field_declaration') {
                    const fType = (0, astHelpers_1.namedChild)(item, 'type');
                    const fDecl = (0, astHelpers_1.namedChild)(item, 'declarator');
                    if (fDecl) {
                        const fName = extractDeclaratorName(fDecl);
                        if (fName) {
                            properties.push({
                                name: fName,
                                type: fType ? (0, astHelpers_1.nodeText)(fType) : undefined,
                                isStatic: false,
                                range: (0, astHelpers_1.nodeRange)(item),
                            });
                        }
                    }
                }
                else if (item.type === 'function_definition') {
                    const method = parseFunctionDefinition(item, name, sourceCode, localNames);
                    if (method) {
                        if (method.name === name) {
                            constructors.push(method);
                        }
                        else {
                            methods.push(method);
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
// ─── Variables & Defines ──────────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (node.type === 'preproc_def') {
            const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
            const valNode = (0, astHelpers_1.namedChild)(node, 'value');
            if (nameNode) {
                results.push({
                    name: (0, astHelpers_1.nodeText)(nameNode),
                    kind: 'constant',
                    initialValue: valNode ? (0, astHelpers_1.nodeText)(valNode) : undefined,
                    isExported: true,
                    range: (0, astHelpers_1.nodeRange)(node),
                    docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                });
            }
        }
        else if (node.type === 'declaration') {
            const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
            const declNode = (0, astHelpers_1.namedChild)(node, 'declarator');
            if (declNode) {
                const name = extractDeclaratorName(declNode);
                if (name) {
                    results.push({
                        name,
                        kind: 'variable',
                        type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                        isExported: true,
                        range: (0, astHelpers_1.nodeRange)(node),
                        docComment: (0, astHelpers_1.getPrecedingDocComment)(node),
                    });
                }
            }
        }
    }
    return results;
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(functions, classes, variables) {
    const exports = [];
    for (const fn of functions) {
        if (!fn.parentClass && !fn.isStatic) {
            exports.push({
                name: fn.name,
                kind: 'function',
                isDefault: false,
                range: fn.range,
            });
        }
    }
    for (const cls of classes) {
        exports.push({
            name: cls.name,
            kind: cls.kind === 'struct' ? 'class' : 'class',
            isDefault: false,
            range: cls.range,
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
exports.cExtractor = {
    languageId: 'c',
    extensions: ['c', 'h'],
    wasmFile: 'tree-sitter-c.wasm',
    sourceExtensions: ['h', 'c'],
    indexFiles: [],
    extract,
};
exports.cppExtractor = {
    languageId: 'cpp',
    extensions: ['cpp', 'hpp', 'cc', 'cxx', 'hxx', 'hh'],
    wasmFile: 'tree-sitter-cpp.wasm',
    sourceExtensions: ['hpp', 'h', 'cpp', 'cc', 'cxx'],
    indexFiles: [],
    extract,
};
//# sourceMappingURL=c_cpp.js.map