"use strict";
/**
 * @module extractors
 * Re-exports and registers all built-in language extractors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.phpExtractor = exports.rubyExtractor = exports.csharpExtractor = exports.cppExtractor = exports.cExtractor = exports.rustExtractor = exports.goExtractor = exports.javaExtractor = exports.pythonExtractor = exports.jsxExtractor = exports.javascriptExtractor = exports.tsxExtractor = exports.typescriptExtractor = void 0;
exports.registerBuiltinExtractors = registerBuiltinExtractors;
const languageRegistry_1 = require("../languageRegistry");
const typescript_1 = require("./typescript");
Object.defineProperty(exports, "typescriptExtractor", { enumerable: true, get: function () { return typescript_1.typescriptExtractor; } });
Object.defineProperty(exports, "tsxExtractor", { enumerable: true, get: function () { return typescript_1.tsxExtractor; } });
Object.defineProperty(exports, "javascriptExtractor", { enumerable: true, get: function () { return typescript_1.javascriptExtractor; } });
Object.defineProperty(exports, "jsxExtractor", { enumerable: true, get: function () { return typescript_1.jsxExtractor; } });
const python_1 = require("./python");
Object.defineProperty(exports, "pythonExtractor", { enumerable: true, get: function () { return python_1.pythonExtractor; } });
const java_1 = require("./java");
Object.defineProperty(exports, "javaExtractor", { enumerable: true, get: function () { return java_1.javaExtractor; } });
const go_1 = require("./go");
Object.defineProperty(exports, "goExtractor", { enumerable: true, get: function () { return go_1.goExtractor; } });
const rust_1 = require("./rust");
Object.defineProperty(exports, "rustExtractor", { enumerable: true, get: function () { return rust_1.rustExtractor; } });
const c_cpp_1 = require("./c_cpp");
Object.defineProperty(exports, "cExtractor", { enumerable: true, get: function () { return c_cpp_1.cExtractor; } });
Object.defineProperty(exports, "cppExtractor", { enumerable: true, get: function () { return c_cpp_1.cppExtractor; } });
const csharp_1 = require("./csharp");
Object.defineProperty(exports, "csharpExtractor", { enumerable: true, get: function () { return csharp_1.csharpExtractor; } });
const ruby_1 = require("./ruby");
Object.defineProperty(exports, "rubyExtractor", { enumerable: true, get: function () { return ruby_1.rubyExtractor; } });
const php_1 = require("./php");
Object.defineProperty(exports, "phpExtractor", { enumerable: true, get: function () { return php_1.phpExtractor; } });
/**
 * Register all built-in extractors with the language registry.
 * This should be called once during parser initialization.
 */
function registerBuiltinExtractors() {
    languageRegistry_1.registry.register(typescript_1.typescriptExtractor);
    languageRegistry_1.registry.register(typescript_1.tsxExtractor);
    languageRegistry_1.registry.register(typescript_1.javascriptExtractor);
    languageRegistry_1.registry.register(typescript_1.jsxExtractor);
    languageRegistry_1.registry.register(python_1.pythonExtractor);
    languageRegistry_1.registry.register(java_1.javaExtractor);
    languageRegistry_1.registry.register(go_1.goExtractor);
    languageRegistry_1.registry.register(rust_1.rustExtractor);
    languageRegistry_1.registry.register(c_cpp_1.cExtractor);
    languageRegistry_1.registry.register(c_cpp_1.cppExtractor);
    languageRegistry_1.registry.register(csharp_1.csharpExtractor);
    languageRegistry_1.registry.register(ruby_1.rubyExtractor);
    languageRegistry_1.registry.register(php_1.phpExtractor);
}
//# sourceMappingURL=index.js.map