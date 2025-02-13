# @ Mentions and Serialization in the Prompt Library

This document explains how @ mentions are handled within our prompt templates editor, focusing on the serialization and hydration mechanisms. 

We leverage these techniques to dynamically inject context (such as files, directories, repositories, and selections) into prompts via a unified system.

## @ Mentions: Overview

When editing prompt templates, users can include special @ mentions that represent either static context (such as specific files or directories) 
or dynamic context (e.g. current repository or current selection). 

Instead of storing raw values directly, these mentions are serialized in one of two ways:

- **Specific Context Mentions:**  
  These include rich context data such as file or directory information. In our implementation, we extract the required 
  information from the editor’s lexical state, and serialize it using base64. 
  This encoding is prefixed with a marker (`cody://serialized.v1`) and an ending marker, ensuring that the resulting string 
  can be stored as part of the prompt template. The `v1` version is for future migrations.
 The PR https://github.com/sourcegraph/cody/pull/6638 is a good start for further research.

- **Dynamic Context Mentions:**  
  For context that is determined at prompt usage time (for example, the current repository or selection at the time the prompt is applied), 
  a simpler approach is used. Instead of storing the full data, we simply store a URL-like string (e.g. `cody://repository`). 
  In the user interface, these values are rendered as chips. When a prompt is applied, these placeholders 
  are converted (“hydrated”) into specific context mentions by resolving the dynamic state at that moment.
  The PR https://github.com/sourcegraph/cody/pull/6793 is a good start for further research.

## Key Modules

Two files are central to the implementation of @ mentions and their serialization/deserialization:

- **[`atMentionsSerializer.ts`](../../lib/shared/src/lexicalEditor/atMentionsSerializer.ts):**  
  This module manages the serialization of specific context mentions. It processes the lexical editor state 
  to identify mention nodes, serializes their associated context data into a base64 encoded string, 
  and reconstructs the data during deserialization.

- **[`prompt-hydration.ts`](../../vscode/src/prompts/prompt-hydration.ts):**  
  This module is responsible for the hydration process. It scans for dynamic mention placeholders in 
  the prompt text (such as `cody://repository`) and replaces them with the actual context, transforming 
  them into full specific mentions before the prompt is used.

## The Prompt Library

The prompt library lets customer manage a collection of prompt templates within their Sourcegraph instance. 

It reuses the chat components from the cody-web package to enable rich, context-aware prompt templates.

- **Usage in the Prompt Library:**  
  The Sourcegraph repository uses the `CodyWebTemplate` component, and passes the serialized prompt template into its APIs.
  When a user applies a prompt template in their editor, they retrieve the template from that API, and then run the hydration explained above.
