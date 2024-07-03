# Issue Tests

This as a "low-threshold staging area" to put tests that can help replicate or diagnose a problem.

These tests don't run as part of CI. Instead, the goal is to make it easier for anyone to contribute even rough or partial test as part of every bug report.

Doing so will make diagnosing and verifying the results a lot easier for everyone.

## Rules:
- Ideally test files are named with the Linear/Github Issue ID to make it easy to find them or pull in additional context.
- Only tests explicitly marked with `only()` should run. Issue tests are by definition very tied to the specific issue someone is trying to diagnose, so running other tests would just be noise. This should already be if you extend the base test for the specific type. See [e2e/template.test.ts](./e2e/template.test.ts)
- (Optional) I'm hoping to do [some experiments soon](#sidenote-openctx-experiment). So if you can please:
  - start each test with a `//CTX(linear-issue): <linear_url>` comment
  - use the `@issue` tag and and a markdown link to the issue in the test title.
  
  


### Sidenote: OpenCtx Experiment:

I'd like to see how we can use Cody to assist with replicating issues from bug-reports. So it would be really helpful if each Issue test created contains context on what issue it was trying to demonstrate / replicate.

There is some rudimentary OpenCtx support for Linear issues [in the works](https://github.com/sourcegraph/openctx/pull/154), providing both additional context to the UI & the AI. So for now, if nothing else, it should at least make these tests a bit easier to understand. Especially as test comments and issue comments might drift.

## TODO:
- [ ] Make sure we automatically clean up tests for issues marked as closed
- [ ] Automatically tag issues in Linear that have corresponding tests
- [ ] CI fast-path to limit the amount of needless tests to run when just trying to merge a Test-Only PR
