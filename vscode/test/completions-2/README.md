# Cody Completions Benchmark

These tests evaluate Cody's autocomplete feature against a dataset of incomplete code.

The dataset used is [HumanEval Infilling](https://github.com/openai/human-eval-infilling)

Each case contains:

- Prefix
- Suffix
- Test

### Commands

#### Evaluate

```
pnpm test:benchmark
```
