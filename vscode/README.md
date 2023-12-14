# AI that knows your entire codebase

[Cody](https://about.sourcegraph.com/cody?utm_source=marketplace.visualstudio.com&utm_medium=referral) is a free AI coding assistant that can write, understand, fix, and find your code. Cody is powered by Sourcegraph’s code graph, and has knowledge of your entire codebase. Install Cody to get started with free AI-powered autocomplete, chat, commands, and more.

Cody is now generally available. If you're using Cody Pro, make sure to update to the latest version of the IDE extension to get the latest features and unlimited rate limits.

## Autocomplete

Cody autocompletes single lines, or whole functions, in any programming language, configuration file, or documentation. It’s powered by the latest instant LLM models, for accuracy and performance.

<!-- prettier-ignore: Uses <img> so we can fix width to 480px so all images are consistent width and look sharp @2x -->
<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-cody-autocomplete-tsx.gif" width="480" alt="Cody autocomplete">

## Chat

Answer questions about programming topics generally or your codebase specifically with Cody chat. Enable Cody to include Enhanced Context of your open project, or tag specific files and symbols to refine your chat prompt.

For example, you can ask Cody:

- "How is our app's secret storage implemented on Linux?"
- "Where is the CI config for the web integration tests?"
- "Write a new GraphQL resolver for the AuditLog"
- "Why is the UserConnectionResolver giving an "unknown user" error, and how do I fix it?"
- "Add helpful debug log statements"
- "Make this work" _(seriously, it often works—try it!)_

<!-- prettier-ignore: Uses <img> so we can fix width to 480px so all images are consistent width and look sharp @2x -->
<img src="https://storage.googleapis.com/sourcegraph-assets/blog/blog-vscode-v018-release/blog-v018-context-controls-002.gif" width="480" alt="Cody Chat">

## Built-In Commands

Streamline your development process by using Cody commands to understand, improve, fix, document, and generate unit tests for your code.

<!-- prettier-ignore: Uses <img> so we can fix width to 480px so all images are consistent width and look sharp @2x -->
<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-explain.gif" width="480" alt="Explain Code command">

## Custom Commands (Beta)

You can also build your own [Custom Commands (Beta)](https://sourcegraph.com/docs/cody/capabilities/commands#custom-commands) to tailor Cody to your workflow. Custom Commands are defined as JSON within your repository and can be saved to your workspace for your teammates to reuse.

<!-- prettier-ignore: Uses <img> so we can fix width to 480px so all images are consistent width and look sharp @2x -->
<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-convert-html-to-md.gif" width="480" alt="Custom command">

## Choose Your LLM

Cody Pro users can now select the LLM they want to use for chat and experiment to choose the best model for the job. Choose from Claude 2.0, Claude 2.1, ChatGPT 3.5 Turbo, ChatGPT 4 Turbo, Claude Instant, and Mixtral.

Administrators for Sourcegraph Enterprise instances can choose betweeen Claude and ChatGPT models to set for their teams as well.

## Cody Natural Language Search (Beta)

Cody builds a Search index of your local files to make it easier to find what you’re looking for. Use a natural language query like “password hashing” or "connection retries" to quickly find and open the files that match your search.

<!-- prettier-ignore: Uses <img> so we can fix width to 480px so all images are consistent width and look sharp @2x -->
<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-natural-language.gif" width="480" alt="Natural Language Search">

## Usage

Cody Free: This version of Cody is available entirely free for all developers. It includes up to 500 autocomplete suggestions & 20 chat/command invocations per month.

Cody Pro: This is an expanded version of Cody for developers who want to use it every day, for either work or personal projects, with no usage limits. Cody Pro will be available for free until February 14, 2024, and after that Cody Pro will be available for $9/user/month.

You can find more information on our [pricing page](https://sourcegraph.com/pricing).

## Programming Languages

Cody works for any programming language because it uses LLMs trained on broad data. Cody works great with Python, Go, JavaScript, and TypeScript code.

## Code Graph

Cody is powered by Sourcegraph’s code graph, and uses context of your codebase to extend its capabilities. By using context from the entire repository, Cody is able to give more accurate answers and generate idiomatic code.

For example:

- Ask Cody to generate an API call. Cody can gather context on your API schema to inform the code it writes.
- Ask Cody to find where in your codebase a specific component is defined. Cody can retrieve and describe the exact files where that component is written.
- Ask Cody questions that require an understanding of multiple files. For example, ask Cody how frontend data is populated in a React app; Cody can find the React component definitions to understand what data is being passed and where it originates.

## Cody Enterprise

Cody Enterprise requires the use of a Sourcegraph Enterprise instance, and gives you access to AI coding tools across your entire organization. [Contact us](https://about.sourcegraph.com/contact/request-info?utm_source=marketplace.visualstudio.com&utm_medium=referral) to set up a trial of Cody Enterprise. If you’re an existing Sourcegraph Enterprise customer, contact your technical advisor.

## Feedback

- [File an issue](https://github.com/sourcegraph/cody/issues/new/choose)
- [Discord](https://discord.gg/s2qDtYGnAE)
- [Twitter (@sourcegraph)](https://twitter.com/sourcegraph)

## More Information

See [https://cody.dev/](https://about.sourcegraph.com/cody?utm_source=marketplace.visualstudio.com&utm_medium=referral) for demos, information and more.
