"use strict";
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const index_1 = require("../index");
async function test() {
    const fixtureDir = path.resolve(__dirname, '../../test_project');
    if (fs.existsSync(fixtureDir))
        fs.rmSync(fixtureDir, { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src/components'), { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'src/App.tsx'), `
import React from 'react';
import { Navbar } from './components/Navbar';
import axios from 'axios';
export const App = () => <Navbar />;
`);
    fs.writeFileSync(path.join(fixtureDir, 'src/components/Navbar.tsx'), `
import { Button } from './Button';
export const Navbar = () => <Button />;
`);
    fs.writeFileSync(path.join(fixtureDir, 'src/components/Button.tsx'), `
export const Button = () => <button>Click</button>;
`);
    fs.writeFileSync(path.join(fixtureDir, 'src/main.py'), `
import os
import json
import helper
from .components.widget import Widget
`);
    fs.writeFileSync(path.join(fixtureDir, 'src/helper.py'), `# helper\n`);
    fs.writeFileSync(path.join(fixtureDir, 'src/components/widget.py'), `# widget\n`);
    const graph = await (0, index_1.buildDependencyGraph)(fixtureDir);
    console.log('Generated Graph:', JSON.stringify(graph, null, 2));
    // Assertions
    const nodeIds = graph.nodes.map((n) => n.id);
    if (!nodeIds.includes('src/App.tsx') || !nodeIds.includes('src/components/Navbar.tsx')) {
        throw new Error('Missing expected nodes');
    }
    // React & Axios & os & json should NOT be in nodes or edges
    if (nodeIds.some((id) => id.includes('react') || id.includes('axios') || id === 'os' || id === 'json')) {
        throw new Error('External packages should not be nodes');
    }
    const hasEdge1 = graph.edges.some((e) => e.source === 'src/App.tsx' && e.target === 'src/components/Navbar.tsx');
    const hasEdge2 = graph.edges.some((e) => e.source === 'src/components/Navbar.tsx' && e.target === 'src/components/Button.tsx');
    const hasPyEdge1 = graph.edges.some((e) => e.source === 'src/main.py' && e.target === 'src/helper.py');
    const hasPyEdge2 = graph.edges.some((e) => e.source === 'src/main.py' && e.target === 'src/components/widget.py');
    if (!hasEdge1 || !hasEdge2 || !hasPyEdge1 || !hasPyEdge2) {
        throw new Error('Missing expected dependency edges');
    }
    // ─── extractImportSpecifiers Test ──────────────────────────────────────────
    const { extractImportSpecifiers } = await Promise.resolve().then(() => __importStar(require('../index')));
    const pySample = `
import sensors
import sensors, os
from sensors import c_to_f
from . import utils
from .sensors import c_to_f
`;
    const pyResults = extractImportSpecifiers(pySample);
    if (!pyResults.includes('sensors') ||
        !pyResults.includes('os') ||
        !pyResults.includes('.') ||
        !pyResults.includes('utils') ||
        !pyResults.includes('.sensors')) {
        throw new Error('Python import extraction failed: ' + JSON.stringify(pyResults));
    }
    const jsSample = `
import React from 'react';
import { Navbar } from './components/Navbar';
import axios from 'axios';
export { Button } from './Button';
const config = require('./config');
const asyncMod = await import('./asyncMod');
`;
    const jsResults = extractImportSpecifiers(jsSample);
    if (!jsResults.includes('react') ||
        !jsResults.includes('./components/Navbar') ||
        !jsResults.includes('axios') ||
        !jsResults.includes('./Button') ||
        !jsResults.includes('./config') ||
        !jsResults.includes('./asyncMod')) {
        throw new Error('JS/TS import extraction failed: ' + JSON.stringify(jsResults));
    }
    // Cleanup
    fs.rmSync(fixtureDir, { recursive: true });
    console.log('✓ All dependency graph & import extraction tests passed successfully!');
}
test().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=smoke.js.map