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

[⭐ **Install Cody from the VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai), then check out the [demos](#demos) to see what you can do.

_&mdash; or &mdash;_

- Build and run VS Code extension locally: `pnpm install && cd vscode && pnpm run dev`
- See [all supported editors](https://cody.dev)

## What is Cody?

Cody is a code AI tool that autocompletes, writes, fixes, and refactors code (and answers code questions), with:

- **Codebase context:** Cody fetches relevant code context from across your entire codebase to write better code that uses more of your codebase's APIs, impls, and idioms, with less hallucination.
- **Editor features:** Popular extensions for [VS Code](https://marketplace.visualstudio.com/items?itemName=sourcegraph.cody-ai) and [JetBrains](https://plugins.jetbrains.com/plugin/9682-cody-ai-by-sourcegraph) (and WIP support for Neovim and Emacs).
  - **Autocomplete:** with better suggestions based on your entire codebase, not just a few recently opened files
  - **Inline chat:** refactor code based on natural language input, ask questions about code snippets, etc.
  - **Recipes:** explain code, generate unit test, generate docstring, and many more (contribute your own!)
  - **Codebase-wide chat:** ask questions about your entire codebase
- **Swappable LLMs:** Support for Anthropic Claude and OpenAI GPT-4/3.5, highly experimental support for self-hosted LLMs, and more soon.
  - **Free LLM usage included** (currently Anthropic Claude/OpenAI GPT-4) for individual devs on both personal and work code, subject to reasonable per-user rate limits ([more info](#usage)).

See [cody.dev](https://cody.dev) for more info.

## Demos

**Autocomplete**

> <img src="https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody-completions-may2023-optim-sm2.gif" width=400>

**Inline chat**

> <img src="https://storage.googleapis.com/sourcegraph-assets/website/Product%20Animations/GIFS/cody_inline_June23-sm.gif" width=600>

[More demos](https://cody.dev)

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
