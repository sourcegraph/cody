# Snapshot tests for tree-sitter queries

**Experimental** snapshot tests for tree-sitter queries. The main goal to foster rapid and iterative query development. By leveraging snapshot tests, developers can confidently refactor or enhance tree-sitter queries, ensuring that existing functionality remains intact and covers all the expected cases.

## Usage

- `./languages` contains the tree-sitter quries per language.
- `./test-data` contains example source files for different languages, one per tree-sitter query.
- Next to each file is a `.snap` file containing the annotated source code. Annotation highlights code matching a query.
- To generate snapshots, run `pnpm test:unit:tree-sitter-queries --watch`

The underlying command:

```sh
pnpm vitest --watch vscode/src/tree-sitter/query-tests/**/*.test.ts
```

### Annotation format

| - query start position in the source file.
█ – query start position in the annotated file.
^ – characters matching the last query result.`
