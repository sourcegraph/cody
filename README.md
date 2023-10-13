<div align=center>

# <img src="https://storage.googleapis.com/sourcegraph-assets/cody/20230417/logomark-default.svg" width="26"> Cody

**Code AI with codebase context**

"an AI pair programmer that actually knows about your entire codebase's APIs, impls, and idioms"

[Docs](https://docs.sourcegraph.com/cody) • [cody.dev](https://cody.dev)

[![vscode extension](https://img.shields.io/vscode-marketplace/v/sourcegraph.cody-ai.svg?label=vscode%20ext)](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![test](https://github.com/sourcegraph/cody/actions/workflows/ci.yml/badge.svg)](https://github.com/sourcegraph/cody/actions/workflows/ci.yml)
[![Twitter](https://img.shields.io/twitter/follow/sourcegraph.svg?label=Follow%20%40sourcegraph&style=social)](https://twitter.com/sourcegraph)
[![Discord](https://dcbadge.vercel.app/api/server/s2qDtYGnAE?style=flat)](https://discord.gg/s2qDtYGnAE)

</div>

## Get started

[⭐ **Install Cody from the VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) or the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/9682-cody-ai-by-sourcegraph), then check out the [demos](#demos) to see what you can do.

_&mdash; or &mdash;_

- Build and run the VS Code extension locally: `pnpm install && cd vscode && pnpm run dev`
- See [all supported editors](https://cody.dev)

## What is Cody?

Cody is a free, open-source AI coding assistant that can write and fix code, provide AI-generated autocomplete, and answer your coding questions. Cody fetches relevant code context from across your entire codebase to write better code that uses more of your codebase's APIs, impls, and idioms, with less hallucination.

Cody is currently in Beta and available for [VS Code](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [JetBrains](https://plugins.jetbrains.com/plugin/9682-cody-ai-by-sourcegraph).

See [cody.dev](https://cody.dev) for more info.

## What can Cody do?

- **Chat:** Ask Cody questions about your entire codebase. Cody will use semantic search to retrieve files from your codebase and use context from those files to answer your questions.
- **Autocomplete:** Cody makes single-line and multi-line suggestions as you type, speeding up your coding and shortcutting the need for you to hunt down function and variable names as you type.
- **Inline Chat:** Ask Cody to fix or refactor code from anywhere in a file.
- **Commands:** Cody has quick commands for common actions. Simply highlight a code snippet and run a command, like “Document code,” “Explain code,” or “Generate Unit Tests.”
- **Swappable LLMs:** Support for Anthropic Claude, Claude 2, and OpenAI GPT-4/3.5, with more coming soon.
  - **Free LLM usage included** (currently Anthropic Claude 2/OpenAI GPT-4) for individual devs on both personal and work code, subject to reasonable per-user rate limits ([more info](#usage)).

## Demos

**Autocomplete**

> <img src="https://camo.githubusercontent.com/183f8e41ee44b604ef9085addc80503739452bdd343c872e4a5d617d3732b3c9/68747470733a2f2f73746f726167652e676f6f676c65617069732e636f6d2f736f7572636567726170682d6173736574732f626c6f672f636f64792d636f6d706c6574696f6e732d6d6179323032332d6f7074696d2d736d322e676966" width="400" data-canonical-src="https://storage.googleapis.com/sourcegraph-assets/blog/cody-completions-may2023-optim-sm2.gif">

**Inline chat**

> <img src="https://camo.githubusercontent.com/1bd5c73139701356807b9e998261e70ba69f2ea26ed29a9b8c233e16ec8b4ed4/68747470733a2f2f73746f726167652e676f6f676c65617069732e636f6d2f736f7572636567726170682d6173736574732f776562736974652f50726f64756374253230416e696d6174696f6e732f474946532f636f64795f696e6c696e655f4a756e6532332d736d2e676966" width="400" data-canonical-src="https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody_inline_June23-sm.gif">

**Codebase-wide chat:**

> <img src="https://camo.githubusercontent.com/2a0b73e75d1cc54a8eb2394c3694c28c2c325b04530abbfc383ba718913808c1/68747470733a2f2f73746f726167652e676f6f676c65617069732e636f6d2f736f7572636567726170682d6173736574732f776562736974652f50726f64756374253230416e696d6174696f6e732f474946532f636f64792d636861742d6d6179323032332d6f7074696d2e676966" width="400" data-canonical-src="https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody-chat-may2023-optim.gif">

## Contributing

All code in this repository is open source (Apache 2).

Quickstart: `pnpm install && cd vscode && pnpm run dev` to run a local build of the Cody VS Code extension.

See [development docs](doc/dev/index.md) for more.

### Feedback

Cody is often magical and sometimes frustratingly wrong. Cody's goal is to be powerful _and_ accurate. You can help:

- Use the <kbd>👍</kbd>/<kbd>👎</kbd> buttons in the chat sidebar to give feedback.
- [File an issue](https://github.com/sourcegraph/cody/issues) (or submit a PR!) when you see problems.
- [Discussions](https://github.com/sourcegraph/cody/discussions)
- [Discord](https://discord.gg/s2qDtYGnAE)

## Usage

### Individual usage

Individual usage of Cody currently requires a (free) [Sourcegraph.com](https://sourcegraph.com) account because we need to prevent abuse of the free Anthropic/OpenAI LLM usage. We're working on supporting more swappable LLM options (including using your own Anthropic/OpenAI account or a self-hosted LLM) to make it possible to use Cody without any required third-party dependencies.

### Codying at work

You can use your free individual account when Codying on your work code. If that doesn't meet your needs (because you need higher rate limits, a dedicated/single-tenant instance, scalable embeddings, audit logs, etc.), [fill out the "Cody at work" form](https://forms.gle/SBPfmihdyEvUPEc86) and we'll help.

### Existing Sourcegraph customers

The Cody editor extensions work with:

- Sourcegraph Cloud
- Sourcegraph Enterprise Server (self-hosted) instances on version 5.1 or later
