# Cody E2E Testing

These tests interact with the VScode user interface and test Cody from a mock server through to VScode UI.

## Commands

### All Tests

```sh
pnpm test:e2e
```

### Individual Test

```sh
pnpm test:e2e $TEST_FILE_NAME
```

### Debug Test

```sh
# Run all tests in debug mode
pnpm test:e2e --debug

# Run a specific test in debug mode
pnpm test:e2e $TEST_FILE_NAME  --debug
```

## Notes

1. Flakiness in tests can often be attributed to timing issues, such as asynchronous actions taking longer than expected to complete. By performing a hover action before a click action, you give the application a bit more time to react and stabilize before attempting the subsequent click. This can help mitigate timing-related flakiness.

   Example:

   ```
   await page.getByLabel('.vscode', { exact: true }).hover()
   await page.getByLabel('.vscode', { exact: true }).click()
   ```
