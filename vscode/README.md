# Cody: code AI with codebase context

Cody is a free, [open-source](https://github.com/sourcegraph/cody) AI coding assistant that can write and fix code, provide AI-generated autocomplete, and answer your coding questions. Cody uses context to answer questions while referencing your own codebase’s APIs and idioms.

While other AI coding assistants use limited context of local files and projects, Cody’s broader context of your codebase allows it to answer far more complex questions and write more cohesive code. For example, Cody can:

- Tell you about the layout of entire repositories
- Find where functions are defined within a repository
- Write code that calls your own APIs

Cody is currently in Beta and free for individual use with reasonable per-user rate limits. Cody is also available for Sourcegraph Enterprise users ([see below for more information](#whats-the-difference-between-using-cody-for-free-and-cody-enterprise)).

See [cody.dev](https://cody.dev) for more info.

## What can Cody do?

- **Chat:** Ask Cody questions about your entire codebase. Cody will use semantic search to retrieve files from your codebase and use context from those files to answer your questions.
- **Autocomplete:** Cody makes single-line and multi-line suggestions as you type, speeding up your coding and shortcutting the need for you to hunt down function and variable names as you type.
- **Inline Chat:** Ask Cody to fix or refactor code from anywhere in a file.
- **Commands:** Cody has quick commands for common actions. Simply highlight a code snippet and run a command, like “Document code,” “Explain code,” or “Generate Unit Tests.”
- **Swappable LLMs:** Support for Anthropic Claude, Claude 2, and OpenAI GPT-4/3.5, with more coming soon.
  - **Free LLM usage included** (currently Anthropic Claude 2/OpenAI GPT-4) for individual devs on both personal and work code.

## Demos

**Autocomplete:**

> ![Example of using code autocomplete](https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody-completions-may2023-optim.gif)

**Inline chat:**

> <img src="https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody_inline_June23-sm.gif" width=600>

**Codebase-wide chat:**

> ![Example of chatting with Cody](https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody-chat-may2023-optim.gif)

[More demos](https://cody.dev)

## What makes Cody different from other code AI solutions?

Cody uses context of your codebase to extend its capabilities. By using context from multiple repositories, Cody is able to give more accurate answers and generate more idiomatic code that is relevant to you.

This context opens up unique use cases for Cody:

- Ask Cody to generate an API call. Cody can gather context on your API schema to inform the code it writes.
- Ask Cody to find where within your codebase a specific component is defined. Cody can retrieve and describe the exact files where that component is written.
- Ask Cody questions that require an understanding of multiple files. For example, ask Cody how frontend data is populated in a React app; Cody can find the React component definitions to understand what data is being passed and where it originates.

## Language Support

Cody works for any programming language because it uses LLMs trained on broad data. You may find that Cody provides higher-quality answers for certain languages or frameworks.

We’ve used Cody extensively for Python, Go, JavaScript, and TypeScript code, and we’re always testing it in new ways. Have a language that Cody isn’t working well for? [Send us your feedback](https://github.com/sourcegraph/cody/discussions)!

## How does Cody get context from a codebase?

Cody uses embeddings to turn repositories into context that can be semantically searched for retrieval. Sourcegraph refers to the corpus of embeddings (along with other data) as the **code graph**.

Cody generates your code graph in different ways based on your implementation. For free Cody users, the code graph is generated via the Cody desktop app. For Cody Enterprise customers, the code graph is generated via a Sourcegraph Enterprise instance.

## What’s the difference between using Cody for free and Cody Enterprise?

### Using Cody for free

Cody can be used by anyone for free (up to daily, per-user rate limits). Simply download the IDE extension and sign in to a Sourcegraph.com account to get started. This method can be used for personal or work projects.

Free users can optionally download the Cody desktop application as well. The Cody app creates a code graph from your local repositories (up to 10 repositories). This code graph is used to feed context to Cody in the IDE extension, which provides greater context awareness for Cody.

You can also use Cody’s IDE extension without the Cody app, but Cody’s context will be limited to the project open in the IDE.

Learn more about the [Cody app](https://docs.sourcegraph.com/app).

### Cody Enterprise

Cody Enterprise is designed to connect to all of your organization's code hosts and repositories. This gives Cody a large amount of context for answering questions accurately and idiomatically.

Cody Enterprise requires the use of a Sourcegraph Enterprise instance. The Sourcegraph server will generate the code graph of all your code to power Cody, and the Cody IDE extensions will connect directly to the Sourcegraph server. The Cody desktop application is not used for this implementation.

If you’re a Sourcegraph Enterprise customer and would like to try Cody Enterprise, contact your technical advisor. If you’re new to Sourcegraph, you can [contact us](https://about.sourcegraph.com/contact/request-info) to discuss pricing and options.
## Feedback

- [Issue tracker](https://github.com/sourcegraph/cody/issues)
- [Discussions](https://github.com/sourcegraph/cody/discussions)
- [Discord](https://discord.gg/s2qDtYGnAE)
- [Twitter (@sourcegraph)](https://twitter.com/sourcegraph)

## Development

Cody for VS Code is developed in the open-source (Apache 2) [sourcegraph/cody repository](https://github.com/sourcegraph/cody).
