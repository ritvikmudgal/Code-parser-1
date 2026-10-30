"use strict";
/**
 * @module extractors/typescript
 * Language extractor for JavaScript, TypeScript, JSX, and TSX.
 * Uses the same tree-sitter grammar family (typescript/tsx covers all).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsxExtractor = exports.javascriptExtractor = exports.tsxExtractor = exports.typescriptExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
const importResolver_1 = require("../importResolver");
// ─── Base Extractor Logic (shared by JS/TS/JSX/TSX) ──────────────────────────
function extractTypeScript(tree, sourceCode, filePath, projectRoot, resolveOptions) {
    const root = tree.rootNode;
    // Gather all top-level function names for isLocal resolution
    const topLevelFunctionNames = new Set();
    gatherFunctionNames(root, topLevelFunctionNames);
    const imports = extractImports(root, filePath, projectRoot, resolveOptions);
    const exports = extractExports(root);
    const functions = extractFunctions(root, topLevelFunctionNames);
    const classes = extractClasses(root, topLevelFunctionNames);
    const variables = extractVariables(root);
    const comments = (0, astHelpers_1.collectComments)(root);
    const syntaxErrors = (0, astHelpers_1.collectSyntaxErrors)(root, sourceCode);
    return { imports, exports, functions, classes, variables, comments, syntaxErrors };
}
// ─── Gather Function Names ───────────────────────────────────────────────────
function gatherFunctionNames(root, names) {
    const fnTypes = new Set([
        'function_declaration',
        'method_definition',
        'arrow_function',
        'function',
        'generator_function_declaration',
    ]);
    const nodes = (0, astHelpers_1.findAllDescendants)(root, fnTypes);
    for (const node of nodes) {
        const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
        if (nameNode)
            names.add((0, astHelpers_1.nodeText)(nameNode));
    }
    // Also variable declarations that hold functions
    const varTypes = new Set(['variable_declarator', 'lexical_declaration']);
    const varNodes = (0, astHelpers_1.findAllDescendants)(root, varTypes);
    for (const node of varNodes) {
        if (node.type === 'variable_declarator') {
            const valueNode = (0, astHelpers_1.namedChild)(node, 'value');
            if (valueNode &&
                (valueNode.type === 'arrow_function' || valueNode.type === 'function')) {
                const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
                if (nameNode)
                    names.add((0, astHelpers_1.nodeText)(nameNode));
            }
        }
    }
}
// ─── Imports ──────────────────────────────────────────────────────────────────
function extractImports(root, filePath, projectRoot, resolveOptions) {
    const importTypes = new Set(['import_statement', 'import_declaration']);
    const nodes = (0, astHelpers_1.findAllDescendants)(root, importTypes);
    const results = [];
    for (const node of nodes) {
        const raw = (0, astHelpers_1.nodeText)(node);
        const sourceNode = (0, astHelpers_1.namedChild)(node, 'source');
        if (!sourceNode)
            continue;
        const rawSpecifier = stripQuotes((0, astHelpers_1.nodeText)(sourceNode));
        const { resolvedPath, isExternal } = (0, importResolver_1.resolveImportPath)(rawSpecifier, filePath, projectRoot, resolveOptions);
        const symbols = [];
        let isNamespace = false;
        let isSideEffect = true;
        // Default import
        const defaultImport = node.children.find((c) => c.type === 'identifier' && c !== sourceNode);
        if (defaultImport) {
            symbols.push({ name: (0, astHelpers_1.nodeText)(defaultImport), isDefault: true });
            isSideEffect = false;
        }
        // import_clause → various forms
        const importClause = node.children.find((c) => c.type === 'import_clause');
        if (importClause) {
            isSideEffect = false;
            processImportClause(importClause, symbols);
            if (importClause.children.some((c) => c.type === 'namespace_import')) {
                isNamespace = true;
            }
        }
        // Named imports  { A, B as C }
        const namedImports = (0, astHelpers_1.findAllDescendants)(node, new Set(['import_specifier']));
        for (const spec of namedImports) {
            isSideEffect = false;
            const nameNode = (0, astHelpers_1.namedChild)(spec, 'name');
            const aliasNode = (0, astHelpers_1.namedChild)(spec, 'alias');
            if (nameNode) {
                const name = (0, astHelpers_1.nodeText)(nameNode);
                const alias = aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined;
                // Avoid duplicates
                if (!symbols.some((s) => s.name === name && s.alias === alias)) {
                    symbols.push({ name, alias, isDefault: false });
                }
            }
        }
        // Namespace import: import * as X
        const nsImport = (0, astHelpers_1.findAllDescendants)(node, new Set(['namespace_import']));
        for (const ns of nsImport) {
            isNamespace = true;
            isSideEffect = false;
            const nameNode = ns.children.find((c) => c.type === 'identifier');
            if (nameNode) {
                const name = (0, astHelpers_1.nodeText)(nameNode);
                if (!symbols.some((s) => s.name === name)) {
                    symbols.push({ name, isDefault: false });
                }
            }
        }
        results.push({
            rawSpecifier,
            resolvedPath,
            isExternal,
            symbols,
            isNamespace,
            isSideEffect: isSideEffect && symbols.length === 0,
            range: (0, astHelpers_1.nodeRange)(node),
            raw,
        });
    }
    // Also handle require() calls
    const callExpressions = (0, astHelpers_1.findAllDescendants)(root, new Set(['call_expression']));
    for (const callNode of callExpressions) {
        const fnNode = callNode.childForFieldName('function');
        if (!fnNode || (0, astHelpers_1.nodeText)(fnNode) !== 'require')
            continue;
        const argsNode = callNode.childForFieldName('arguments');
        if (!argsNode || argsNode.childCount < 2)
            continue;
        const argNode = argsNode.child(1); // skip the '('
        if (!argNode || (argNode.type !== 'string' && argNode.type !== 'template_string'))
            continue;
        const rawSpecifier = stripQuotes((0, astHelpers_1.nodeText)(argNode));
        const { resolvedPath, isExternal } = (0, importResolver_1.resolveImportPath)(rawSpecifier, filePath, projectRoot, resolveOptions);
        // Check if this require is in a variable declaration
        const parent = callNode.parent;
        const symbols = [];
        if (parent && parent.type === 'variable_declarator') {
            const nameNode = (0, astHelpers_1.namedChild)(parent, 'name');
            if (nameNode) {
                if (nameNode.type === 'object_pattern') {
                    // const { a, b } = require(...)
                    for (let i = 0; i < nameNode.namedChildCount; i++) {
                        const prop = nameNode.namedChild(i);
                        if (prop && (prop.type === 'shorthand_property_identifier_pattern' || prop.type === 'shorthand_property_identifier')) {
                            symbols.push({ name: (0, astHelpers_1.nodeText)(prop), isDefault: false });
                        }
                        else if (prop && prop.type === 'pair_pattern') {
                            const key = (0, astHelpers_1.namedChild)(prop, 'key');
                            const value = (0, astHelpers_1.namedChild)(prop, 'value');
                            if (key && value) {
                                symbols.push({ name: (0, astHelpers_1.nodeText)(key), alias: (0, astHelpers_1.nodeText)(value), isDefault: false });
                            }
                        }
                    }
                }
                else {
                    symbols.push({ name: (0, astHelpers_1.nodeText)(nameNode), isDefault: true });
                }
            }
        }
        results.push({
            rawSpecifier,
            resolvedPath,
            isExternal,
            symbols,
            isNamespace: false,
            isSideEffect: symbols.length === 0,
            range: (0, astHelpers_1.nodeRange)(callNode.parent ?? callNode),
            raw: (0, astHelpers_1.nodeText)(callNode.parent ?? callNode),
        });
    }
    return results;
}
function processImportClause(clause, symbols) {
    for (let i = 0; i < clause.childCount; i++) {
        const child = clause.child(i);
        if (child.type === 'identifier') {
            if (!symbols.some((s) => s.name === (0, astHelpers_1.nodeText)(child))) {
                symbols.push({ name: (0, astHelpers_1.nodeText)(child), isDefault: true });
            }
        }
    }
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(root) {
    const exportTypes = new Set([
        'export_statement',
        'export_declaration',
    ]);
    const nodes = (0, astHelpers_1.findAllDescendants)(root, exportTypes);
    const results = [];
    for (const node of nodes) {
        const isDefault = (0, astHelpers_1.nodeText)(node).includes('export default');
        // export function foo / export class Bar
        const declaration = (0, astHelpers_1.namedChild)(node, 'declaration');
        if (declaration) {
            const nameNode = (0, astHelpers_1.namedChild)(declaration, 'name');
            const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<default>';
            let kind = inferExportKind(declaration.type);
            results.push({ name, kind, isDefault, range: (0, astHelpers_1.nodeRange)(node) });
            continue;
        }
        // export { a, b as c }
        const exportClause = node.children.find((c) => c.type === 'export_clause');
        if (exportClause) {
            const specifiers = (0, astHelpers_1.findAllDescendants)(exportClause, new Set(['export_specifier']));
            for (const spec of specifiers) {
                const nameNode = (0, astHelpers_1.namedChild)(spec, 'name');
                const aliasNode = (0, astHelpers_1.namedChild)(spec, 'alias');
                if (nameNode) {
                    results.push({
                        name: (0, astHelpers_1.nodeText)(nameNode),
                        alias: aliasNode ? (0, astHelpers_1.nodeText)(aliasNode) : undefined,
                        kind: 'unknown',
                        isDefault: false,
                        range: (0, astHelpers_1.nodeRange)(spec),
                    });
                }
            }
            continue;
        }
        // export default expression
        if (isDefault) {
            const valueChild = node.children.find((c) => c.type !== 'export' && c.type !== 'default' && !c.type.includes('comment'));
            if (valueChild) {
                const name = (0, astHelpers_1.namedChild)(valueChild, 'name');
                results.push({
                    name: name ? (0, astHelpers_1.nodeText)(name) : '<default>',
                    kind: inferExportKind(valueChild.type),
                    isDefault: true,
                    range: (0, astHelpers_1.nodeRange)(node),
                });
            }
        }
    }
    return results;
}
function inferExportKind(nodeType) {
    if (nodeType.includes('function'))
        return 'function';
    if (nodeType.includes('class'))
        return 'class';
    if (nodeType.includes('variable') || nodeType.includes('lexical'))
        return 'variable';
    if (nodeType.includes('interface'))
        return 'interface';
    if (nodeType.includes('enum'))
        return 'enum';
    if (nodeType.includes('type_alias'))
        return 'type';
    return 'unknown';
}
// ─── Functions ────────────────────────────────────────────────────────────────
function extractFunctions(root, localNames, parentClass) {
    const fnTypes = new Set([
        'function_declaration',
        'generator_function_declaration',
        'method_definition',
    ]);
    const results = [];
    // Direct function declarations
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (fnTypes.has(node.type)) {
            results.push(buildFunctionInfo(node, localNames, parentClass));
        }
        // export statement containing a function
        if (node.type === 'export_statement' || node.type === 'export_declaration') {
            const decl = (0, astHelpers_1.namedChild)(node, 'declaration');
            if (decl && fnTypes.has(decl.type)) {
                results.push(buildFunctionInfo(decl, localNames, parentClass));
            }
        }
        // Variable declarations with arrow functions / function expressions
        if (node.type === 'lexical_declaration' ||
            node.type === 'variable_declaration') {
            extractArrowFunctions(node, localNames, results, parentClass);
        }
        if (node.type === 'export_statement' || node.type === 'export_declaration') {
            const lexDecl = node.children.find((c) => c.type === 'lexical_declaration' || c.type === 'variable_declaration');
            if (lexDecl) {
                extractArrowFunctions(lexDecl, localNames, results, parentClass);
            }
        }
    }
    return results;
}
function extractArrowFunctions(declarationNode, localNames, results, parentClass) {
    const declarators = (0, astHelpers_1.findAllDescendants)(declarationNode, new Set(['variable_declarator']));
    for (const decl of declarators) {
        const valueNode = (0, astHelpers_1.namedChild)(decl, 'value');
        if (valueNode &&
            (valueNode.type === 'arrow_function' || valueNode.type === 'function' || valueNode.type === 'function_expression')) {
            const nameNode = (0, astHelpers_1.namedChild)(decl, 'name');
            const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>';
            results.push(buildFunctionInfo(valueNode, localNames, parentClass, name));
        }
    }
}
function buildFunctionInfo(node, localNames, parentClass, overrideName) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = overrideName ?? (nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>');
    const parameters = extractParameters(node);
    const returnTypeNode = (0, astHelpers_1.namedChild)(node, 'return_type') ?? node.children.find((c) => c.type === 'type_annotation');
    const returnType = returnTypeNode ? (0, astHelpers_1.nodeText)(returnTypeNode).replace(/^:\s*/, '') : undefined;
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const body = bodyNode ? (0, astHelpers_1.nodeText)(bodyNode) : '';
    const calls = bodyNode ? (0, astHelpers_1.extractCallsFromBody)(bodyNode, localNames) : [];
    const objectsAccessed = bodyNode ? (0, astHelpers_1.extractObjectsAccessed)(bodyNode) : [];
    const raw = (0, astHelpers_1.nodeText)(node);
    const isAsync = raw.startsWith('async ') || node.children.some((c) => (0, astHelpers_1.nodeText)(c) === 'async');
    const isStatic = node.children.some((c) => (0, astHelpers_1.nodeText)(c) === 'static');
    const isGenerator = node.type.includes('generator') || raw.includes('function*');
    const visibility = extractVisibility(node);
    const decorators = (0, astHelpers_1.collectDecorators)(node);
    const docComment = (0, astHelpers_1.getPrecedingDocComment)(node);
    // Nested functions
    const nestedFunctions = [];
    if (bodyNode) {
        const nestedFnTypes = new Set([
            'function_declaration',
            'arrow_function',
            'function',
            'function_expression',
        ]);
        for (let i = 0; i < bodyNode.namedChildCount; i++) {
            const child = bodyNode.namedChild(i);
            if (nestedFnTypes.has(child.type)) {
                nestedFunctions.push(buildFunctionInfo(child, localNames, parentClass));
            }
            // Variable declarations inside body with arrow functions
            if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
                extractArrowFunctions(child, localNames, nestedFunctions, parentClass);
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
        isGenerator,
        visibility,
        decorators,
        nestedFunctions,
        docComment,
    };
}
function extractParameters(node) {
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters') ?? (0, astHelpers_1.namedChild)(node, 'formal_parameters');
    if (!paramsNode) {
        // Arrow function with single param (no parens)
        const paramNode = (0, astHelpers_1.namedChild)(node, 'parameter');
        if (paramNode) {
            return [{ name: (0, astHelpers_1.nodeText)(paramNode) }];
        }
        return [];
    }
    const params = [];
    for (let i = 0; i < paramsNode.namedChildCount; i++) {
        const param = paramsNode.namedChild(i);
        if (param.type === 'required_parameter' || param.type === 'optional_parameter' || param.type === 'formal_parameter') {
            const pNameNode = (0, astHelpers_1.namedChild)(param, 'pattern') ?? (0, astHelpers_1.namedChild)(param, 'name');
            const pTypeNode = (0, astHelpers_1.namedChild)(param, 'type');
            const pDefaultNode = (0, astHelpers_1.namedChild)(param, 'value');
            params.push({
                name: pNameNode ? (0, astHelpers_1.nodeText)(pNameNode) : (0, astHelpers_1.nodeText)(param),
                type: pTypeNode ? (0, astHelpers_1.nodeText)(pTypeNode).replace(/^:\s*/, '') : undefined,
                defaultValue: pDefaultNode ? (0, astHelpers_1.nodeText)(pDefaultNode) : undefined,
                isOptional: param.type === 'optional_parameter',
                isRest: false,
            });
        }
        else if (param.type === 'rest_parameter') {
            const pNameNode = (0, astHelpers_1.namedChild)(param, 'name') ?? (0, astHelpers_1.namedChild)(param, 'pattern');
            params.push({
                name: pNameNode ? (0, astHelpers_1.nodeText)(pNameNode) : (0, astHelpers_1.nodeText)(param).replace('...', ''),
                isRest: true,
            });
        }
        else if (param.type === 'identifier') {
            params.push({ name: (0, astHelpers_1.nodeText)(param) });
        }
        else if (param.type === 'assignment_pattern') {
            const left = (0, astHelpers_1.namedChild)(param, 'left');
            const right = (0, astHelpers_1.namedChild)(param, 'right');
            params.push({
                name: left ? (0, astHelpers_1.nodeText)(left) : (0, astHelpers_1.nodeText)(param),
                defaultValue: right ? (0, astHelpers_1.nodeText)(right) : undefined,
            });
        }
    }
    return params;
}
function extractVisibility(node) {
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        const text = (0, astHelpers_1.nodeText)(child);
        if (text === 'public' || text === 'private' || text === 'protected') {
            return text;
        }
        if (child.type === 'accessibility_modifier') {
            return (0, astHelpers_1.nodeText)(child);
        }
    }
    return undefined;
}
// ─── Classes ──────────────────────────────────────────────────────────────────
function extractClasses(root, localNames) {
    const classTypes = new Set([
        'class_declaration',
        'abstract_class_declaration',
        'interface_declaration',
        'enum_declaration',
        'type_alias_declaration',
    ]);
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (classTypes.has(node.type)) {
            results.push(buildClassInfo(node, localNames));
        }
        // Exported classes
        if (node.type === 'export_statement' || node.type === 'export_declaration') {
            const decl = (0, astHelpers_1.namedChild)(node, 'declaration');
            if (decl && classTypes.has(decl.type)) {
                results.push(buildClassInfo(decl, localNames));
            }
        }
    }
    return results;
}
function buildClassInfo(node, localNames) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>';
    let kind = 'class';
    if (node.type === 'interface_declaration')
        kind = 'interface';
    if (node.type === 'abstract_class_declaration')
        kind = 'abstract_class';
    if (node.type === 'enum_declaration')
        kind = 'enum';
    // Inheritance
    const superClasses = [];
    const interfaces = [];
    const heritage = node.children.find((c) => c.type === 'class_heritage' || c.type === 'extends_clause');
    if (heritage) {
        // extends
        const extendsTypes = (0, astHelpers_1.findAllDescendants)(heritage, new Set(['extends_type_clause', 'type_identifier', 'identifier']));
        // Simple heuristic: the first identifier after 'extends' is the superclass
        for (const t of extendsTypes) {
            if (t.type === 'type_identifier' || t.type === 'identifier') {
                superClasses.push((0, astHelpers_1.nodeText)(t));
            }
        }
    }
    // implements
    const implementsClause = node.children.find((c) => c.type === 'implements_clause');
    if (implementsClause) {
        const typeNodes = (0, astHelpers_1.findAllDescendants)(implementsClause, new Set(['type_identifier', 'identifier']));
        for (const t of typeNodes) {
            interfaces.push((0, astHelpers_1.nodeText)(t));
        }
    }
    // Body
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const methods = [];
    const properties = [];
    const constructors = [];
    const nestedClasses = [];
    if (bodyNode) {
        for (let i = 0; i < bodyNode.namedChildCount; i++) {
            const member = bodyNode.namedChild(i);
            if (member.type === 'method_definition' || member.type === 'method_signature') {
                const methodNameNode = (0, astHelpers_1.namedChild)(member, 'name');
                const methodName = methodNameNode ? (0, astHelpers_1.nodeText)(methodNameNode) : '';
                if (methodName === 'constructor') {
                    constructors.push(buildFunctionInfo(member, localNames, name));
                }
                else {
                    methods.push(buildFunctionInfo(member, localNames, name));
                }
            }
            else if (member.type === 'public_field_definition' ||
                member.type === 'field_definition' ||
                member.type === 'property_definition' ||
                member.type === 'property_signature') {
                properties.push(buildPropertyInfo(member));
            }
            else if (member.type === 'class_declaration') {
                nestedClasses.push(buildClassInfo(member, localNames));
            }
        }
    }
    const decorators = (0, astHelpers_1.collectDecorators)(node);
    const docComment = (0, astHelpers_1.getPrecedingDocComment)(node);
    return {
        name,
        kind,
        superClasses,
        interfaces,
        methods,
        properties,
        constructors,
        decorators,
        range: (0, astHelpers_1.nodeRange)(node),
        docComment,
        nestedClasses,
    };
}
function buildPropertyInfo(node) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : (0, astHelpers_1.nodeText)(node);
    const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
    const valueNode = (0, astHelpers_1.namedChild)(node, 'value');
    const visibility = extractVisibility(node);
    const isStatic = node.children.some((c) => (0, astHelpers_1.nodeText)(c) === 'static');
    const isReadonly = node.children.some((c) => (0, astHelpers_1.nodeText)(c) === 'readonly');
    return {
        name,
        type: typeNode ? (0, astHelpers_1.nodeText)(typeNode).replace(/^:\s*/, '') : undefined,
        defaultValue: valueNode ? (0, astHelpers_1.nodeText)(valueNode) : undefined,
        visibility,
        isStatic,
        isReadonly,
        range: (0, astHelpers_1.nodeRange)(node),
    };
}
// ─── Variables ────────────────────────────────────────────────────────────────
function extractVariables(root) {
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        let isExported = false;
        let targetNode = node;
        if (node.type === 'export_statement' || node.type === 'export_declaration') {
            isExported = true;
            const decl = (0, astHelpers_1.namedChild)(node, 'declaration') ?? node.children.find((c) => c.type === 'lexical_declaration' || c.type === 'variable_declaration');
            if (!decl)
                continue;
            targetNode = decl;
        }
        if (targetNode.type === 'lexical_declaration' ||
            targetNode.type === 'variable_declaration') {
            const kind = targetNode.children[0] ? (0, astHelpers_1.nodeText)(targetNode.children[0]) : 'const';
            const declarators = (0, astHelpers_1.findAllDescendants)(targetNode, new Set(['variable_declarator']));
            for (const decl of declarators) {
                const nameNode = (0, astHelpers_1.namedChild)(decl, 'name');
                const valueNode = (0, astHelpers_1.namedChild)(decl, 'value');
                // Skip if the value is a function (those are in the functions array)
                if (valueNode &&
                    (valueNode.type === 'arrow_function' || valueNode.type === 'function' || valueNode.type === 'function_expression')) {
                    continue;
                }
                if (nameNode) {
                    const typeNode = (0, astHelpers_1.namedChild)(decl, 'type') ?? decl.children.find((c) => c.type === 'type_annotation');
                    const docComment = (0, astHelpers_1.getPrecedingDocComment)(targetNode);
                    results.push({
                        name: (0, astHelpers_1.nodeText)(nameNode),
                        kind,
                        type: typeNode ? (0, astHelpers_1.nodeText)(typeNode).replace(/^:\s*/, '') : undefined,
                        initialValue: valueNode ? (0, astHelpers_1.nodeText)(valueNode) : undefined,
                        isExported,
                        range: (0, astHelpers_1.nodeRange)(targetNode),
                        docComment,
                    });
                }
            }
        }
    }
    return results;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripQuotes(s) {
    return s.replace(/^['"`]|['"`]$/g, '');
}
// ─── Extractor Instances ──────────────────────────────────────────────────────
const tsResolveOptions = {
    sourceExtensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs', 'json'],
    indexFiles: ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mts', 'index.mjs'],
};
exports.typescriptExtractor = {
    languageId: 'typescript',
    extensions: ['ts', 'mts', 'cts'],
    wasmFile: 'tree-sitter-typescript.wasm',
    sourceExtensions: tsResolveOptions.sourceExtensions,
    indexFiles: tsResolveOptions.indexFiles,
    extract: (tree, sourceCode, filePath, projectRoot) => extractTypeScript(tree, sourceCode, filePath, projectRoot, tsResolveOptions),
};
exports.tsxExtractor = {
    languageId: 'tsx',
    extensions: ['tsx'],
    wasmFile: 'tree-sitter-tsx.wasm',
    sourceExtensions: tsResolveOptions.sourceExtensions,
    indexFiles: tsResolveOptions.indexFiles,
    extract: (tree, sourceCode, filePath, projectRoot) => extractTypeScript(tree, sourceCode, filePath, projectRoot, tsResolveOptions),
};
exports.javascriptExtractor = {
    languageId: 'javascript',
    extensions: ['js', 'mjs', 'cjs'],
    wasmFile: 'tree-sitter-javascript.wasm',
    sourceExtensions: tsResolveOptions.sourceExtensions,
    indexFiles: tsResolveOptions.indexFiles,
    extract: (tree, sourceCode, filePath, projectRoot) => extractTypeScript(tree, sourceCode, filePath, projectRoot, tsResolveOptions),
};
exports.jsxExtractor = {
    languageId: 'jsx',
    extensions: ['jsx'],
    wasmFile: 'tree-sitter-javascript.wasm',
    sourceExtensions: tsResolveOptions.sourceExtensions,
    indexFiles: tsResolveOptions.indexFiles,
    extract: (tree, sourceCode, filePath, projectRoot) => extractTypeScript(tree, sourceCode, filePath, projectRoot, tsResolveOptions),
};
//# sourceMappingURL=typescript.js.map