# Code Parser

A lightweight codebase dependency parser that scans project files, detects local imports, resolves file paths, and generates graph-compatible JSON.

## Features

- Detects JavaScript, TypeScript and Python files.
- Extracts local import statements.
- Resolves imports to actual files.
- Generates nodes and directed edges.
- Ignores external packages.
- Compatible with AntV G6 and Cytoscape.js.

## Requirements

- Node.js
- npm

## Installation

Clone the repository:
```
git clone YOUR_GITHUB_REPOSITORY_URL
cd code-parser
```

Install dependencies:
```
npm install
```

Build:
```
npm run build
```

## Usage
```
const { buildDependencyGraph } = require('./dist/index.js');

async function main() {
  const graph = await buildDependencyGraph('/path/to/your/project');

  console.log(JSON.stringify(graph, null, 2));
}

main();
```

## Output Format
```
{
  "nodes": [
    { "id": "src/App.tsx" },
    { "id": "src/Navbar.tsx" }
  ],
  "edges": [
    {
      "source": "src/App.tsx",
      "target": "src/Navbar.tsx"
    }
  ]
}
```

- `nodes`: Detected project files.
- `edges`: Importing file → imported file.

## License

MIT