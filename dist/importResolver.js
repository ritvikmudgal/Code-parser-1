"use strict";
/**
 * @module importResolver
 * Resolves local import specifiers to existing relative file paths.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalSpecifier = isLocalSpecifier;
exports.resolveLocalImport = resolveLocalImport;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const DEFAULT_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'py'];
const DEFAULT_INDEX_FILES = [
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'index.mjs',
    'index.cjs',
    '__init__.py',
];
/**
 * Determine if a specifier is a local relative import or resolves to a local file.
 * Ignores third-party packages like 'react', 'express', 'os', 'json', 'rumps', etc.
 */
function isLocalSpecifier(specifier, fromAbsFile, projectRoot) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
        return true;
    }
    if (fromAbsFile && projectRoot) {
        return resolveLocalImport(specifier, fromAbsFile, projectRoot) !== null;
    }
    return false;
}
/**
 * Resolves a local import specifier to its actual relative path within the project.
 * Checks relative imports and bare imports that exist locally in the project.
 * Returns null if the import cannot be resolved or is external.
 */
function resolveLocalImport(specifier, fromAbsFile, projectRoot, extensions = DEFAULT_EXTENSIONS, indexFiles = DEFAULT_INDEX_FILES) {
    const baseDir = path.dirname(fromAbsFile);
    // Normalize Python-style relative imports: e.g. .sensors -> ./sensors, ..utils -> ../utils
    const normalized = specifier.startsWith('.') && !specifier.startsWith('./') && !specifier.startsWith('../')
        ? specifier.replace(/^(\.+)/, '$1/')
        : specifier;
    const candidates = [];
    if (normalized.startsWith('/')) {
        candidates.push(path.resolve(projectRoot, normalized.slice(1)));
    }
    else if (normalized.startsWith('.')) {
        candidates.push(path.resolve(baseDir, normalized));
        if (normalized.slice(2).includes('.')) {
            const relWithSlashes = normalized.startsWith('./')
                ? './' + normalized.slice(2).replace(/\./g, '/')
                : '../' + normalized.slice(3).replace(/\./g, '/');
            candidates.push(path.resolve(baseDir, relWithSlashes));
        }
    }
    else {
        // Bare import (e.g. Python 'import sensors', 'import pkg.module')
        // Check relative to current file's directory first, then project root
        const relAsPath = normalized.replace(/\./g, '/');
        candidates.push(path.resolve(baseDir, normalized));
        if (relAsPath !== normalized) {
            candidates.push(path.resolve(baseDir, relAsPath));
        }
        candidates.push(path.resolve(projectRoot, normalized));
        if (relAsPath !== normalized) {
            candidates.push(path.resolve(projectRoot, relAsPath));
        }
    }
    for (const candidate of candidates) {
        // 1. Direct file match
        if (isFile(candidate)) {
            return normalizeRelPath(projectRoot, candidate);
        }
        // 2. Candidate + extension
        for (const ext of extensions) {
            const withExt = `${candidate}.${ext}`;
            if (isFile(withExt)) {
                return normalizeRelPath(projectRoot, withExt);
            }
        }
        // 3. Candidate directory + index file
        if (isDirectory(candidate)) {
            for (const indexFile of indexFiles) {
                const indexPath = path.join(candidate, indexFile);
                if (isFile(indexPath)) {
                    return normalizeRelPath(projectRoot, indexPath);
                }
            }
        }
    }
    return null;
}
function isFile(p) {
    try {
        return fs.statSync(p).isFile();
    }
    catch {
        return false;
    }
}
function isDirectory(p) {
    try {
        return fs.statSync(p).isDirectory();
    }
    catch {
        return false;
    }
}
function normalizeRelPath(root, absPath) {
    const rel = path.relative(root, absPath);
    return rel.replace(/\\/g, '/');
}
//# sourceMappingURL=importResolver.js.map