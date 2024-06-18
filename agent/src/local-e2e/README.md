# Local E2E tests 

Local E2E tests are providing an entry point to reproduce customer issues by writing E2E tests against 
the entire stack running locally, including the Cody gateway. It takes care of the plumbing so you can 
focus on the actual problem. 

## Overview 

For example, let's say we've got a bug report from customer X mentioning that <relevant anecdote, ask Olaf>. 
Before even attempting at fixing the problem, the first step should always to reproduce the problem. 

Whenever we skip that step and jump straight into writing a fix, we're taking a bet because we're making a of lot 
of assumptions that we cannot verify until it ends up being QA'ed in the best scenario and in the worse one
in the hands of a customer. 

The local E2E tests are meant to fill that gap:

1. Run a Sourcegraph instance that approximate their setup (version, site-config, etc..) 
1. Write a test case to reproduce the problem.
1. Commit that test.
1. Try solving the problem. 
  - If we need a bunch of print statements on the Sourcegraph instance side, we add them.
1. Iterate until it fixes the solution.
1. Turn that into proper e2e test. 
1. Remove or comment out our local E2E test.
1. Submit the PR. 

## Running the tests 

1. In your Sourcegraph folder, run `sg start dotcom`.
1. Back to the Cody repo, run `pnpm run test:local-e2e`

## FAQ 

### Why write a test if I'm going to throw it away?

First, because it's a starting point. Even if you can't solve the problem, you can at least try
to reproduce the prolbem and just share that with your teammates. 

And second, the final integration/e2e test that will be shipped with the fix will most likely 
be a tweaked version of that initial test. So it's not wasted work, it's more like a draft.

### Should I merge in `main` the local E2E test case I wrote for my PR?

Sometimes, we want to be really sure that something is working, so we don't want recorded responses,
because we value confidence over speed. Yet, we don't want to cripple the CI with lenghty E2E tests 
which are covering a specific case. 

If all it takes to be confident is to checkout `sourcegraph/sourcegraph` on a given version and run 
a command here, then it's a win and we should commit that local E2E test.

