"use strict";
/**
 * @module code-parser
 * Lightweight static file dependency parser for VS Code extensions.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImportSpecifiers = exports.buildDependencyGraph = exports.isLocalSpecifier = exports.resolveLocalImport = void 0;
__exportStar(require("./types"), exports);
var importResolver_1 = require("./importResolver");
Object.defineProperty(exports, "resolveLocalImport", { enumerable: true, get: function () { return importResolver_1.resolveLocalImport; } });
Object.defineProperty(exports, "isLocalSpecifier", { enumerable: true, get: function () { return importResolver_1.isLocalSpecifier; } });
var dependencyParser_1 = require("./dependencyParser");
Object.defineProperty(exports, "buildDependencyGraph", { enumerable: true, get: function () { return dependencyParser_1.buildDependencyGraph; } });
Object.defineProperty(exports, "extractImportSpecifiers", { enumerable: true, get: function () { return dependencyParser_1.extractImportSpecifiers; } });
//# sourceMappingURL=index.js.map