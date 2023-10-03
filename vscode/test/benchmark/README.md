# Cody Benchmark Evaluation

This is a benchmark suite that allows us to run Cody against automated code examples with known solutions.

## Usage

**Benchmarking Cody:**

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa

pnpm run test:benchmark
```

**Benchmarking Cody + Copilot:**

The script will run Cody against all benchmark cases, and then run Copilot against the same cases.

We cannot programmatically authenticate with Copilot yet, so the script will pause when Copilot is installed. You need to click the Copilot "Sign in" notification manually in the opened VS Code window, and then the "Resume benchmark suite" notification to continue with the tests.

**Note:** There is currently a bug where authentication state is not shared across VS Code instances in these tests. This means that we need to sign in manually for each test case. This takes too long right now so we should debug and fix this.

**Note:** Copilot uses a URL-based authentication flow. VS Code often struggles to open the correct VS Code window when returning to the editor. If you run into issues, you should try closing all other VS Code windows and try from a separate terminal.

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa

pnpm run test:benchmark:copilot
```

### Environment reference

`BENCHMARK_ENDPOINT`: The endpoint to authenticate against.

`BENCHMARK_ACCESS_TOKEN`: The authentication token to provide to the endpoint.

`BENCHMARK_DATASET`: The dataset directory to benchmark against. Scoped within the `./datasets` directory.
Can either be a specific case, e.g. `BENCHMARK_DATASET=api-invocation/internal-api-closed-file-multiple-args`, or multiple cases e.g. `BENCHMARK_DATASET=api-invocation`. Defaults to all datasets.

`BENCHMARK_COMPARE_WITH`: An alternative extension to benchmark against the same dataset. Will be downloaded from the VS Code marketplace before the tests start. Case-by-case comparisons can be viewed in the console after the tests have finished executing.
e.g. `BENCHMARK_COMPARE_WITH=GitHub.copilot`

## Architecture

LLMs are very difficult to evaluate. This suite attempts to fix this by prompting Cody to generate code from a **"masked" code example**. Given we know the actual solution, we can then **run a prewritten test** against the newly generated code to see if Cody produced a correct result.

The benchmark suite **generates code directly through running Cody in VS Code**. Cody currently relies on many in-editor APIs, running this directly through an editor means **we can focus less on mocking editor APIs** and more on producing new benchmark cases with relatively low friction. In the future, we may want to move or replicate these tests directly through Cody Agent. Alternatively we may want to extend this approach to support running this suite against other editors. One specific benefit to running inside an editor is that we can also run the exact same script, against the same benchmark cases, using a different extension. This means we can compare how Cody performs directly against competitors.

The benchmark suite **evaluates generated code by running an arbitary `testCommand` inside a Docker container**. If the command exits successfully, we consider the generated code to have passed the test, otherwise it has failed. Running inside a Docker container means we can ensure specific test commands are installed, regardless of who is running the benchmark. It also gives us a greater amount of safety, as it means we can execute the LLM-generated code in an isolated environment.

## Adding a new benchmark case

Benchmark cases are defined in the `/datasets` folder in this directory. Each case should have a `config.json` file that looks something like this:

```json
{
  "entryFile": "index.ts",
  "openFiles": [],
  "closedFiles": [],
  "solutionFile": "solution.ts",
  "testFile": "test.ts",
  "testCommand": "ts-node"
}
```

**entryFile**: This is the file that Cody will generate its completion in. It should define the exact position for Cody's completion using the placeholder character: `◆``. You can see other cases for examples of this.

**openFiles**: These are files that should be opened before Cody generates its completion. This can be used as a way of providing additional context to Cody.

**closedFiles**: These are files that exist in the editor, but are not open. Cody may still use these as context, but not directly because they have already been opened.

**solutionFile**: This is the file with the completed solution code that we want Cody to write. **It is not provided to Cody at completion time**. It is primarily as reference example for evaluating Cody's output manually and validating any tests. In the future, we may want to use this as an evaluation point by using edit similarity (ES) and exact match (EM) metrics.

**testFile**: This is the file that will be used to evaluate Cody's completion. It should point at the `entryFile` when running the test, but you should be able to validate the test is correct by manually pointing it at the `solutionFile`.

**testCommand**: This is the command that should be used in order to run the test in `testFile`. This can be any command, which means we can be flexible when testing things across language (e.g. the `python` command for Python completions). If you are adding a new `testCommand`, **you need to ensure a valid executable has been installed in the test container**. If you need to add a new executable, you can do so here: `./datasets/Dockerfile`.

## Configuring the benchmark suite

The benchmark suite can be configured differently depending on your needs. Every benchmark case will inherit the file: `vscode/test/benchmark/fixtures/workspace/settings.json`. You can add new editor settings and change Cody-specific settings to support enabling feature flags, trialing different models and more.
