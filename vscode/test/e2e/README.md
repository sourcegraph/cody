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
