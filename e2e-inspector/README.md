# Cody end-to-end quality evaluation results inspector

Inspect and visualize the results from running the Cody E2E quality evaluation suite.

- View test results across multiple runs,
- Aggregate quality metrics (incorrect or partial answers, missing facts, hallucinations),
- Sort by quality metrics and filter by label and codebase.

## Running the inspector

1. You will need the output of the `e2e` tests stored in a JSON file. See the `e2e` package for further instructions.
2. Run the following commands:

```sh
cd e2e-inspector
pnpm run start
# Navigate to http://127.0.0.1:4173
```

3. In the UI, select the JSON results file and explore the test results.

## Development

```sh
cd e2e-inspector
pnpm run dev
# Navigate to http://127.0.0.1:5173
```
