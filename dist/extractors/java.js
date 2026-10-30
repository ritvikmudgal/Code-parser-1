"use strict";
/**
 * @module extractors/java
 * Language extractor for Java.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.javaExtractor = void 0;
const astHelpers_1 = require("../astHelpers");
function extract(tree, sourceCode, filePath, _projectRoot) {
    const root = tree.rootNode;
    const localNames = new Set();
    gatherNames(root, localNames);
    return {
        imports: extractImports(root),
        exports: extractExports(root),
        functions: [],
        classes: extractClasses(root, localNames),
        variables: extractVariables(root),
        comments: (0, astHelpers_1.collectComments)(root),
        syntaxErrors: (0, astHelpers_1.collectSyntaxErrors)(root, sourceCode),
    };
}
function gatherNames(root, names) {
    const types = new Set(['method_declaration', 'constructor_declaration']);
    for (const node of (0, astHelpers_1.findAllDescendants)(root, types)) {
        const n = (0, astHelpers_1.namedChild)(node, 'name');
        if (n)
            names.add((0, astHelpers_1.nodeText)(n));
    }
}
// ─── Imports ──────────────────────────────────────────────────────────────────
function extractImports(root) {
    const nodes = (0, astHelpers_1.findAllDescendants)(root, new Set(['import_declaration']));
    return nodes.map((node) => {
        const raw = (0, astHelpers_1.nodeText)(node);
        const isStatic = raw.includes('static');
        const isWildcard = raw.includes('*');
        // Extract the scoped identifier
        const scopedNode = (0, astHelpers_1.findAllDescendants)(node, new Set(['scoped_identifier', 'identifier']))[0];
        const rawSpecifier = scopedNode ? (0, astHelpers_1.nodeText)(scopedNode) : raw.replace(/^import\s+(static\s+)?/, '').replace(/;\s*$/, '');
        const parts = rawSpecifier.split('.');
        const lastPart = parts[parts.length - 1] ?? rawSpecifier;
        return {
            rawSpecifier,
            resolvedPath: null,
            isExternal: true,
            symbols: isWildcard
                ? [{ name: '*', isDefault: false }]
                : [{ name: lastPart, isDefault: false }],
            isNamespace: isWildcard,
            isSideEffect: false,
            range: (0, astHelpers_1.nodeRange)(node),
            raw,
        };
    });
}
// ─── Exports ──────────────────────────────────────────────────────────────────
function extractExports(root) {
    const results = [];
    // In Java, public top-level classes/interfaces are effectively exports
    const classTypes = new Set(['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration']);
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (classTypes.has(node.type)) {
            const modifiers = getModifiers(node);
            if (modifiers.includes('public')) {
                const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
                results.push({
                    name: nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<anonymous>',
                    kind: node.type.includes('interface') ? 'interface' : node.type.includes('enum') ? 'enum' : 'class',
                    isDefault: false,
                    range: (0, astHelpers_1.nodeRange)(node),
                });
            }
        }
    }
    return results;
}
// ─── Classes ──────────────────────────────────────────────────────────────────
function extractClasses(root, localNames) {
    const classTypes = new Set([
        'class_declaration',
        'interface_declaration',
        'enum_declaration',
        'record_declaration',
    ]);
    const results = [];
    for (let i = 0; i < root.namedChildCount; i++) {
        const node = root.namedChild(i);
        if (classTypes.has(node.type)) {
            results.push(buildClassInfo(node, localNames));
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
    if (node.type === 'enum_declaration')
        kind = 'enum';
    const modifiers = getModifiers(node);
    if (modifiers.includes('abstract'))
        kind = 'abstract_class';
    // Superclass
    const superClasses = [];
    const superclassNode = (0, astHelpers_1.namedChild)(node, 'superclass');
    if (superclassNode) {
        const typeNode = superclassNode.namedChild(0) ?? superclassNode;
        superClasses.push((0, astHelpers_1.nodeText)(typeNode));
    }
    // Interfaces
    const interfaces = [];
    const interfacesNode = (0, astHelpers_1.namedChild)(node, 'interfaces');
    if (interfacesNode) {
        const typeList = (0, astHelpers_1.namedChild)(interfacesNode, 'type_list') ?? interfacesNode;
        for (let i = 0; i < typeList.namedChildCount; i++) {
            interfaces.push((0, astHelpers_1.nodeText)(typeList.namedChild(i)));
        }
    }
    // extends for interfaces
    const extendsNode = node.children.find((c) => c.type === 'extends_interfaces');
    if (extendsNode) {
        const typeList = (0, astHelpers_1.namedChild)(extendsNode, 'type_list') ?? extendsNode;
        for (let i = 0; i < typeList.namedChildCount; i++) {
            const t = typeList.namedChild(i);
            if (t.type === 'type_identifier' || t.type === 'generic_type') {
                interfaces.push((0, astHelpers_1.nodeText)(t));
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
            if (member.type === 'method_declaration') {
                methods.push(buildMethodInfo(member, localNames, name));
            }
            else if (member.type === 'constructor_declaration') {
                constructors.push(buildMethodInfo(member, localNames, name));
            }
            else if (member.type === 'field_declaration') {
                extractFieldDeclaration(member, properties);
            }
            else if (member.type === 'class_declaration' || member.type === 'interface_declaration' || member.type === 'enum_declaration') {
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
        visibility: modifiers.find((m) => ['public', 'private', 'protected'].includes(m)),
        nestedClasses,
    };
}
function buildMethodInfo(node, localNames, parentClass) {
    const nameNode = (0, astHelpers_1.namedChild)(node, 'name');
    const name = nameNode ? (0, astHelpers_1.nodeText)(nameNode) : '<constructor>';
    const parameters = extractParameters(node);
    const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
    const returnType = typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined;
    const bodyNode = (0, astHelpers_1.namedChild)(node, 'body');
    const body = bodyNode ? (0, astHelpers_1.nodeText)(bodyNode) : '';
    const calls = bodyNode ? (0, astHelpers_1.extractCallsFromBody)(bodyNode, localNames) : [];
    const objectsAccessed = bodyNode ? (0, astHelpers_1.extractObjectsAccessed)(bodyNode) : [];
    const modifiers = getModifiers(node);
    const visibility = modifiers.find((m) => ['public', 'private', 'protected'].includes(m));
    const decorators = (0, astHelpers_1.collectDecorators)(node);
    const docComment = (0, astHelpers_1.getPrecedingDocComment)(node);
    return {
        name,
        parentClass,
        parameters,
        returnType,
        body,
        range: (0, astHelpers_1.nodeRange)(node),
        calls,
        objectsAccessed,
        isAsync: modifiers.includes('synchronized'), // Java doesn't have async, but synchronized is analogous
        isStatic: modifiers.includes('static'),
        visibility,
        decorators,
        nestedFunctions: [],
        docComment,
    };
}
function extractParameters(node) {
    const paramsNode = (0, astHelpers_1.namedChild)(node, 'parameters') ?? (0, astHelpers_1.namedChild)(node, 'formal_parameters');
    if (!paramsNode)
        return [];
    const params = [];
    for (let i = 0; i < paramsNode.namedChildCount; i++) {
        const param = paramsNode.namedChild(i);
        if (param.type === 'formal_parameter' || param.type === 'spread_parameter') {
            const typeNode = (0, astHelpers_1.namedChild)(param, 'type');
            const nameNode = (0, astHelpers_1.namedChild)(param, 'name');
            params.push({
                name: nameNode ? (0, astHelpers_1.nodeText)(nameNode) : (0, astHelpers_1.nodeText)(param),
                type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
                isRest: param.type === 'spread_parameter',
            });
        }
    }
    return params;
}
function extractFieldDeclaration(node, properties) {
    const typeNode = (0, astHelpers_1.namedChild)(node, 'type');
    const modifiers = getModifiers(node);
    const visibility = modifiers.find((m) => ['public', 'private', 'protected'].includes(m));
    const isStatic = modifiers.includes('static');
    const isReadonly = modifiers.includes('final');
    const declarators = (0, astHelpers_1.findAllDescendants)(node, new Set(['variable_declarator']));
    for (const decl of declarators) {
        const nameNode = (0, astHelpers_1.namedChild)(decl, 'name');
        const valueNode = (0, astHelpers_1.namedChild)(decl, 'value');
        properties.push({
            name: nameNode ? (0, astHelpers_1.nodeText)(nameNode) : (0, astHelpers_1.nodeText)(decl),
            type: typeNode ? (0, astHelpers_1.nodeText)(typeNode) : undefined,
            defaultValue: valueNode ? (0, astHelpers_1.nodeText)(valueNode) : undefined,
            visibility,
            isStatic,
            isReadonly,
            range: (0, astHelpers_1.nodeRange)(node),
        });
    }
}
// ─── Variables ────────────────────────────────────────────────────────────────
function extractVariables(root) {
    // Java doesn't have top-level variables (outside classes), but we handle package-level
    return [];
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function getModifiers(node) {
    const modifiers = [];
    const modNode = node.children.find((c) => c.type === 'modifiers');
    if (modNode) {
        for (let i = 0; i < modNode.childCount; i++) {
            const child = modNode.child(i);
            if (child.type === 'marker_annotation' || child.type === 'annotation') {
                // Skip annotations, handled by collectDecorators
            }
            else {
                modifiers.push((0, astHelpers_1.nodeText)(child));
            }
        }
    }
    // Also check direct children for modifiers (some grammars)
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        const text = (0, astHelpers_1.nodeText)(child);
        if (['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native', 'default'].includes(text)) {
            if (!modifiers.includes(text))
                modifiers.push(text);
        }
    }
    return modifiers;
}
// ─── Extractor ────────────────────────────────────────────────────────────────
exports.javaExtractor = {
    languageId: 'java',
    extensions: ['java'],
    wasmFile: 'tree-sitter-java.wasm',
    sourceExtensions: ['java'],
    indexFiles: [],
    extract,
};
//# sourceMappingURL=java.js.map