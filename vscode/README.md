# AI that uses your codebase as context

[Cody](https://about.sourcegraph.com/cody?utm_source=marketplace.visualstudio.com&utm_medium=referral) is an AI coding assistant that helps you understand, write, and fix code faster. It uses advanced search to pull context from both local and remote codebases so that you can use context about APIs, symbols, and usage patterns from across your entire codebase at any scale, all from within VS Code. Plus, Cody Pro users can choose from the latest large language models—like GPT-4o and Claude 3 Opus—to customize Cody to their needs.

Install Cody to get started with free AI-powered autocomplete, chat, commands, and more.

## Autocomplete

Cody autocompletes single lines, or whole functions, in any programming language, configuration file, or documentation. It’s powered by the latest instant LLM models, for accuracy and performance.

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

<img src="https://storage.googleapis.com/sourcegraph-assets/blog/blog-vscode-v018-release/blog-v018-context-controls-002.gif" width="480" alt="Cody Chat">

## Built-In Commands

Streamline your development process by using Cody commands to understand, improve, fix, document, and generate unit tests for your code.

<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-explain.gif" width="480" alt="Explain Code command">

## Custom Commands (Beta)

You can also build your own [Custom Commands (Beta)](https://sourcegraph.com/docs/cody/capabilities/commands#custom-commands) to tailor Cody to your workflow. Custom Commands are defined as JSON within your repository and can be saved to your workspace for your teammates to reuse.

<img src="https://storage.googleapis.com/sourcegraph-assets/blog/vs-code-onboarding-walkthrough-dec-2023-convert-html-to-md.gif" width="480" alt="Custom command">

## Choose Your LLM

Cody Pro users can now select the LLM they want to use for chat and experiment to choose the best model for the job. Choose from Claude 3 Opus, Claude 3.5 Sonnet, Claude 3 Sonnet, Claude 3 Haiku, ChatGPT 4o, ChatGPT 4 Turbo, ChatGPT 3.5 Turbo, Google Gemini 1.5 Pro, Gemini 1.5 Flash, and Mixtral.

Administrators for Sourcegraph Enterprise instances can choose betweeen Claude and ChatGPT models to set for their teams as well.

## Usage

This extension works for all Cody plans, including Cody Free, Cody Pro, and Cody Enterprise.

You can find detailed information about Cody's available plans [on our website](https://sourcegraph.com/pricing?utm_source=marketplace.visualstudio.com&utm_medium=referral).

## Programming Languages

Cody works for any programming language because it uses LLMs trained on broad data. Cody works great with Python, Go, JavaScript, and TypeScript code.

## Code Search

Cody is powered by Sourcegraph’s code search, which it uses to retrieve context from your codebase and extend its capabilities. By using context from entire projects, Cody can give more accurate answers and generate idiomatic code.

For example:

- Ask Cody to generate an API call. Cody can gather context on your API schema to inform the code it writes.
- Ask Cody to find where in your codebase a specific component is defined. Cody can retrieve and describe the exact files where that component is written.
- Ask Cody questions that require an understanding of multiple files. For example, ask Cody how frontend data is populated in a React app; Cody can find the React component definitions to understand what data is being passed and where it originates.

## Cody Enterprise

Cody Enterprise can search context from your entire remote codebase using Sourcegraph's code search. This allows Cody to answer questions about all of your code, even the repositories that don't live on your local machine.

[Contact us](https://about.sourcegraph.com/contact/request-info?utm_source=marketplace.visualstudio.com&utm_medium=referral) to set up a trial of Cody Enterprise. If you’re an existing Sourcegraph Enterprise customer, contact your technical advisor.

## Feedback

- [File an issue](https://github.com/sourcegraph/cody/issues/new/choose)
- [Discord](https://discord.gg/s2qDtYGnAE)
- [Twitter (@sourcegraph)](https://twitter.com/sourcegraph)

## More Information

See [https://cody.dev/](https://about.sourcegraph.com/cody?utm_source=marketplace.visualstudio.com&utm_medium=referral) for demos, information and more.
