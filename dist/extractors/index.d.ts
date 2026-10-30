/**
 * @module extractors
 * Re-exports and registers all built-in language extractors.
 */
import { typescriptExtractor, tsxExtractor, javascriptExtractor, jsxExtractor } from './typescript';
import { pythonExtractor } from './python';
import { javaExtractor } from './java';
import { goExtractor } from './go';
import { rustExtractor } from './rust';
import { cExtractor, cppExtractor } from './c_cpp';
import { csharpExtractor } from './csharp';
import { rubyExtractor } from './ruby';
import { phpExtractor } from './php';
/**
 * Register all built-in extractors with the language registry.
 * This should be called once during parser initialization.
 */
export declare function registerBuiltinExtractors(): void;
export { typescriptExtractor, tsxExtractor, javascriptExtractor, jsxExtractor, pythonExtractor, javaExtractor, goExtractor, rustExtractor, cExtractor, cppExtractor, csharpExtractor, rubyExtractor, phpExtractor, };
//# sourceMappingURL=index.d.ts.map