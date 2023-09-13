# Autocomplete review tool

The autocomplete review tool let's us (manually, visually) inspect autocomplete behavior in a bunch of different code completion scenarios, with different LLM models, to see how we've affected its performance - or to see how its performs with a new LLM. This isn't an emperical analysis, just a nice way to see and compare results.

## Prerequisites

You'll need:

* A Sourcegraph API server somewhere, with Cody enabled/configured
* An access token to the GraphQL API

For example, if you are using a local development server and want to test against Azure OpenAI you would make your `dev-private` site-config.json configured as follows:

```jsonc
  "cody.enabled": true,
  "completions": {
    "accessToken": "<REDACTED>",
    "endpoint": "https://sourcegraph-test-oai.openai.azure.com/",
    "model": "gpt-3.5",
    "chatModel": "gpt-35-turbo-test",
    "completionModel": "gpt-35-turbo-test",
    "provider": "azure-openai",
    "perUserDailyLimit": 100
  },
  "embeddings": {
    "accessToken": "<REDACTED>",
    "endpoint": "https://sourcegraph-test-oai.openai.azure.com/",
    "provider": "azure-openai",
    "model": "text-embedding-ada-002-erik",
    "dimensions": 1536
  },
```

**Make sure that the Cody web interface shows you have working Chat and Embeddings on at least one repository before you continue.**

## Overriding VS Code configuration

The tool runs the same VS Code extension, so you'll need to 'configure' it to point to your Sourcegraph instance and specify any other configuration you might want. Today this is done by editing the codebase in a few places manually:

```diff
diff --git a/lib/shared/src/sourcegraph-api/environments.ts b/lib/shared/src/sourcegraph-api/environments.ts
index 772836ed..088c8770 100644
--- a/lib/shared/src/sourcegraph-api/environments.ts
+++ b/lib/shared/src/sourcegraph-api/environments.ts
@@ -1,6 +1,6 @@
 export const DOTCOM_URL = new URL('https://sourcegraph.com')
 export const INTERNAL_S2_URL = new URL('https://sourcegraph.sourcegraph.com/')
-export const LOCAL_APP_URL = new URL('http://localhost:3080')
+export const LOCAL_APP_URL = new URL('https://sourcegraph.test:3443')
 
 export function isLocalApp(url: string): boolean {
     try {
diff --git a/vscode/test/completions/mock-vscode.ts b/vscode/test/completions/mock-vscode.ts
index 38d83e28..13e9abc8 100644
--- a/vscode/test/completions/mock-vscode.ts
+++ b/vscode/test/completions/mock-vscode.ts
@@ -25,11 +25,9 @@ const vscodeMock = {
                         case 'cody.autocomplete.enabled':
                             return true
                         case 'cody.serverEndpoint':
-                            return 'https://sourcegraph.com/'
-                        // case 'cody.autocomplete.advanced.provider':
-                        //     return 'unstable-fireworks'
+                            return 'https://sourcegraph.test:3443'
+                        case 'cody.autocomplete.advanced.provider':
+                            return 'unstable-openai'
                         // case 'cody.autocomplete.advanced.model':
                         //     return 'llama-code-13b'
                         default:
                             return undefined
                     }
diff --git a/vscode/test/completions/run-code-completions-on-dataset.ts b/vscode/test/completions/run-code-completions-on-dataset.ts
index 731bfb77..13aa6afb 100644
--- a/vscode/test/completions/run-code-completions-on-dataset.ts
+++ b/vscode/test/completions/run-code-completions-on-dataset.ts
@@ -34,8 +34,8 @@ let providerConfig: ProviderConfig | null
 
 const dummyFeatureFlagProvider = new FeatureFlagProvider(
     new SourcegraphGraphQLAPIClient({
-        accessToken: 'access-token',
-        serverEndpoint: 'https://sourcegraph.com',
+        accessToken: 'REDACTED',
+        serverEndpoint: 'https://sourcegraph.test:3443',
         customHeaders: {},
     })
 )
```

## Generating data

The first part of running the tool is generating a JSON blob with the completion results:

```sh
cd cody/vscode/
export SOURCEGRAPH_ACCESS_TOKEN='REDACTED'
export NODE_TLS_REJECT_UNAUTHORIZED=0
pnpm run generate:completions
```

You should immediately begin to see progress messages after only ~10 seconds; if you do not, that may indicate an error is being swallowed, and you should check your Sourcegraph `frontend` server for relevant details. Confirm that chat and embeddings are actually working on your Sourcegraph instance.

When the tool completes, you will see output like:

```sh
✅ Completions saved to: /var/folders/j4/fs11plcs72s2kkrtnyf7mgy80000gq/T/cody-completions-test/unstable-openai-1694480933253.json
```

## Running the review tool

The tool will read the data file mentioned on the last line, so move it into the `completions-review-tool/data` folder:

```sh
cd cody/completions-review-tool/
mv /var/folders/j4/fs11plcs72s2kkrtnyf7mgy80000gq/T/cody-completions-test/unstable-openai-1694480933253.json ./data
```

Then run the tool:

```sh
pnpm run dev
```

Navigate to http://localhost:3000 in your browser, where you will find the web UI (important: make sure the completions you are viewing matches the filename you moved into the `data/` folder - and there may be an older version for the same LLM. Scroll horizontally to see how each LLM did):

<img width="1391" alt="image" src="https://github.com/sourcegraph/cody/assets/3173176/9011127f-b87a-4a1c-ac03-b6e587770de3">
