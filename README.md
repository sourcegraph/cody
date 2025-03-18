<div align=center>

# <img src="https://storage.googleapis.com/sourcegraph-assets/cody/20230417/logomark-default.svg" width="26"> Cody

**AI coding agent with the best codebase understanding**

Cody is an AI coding agent that uses the latest LLMs and codebase context to help you understand, write, and fix code faster.

[Docs](https://sourcegraph.com/docs/cody) • [cody.dev](https://about.sourcegraph.com/cody?utm_source=github.com&utm_medium=referral)

[![vscode extension](https://img.shields.io/vscode-marketplace/v/sourcegraph.cody-ai.svg?label=vscode%20ext)](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Twitter](https://img.shields.io/twitter/follow/sourcegraph.svg?label=Follow%20%40Sourcegraph&style=social)](https://twitter.com/sourcegraph)
[![Discord](https://dcbadge.vercel.app/api/server/s2qDtYGnAE?style=flat)](https://discord.gg/s2qDtYGnAE)

</div>

## Get started

[⭐ **Install Cody from the VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) or the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/9682-cody-ai-by-sourcegraph), then check out the [demo](#demo) to see what you can do.

_&mdash; or &mdash;_

- Build and run the VS Code extension locally: `pnpm install && cd vscode && pnpm run dev`
- See [all supported editors](https://sourcegraph.com/docs/cody/clients)

## What is Cody?

Cody is an open-source AI coding assistant that helps you understand, write, and fix code faster. It uses advanced search to pull context from both local and remote codebases so that you can use context about APIs, symbols, and usage patterns from across your codebase at any scale, all from within your IDE. Cody works with the newest and best large language models, including Claude 3.5 Sonnet and GPT-4o.

Cody is available for [VS Code](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai), [JetBrains](https://plugins.jetbrains.com/plugin/9682-cody-ai-by-sourcegraph), and [on the web](https://sourcegraph.com/cody/chat).

See [cody.dev](https://about.sourcegraph.com/cody?utm_source=github.com&utm_medium=referral) for more info.

## What can Cody do?

- **Chat:** Ask Cody questions about your codebase. Cody will use semantic search to retrieve files from your codebase and use context from those files to answer your questions. You can @-mention files to target specific context, and you can also add remote repositories as context on Cody Enterprise.
- **Autocomplete:** Cody makes single-line and multi-line suggestions as you type, speeding up your coding and shortcutting the need for you to hunt down function and variable names as you type.
- **Inline Edit:** Ask Cody to fix or refactor code from anywhere in a file.
- **Prompts:** Cody has quick, customizable prompts for common actions. Simply highlight a code snippet and run a prompt, like “Document code,” “Explain code,” or “Generate Unit Tests.”
- **Swappable LLMs:** Support for Anthropic Claude 3.5 Sonnet, OpenAI GPT-4o, Mixtral, Gemini 1.5, and more.
  - **Free LLM usage included** Cody Free gives you access to Anthropic Claude 3.5 Sonnet and other models. It's available for individual devs on both personal and work code, subject to reasonable per-user rate limits ([more info](#usage)).

## Demo

Cody comes with a variety of AI-for-coding features, such as autocomplete, chat, Smart Apply, generating unit tests, and more.

Here's an example of how you can combine some of these features to use Cody to work on a large codebase.

https://www.loom.com/share/ae710891c9044069a9017ee98ce657c5

## Contributing

All code in this repository is open source (Apache 2).

Quickstart: `pnpm install && pnpm build && cd vscode && pnpm run dev` to run a local build of the Cody VS Code extension.

See [development docs](doc/dev/index.md) for more.

### Feedback

Cody is often magical and sometimes frustratingly wrong. Cody's goal is to be powerful _and_ accurate. You can help:

- Use the <kbd>👍</kbd>/<kbd>👎</kbd> buttons in the chat sidebar to give feedback.
- [File an issue](https://github.com/sourcegraph/cody/issues) (or submit a PR!) when you see problems.
- [Community forum](https://community.sourcegraph.com/)
- [Discord](https://discord.gg/s2qDtYGnAE)

## Usage

### Individual usage

Individual usage of Cody currently requires a (free) [Sourcegraph.com](https://sourcegraph.com/?utm_source=github.com&utm_medium=referral) account because we need to prevent abuse of the free Anthropic/OpenAI LLM usage. We're working on supporting [more swappable LLM options](https://sourcegraph.com/docs/cody/faq#can-i-use-my-own-api-keys) (including using your own Anthropic/OpenAI account or a self-hosted LLM) to make it possible to use Cody without any required third-party dependencies.

### Codying at work

You can use Cody Free or Cody Pro when Codying on your work code. If that doesn't meet your needs (because you need a dedicated/single-tenant instance, audit logs, bring-your-own-model etc.), upgrade to [Cody Enterprise](https://sourcegraph.com/pricing).

### Existing Sourcegraph customers

The Cody editor extensions work with:

- Sourcegraph Cloud
- Sourcegraph Enterprise Server (self-hosted) instances on version 5.1 or later
