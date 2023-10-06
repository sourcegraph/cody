# Cody Benchmark Evaluation

This is a benchmark suite that allows us to run Cody against automated code examples with known solutions.

## Usage

**Benchmarking Cody:**

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa

pnpm run test:benchmark
```

**Benchmarking Cody on a specific dataset:**

You will often want to run Cody against a specific dataset. This can be helpful for running a series of small benchmarks, or even quickly evaluating against a specific benchmark.

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa
export BENCHMARK_DATASET=./test/benchmark/datasets/api-invocation

pnpm run test:benchmark
```

**Benchmarking Cody on external datasets:**

We have some external, larger datasets (e.g. HumanEval), defined in the [cody-evaluation-datasets](https://github.com/sourcegraph/cody-evaluation-datasets) repository. You can still provide these to the benchmark script by ensuring you have that repository cloned, and provding the path to the relevant dataset.

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa
export BENCHMARK_DATASET=../../cody-evaluation-datasets/human-eval-infill-single-line

pnpm run test:benchmark
```

**Benchmarking Cody + Copilot:**

The script will run Cody against all benchmark cases, and then run Copilot against the same cases.

To programatically authenticate with Copilot, you need a valid user-to-server token. This will typically already be stored on your machine.

```shell
cat ~/.config/github-copilot/hosts.json
```

Take the `oauth_token` from this file and set a new environment variable:

```shell
export BENCHMARK_COPILOT_TOKEN=ghu_aaaaaaaaaaaaaa
```

Finally provide Cody specific environment variables, and run the benchmark script that also includes Copilot:

```shell
export BENCHMARK_ENDPOINT=https://sourcegraph.com
export BENCHMARK_ACCESS_TOKEN=sgp_aaaaaaaaaaaaaaaa

pnpm run test:benchmark:copilot
```

### Environment reference

`BENCHMARK_ENDPOINT`: The endpoint to authenticate against.

`BENCHMARK_ACCESS_TOKEN`: The authentication token to provide to the endpoint.

`BENCHMARK_DATASET`: The path to the dataset directory to benchmark against, relative to the current directory.
Can either be a specific case, e.g. `BENCHMARK_DATASET=./test/benchmark/datasets/api-invocation/internal-api-closed-file-multiple-args`, or multiple cases e.g. `BENCHMARK_DATASET=./test/benchmark/datasets/api-invocation`. Defaults to all datasets within `./test/benchmark/datasets`.

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
  "testCommand": "ts-node test.ts"
}
```

**entryFile**: This is the file that Cody will generate its completion in. It should define the exact position for Cody's completion using the placeholder character: `◆``. You can see other cases for examples of this.

**openFiles** (Optional): These are files that should be opened before Cody generates its completion. This can be used as a way of providing additional context to Cody. You do not need to specify the `entryFile` here, as Cody will automatically open this file.

**closedFiles** (Optional): These are files that exist in the editor, but are not open. Cody may still use these as context, but not directly because they have already been opened.

**solutionFile** (Optional): This is the file with the completed solution code that we want Cody to write. **It is not provided to Cody at completion time**. It is primarily as reference example for evaluating Cody's output manually and validating any tests. In the future, we may want to use this as an evaluation point by using edit similarity (ES) and exact match (EM) metrics.

**testFile** (Optional): This is the file that will be used to evaluate Cody's completion. It should point at the `entryFile` when running the test, but you should be able to validate the test is correct by manually pointing it at the `solutionFile`. Despite `testCommand` being required, this is an optional value as you may want to evaluate the output using just a single command (e.g. `go build main.go`)

**testCommand**: This is the command that should be used to determine if the generated code is correct. This can be any command, which means we can be flexible when testing things across language (e.g. the `python` command for Python completions). If you are adding a new `testCommand`, **you need to ensure a valid executable has been installed in the test container**. If you need to add a new executable, you can do so here: `./datasets/Dockerfile`.

## Configuring the benchmark suite

The benchmark suite can be configured differently depending on your needs. Every benchmark case will inherit the file: `vscode/test/benchmark/fixtures/workspace/settings.json`. You can add new editor settings and change Cody-specific settings to support enabling feature flags, trialing different models and more.
