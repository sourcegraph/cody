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

## Diagnosing local configuration errors

Because it's easy to accidentally override the site-config when running locally, the 
`LocalSGInstance` helper will try to detect if the site-config is incorrect, throwing an 
error if that's the case. As it runs in a `beforeAll`, it will catch issues even if the 
site-config is inadvertently overwritten (for example by a manual restart).

## Minimal configuration

The minimal configuration required to run the local e2e tests is: 

### site-config

```
"completions": {
    // truncated
    "provider": "sourcegraph",
    "endpoint": "http://localhost:9992",
    "chatModel": "anthropic/claude-2",
    "completionModel": "anthropic/claude-instant-1",
    // truncated
}
```

While you can totally edit those over https://sourcegraph.test:3443/site-admin/configuration, the 
recommended method is through the escape hatch: `~/.sourcegraph/site-config.json`. Once the local
instance is running, saving that file will reload the instance.

## Running the tests 

1. In your Sourcegraph folder, run `sg start dotcom-cody-e2e`.
  1. To ensure the default site-admin is available (mandatory), still in the Sourcegraph folder you can run `sg db default-site-admin`.
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

### I want different configuration settings, can I pass those to the helper so it checks against mine instead?

Current code doesn't support this yet, but that's easy to do. Why not making a PR yourself and making it 
configurable? Please remember that sane defaults that works out of the box are really important.

### It seems that the settings are not propagated to the cody-gateway?

Perhaps try resetting the Redis instance, i.e. in the Sourcegraph folder, run `sg db reset-redis` and 
try again.

### What does `sg db default-site-admin` do exactly? 

It creates if necessary a site-admin user in your local instance, which always have the same email, username, 
password and more importantly, the same access token (`sgf_f0f0f0f0...`).
