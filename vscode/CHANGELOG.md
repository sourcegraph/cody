# Changelog

This is a log of all notable changes to Cody for VS Code. [Unreleased] changes are included in the nightly pre-release builds.

## [Unreleased]

### Added

### Fixed

### Changed


## 1.32.5

### Fixed
- Autocomplete: Fix autocomplete character trimming from hot-streak. [pull/5378](https://github.com/sourcegraph/cody/pull/5378)
- Autocomplete: Fix anthropic model for PLG users. [pull/5380](https://github.com/sourcegraph/cody/pull/5380)

## 1.32.4

### Added
- Refactoring: refactoring configurations to make more reactive. [pull/5330](https://github.com/sourcegraph/cody/pull/5330)
- Autocomplete: Enable smart throttle and hot streak. [pull/5339](https://github.com/sourcegraph/cody/pull/5339)
- Autocomplete: Fix model mapping for deepseek-coder-v2. [pull/5272](https://github.com/sourcegraph/cody/pull/5272)
- Autocomplete: Prompt caching and direct routing experiment. [pull/5246](https://github.com/sourcegraph/cody/pull/5246)

## 1.32.3

### Added
- Autocomplete Refactoring: Extract fast-path client for the fireworks provider. [pull/5284](https://github.com/sourcegraph/cody/pull/5284)
- Autocomplete Refactoring: Reduce `createProviderConfig` duplication. [pull/5282](https://github.com/sourcegraph/cody/pull/5282)
- Autocomplete Refactoring: Remove starcoder2. [pull/5283](https://github.com/sourcegraph/cody/pull/5283)
- Autocomplete Refactoring: Remove unused models in the fireworks provider. [pull/5286](https://github.com/sourcegraph/cody/pull/5286)
- Autocomplete Refactoring: Refactor the Fireworks provider. [pull/5307](https://github.com/sourcegraph/cody/pull/5307)

## 1.32.2

### Fixed
- Fixed an issue where chats could hang if there have been no changes since the last local indexing. [pull/5319](https://github.com/sourcegraph/cody/pull/5319)


## 1.32.1

### Fixed

- Revert: A recent version bump of a dependency was potentially causing some Out-of-Memory issues resultling in a grey screen. The `rehype-highlight` version has been reverted. [pull/5315](https://github.com/sourcegraph/cody/pull/5315)
- Chat: General improvements to how Cody responds to messages that include code blocks. [pull/5290](https://github.com/sourcegraph/cody/pull/5290)

## 1.32.0

### Added

- Chat/Edit: Added an experimental "Smart Apply" button to code blocks that will attempt to apply the changes to the correct file via the Edit command. [pull/5038](https://github.com/sourcegraph/cody/pull/5038)
- Edit: Added support to accept/reject specific changes when displaying a diff. [pull/4976](https://github.com/sourcegraph/cody/pull/4976)
- Agent: Support for multiple workspace roots. [pull/5211](https://github.com/sourcegraph/cody/pull/5211)

### Fixed

- Edit: Fixed a case where multiple, duplicate, edit commands would be created unintentionally. [pull/5183](https://github.com/sourcegraph/cody/pull/5183)
- Debug: Commands for debugging purposes (e.g., "Cody Debug: Export Logs") are available outside of development mode again. [pull/5197](https://github.com/sourcegraph/cody/pull/5197)
- Edit: Fixed an issue where the inline diff would not be shown if a file became hidden before the edit was applied. [pull/5270](https://github.com/sourcegraph/cody/pull/5270)
- Edit: Fixed an issue where single-line/short edits would not be correctly applied to the document. [pull/5271](https://github.com/sourcegraph/cody/pull/5271)

### Changed

- Chat: Improved how Cody associates code to existing files in chat responses. [pull/5038](https://github.com/sourcegraph/cody/pull/5038)
- Chat: Added an experimental simpler code block UI, that can accomodate the "Smart Apply" button. [pull/5038](https://github.com/sourcegraph/cody/pull/5038)

## 1.30.3

### Added

### Fixed

- Chat: Fixed an issue where @-mentions move focus to the chat input box at the top. [pull/5170](https://github.com/sourcegraph/cody/pull/5170)

### Changed

## 1.30.2

### Added

Autocomplete: Experiment flag for deepseek context increase experiment. [pull/5159](https://github.com/sourcegraph/cody/pull/5159)

### Fixed

### Changed

## 1.30.1

### Added

Autocomplete: Add a feature flag for DeepSeek-coder-v2 lite base model. [pull/5151](https://github.com/sourcegraph/cody/pull/5079)

### Fixed

### Changed

## 1.30.0

### Added

Chat: Added ability to remove individual chats from chat history in the sidebar. [pull/5114](https://github.com/sourcegraph/cody/pull/5114)

### Fixed

### Changed

- Chat: the local search index is now rebuilt more frequently when many files are changed since the last index (such as when the user checks out a revision that differs from the current revision).

## 1.28.1

Chat: Cody is now defaulted to run in the sidebar for both Enterprise and Non-Enterprise users. [pull/5039](https://github.com/sourcegraph/cody/pull/5039)

### Fixed

- Edit: Fixed an issue where we would generate an inefficient diff due to a mismatch in the end-of-line sequence between the user and the LLM. [pull/5069](https://github.com/sourcegraph/cody/pull/5069)
- Chat: Fixed an issue where buttons to start a new Cody chat and show Chat History were visible in non-Cody views. [pull/5106](https://github.com/sourcegraph/cody/pull/5106)

### Changed

- Autocomplete: Ignores leading empty new lines for autocomplete suggestions to reduce the number of cases when Cody doesn't suggest anything. [pull/4864](https://github.com/sourcegraph/cody/pull/4864)
- Autocomplete: Preload completions on cursor movement. [pull/4901](https://github.com/sourcegraph/cody/pull/4901)
- Chat: The shortcuts for starting starting and toggling the chat have changed:
  - `Alt+L`: Toggles between the chat view and the last text editor. If a chat view doesn't exist, it opens a new one. From a text editor with an active selection, it adds the active selection to the chat.
  - `Shift+Alt+L`: starts a new chat session.
  - The `cody.chat.defaultLocation` setting controls the default location of chat sessions. The values are "sidebar", "editor", or "sticky". The default is "sticky", which defaults to the sidebar but switches whenever the user moves the chat to the editor panel, or vice versa.

## 1.28.0

### Added

- Chat: Chat has been added back to the VS Code sidebar (after being removed about 6 months ago). By default, new chats open in the sidebar. New chats can still be opened in an editor panel with the `New Chat in Sidebar` command. Currently open chats can be moved from the sidebar into an editor panel and vice versa. Enterprise users are not affected. [pull/4832](https://github.com/sourcegraph/cody/pull/4832)
- Chat: Chat History, commands, and settings are now accessible through the chat view for Non-Enterprise users. [pull/4900](https://github.com/sourcegraph/cody/pull/4900)
- Edit: Added support to select the full range of a file for an edit. [pull/4864](https://github.com/sourcegraph/cody/pull/4864)

### Fixed

- Command: The "Ask Cody to Explain" command for explaining terminal output has been removed from the command palette, as it is only callable from the terminal context menu. [pull/4860](https://github.com/sourcegraph/cody/pull/4860)
- Command: Make "Open Diff" button maximize current editor if multiple are open. [pull/4957](https://github.com/sourcegraph/cody/pull/4957)
- Chat: Design cleanups of the new chat UI. [pull/4959](https://github.com/sourcegraph/cody/pull/4959)
- Autocomplete: Fixed an issue where completions would incorrectly be marked as "read" if the cursor position or active document no longer passes the visibility checks. [pull/4984](https://github.com/sourcegraph/cody/pull/4984)

### Changed

- For non-Enterprise users, the sidebar for commands, chat history, and settings has been removed and replaced by the sidebar chat. [pull/4832](https://github.com/sourcegraph/cody/pull/4832)

## 1.26.7

### Fixed

- Autocomplete: Fixed an issue where autocomplete context requests were never resolved. [pull/4961](https://github.com/sourcegraph/cody/pull/4961)

## 1.26.6

### Fixed

- Autocomplete: Fixed an issue where the cached retriever was attempting to open removed files. [pull/4942](https://github.com/sourcegraph/cody/pull/4942)

## 1.26.5

### Fixed

- Chat context: Fixed an issue where querying context retrievers with context chips included in the query returned poor results. [pull/4936](https://github.com/sourcegraph/cody/pull/4936)

## 1.26.4

### Fixed

- Autocomplete: Fixed the request manager cache keys computation. [pull/4902](https://github.com/sourcegraph/cody/pull/4902)
- Autocomplete: Fixed the default model value for the Anthropic autocomplete provider. [pull/4803](https://github.com/sourcegraph/cody/pull/4803)
- It is no longer possible to add a file to chat context by right clicking the file in the file explorer.

## 1.26.3

### Fixed

- Autocomplete: Characters logger now accounts for multiline deletions. [pull/4865](https://github.com/sourcegraph/cody/pull/4865)
- Autocomplete: Fixed an issue where subsequent completions would be marked as "suggested" multiple times, if they resolved to an already visible completion. [pull/4866](https://github.com/sourcegraph/cody/pull/4866)

## 1.26.2

### Added

- Autocomplete: Added an extended experimental throttling mechanism that should decrease latency. [pull/4852](https://github.com/sourcegraph/cody/pull/4852)

### Fixed

- Autocomplete: Fixed an issue where in-flight requests would sometimes be incorrectly resolved if the cursor position changed. [pull/4827](https://github.com/sourcegraph/cody/pull/4827)

### Changed

## 1.26.1

### Fixed

- A no-op command `New Chat in Sidebar` was removed. (This will be added back with functionality in the next minor stable release version.) [pull/4837](https://github.com/sourcegraph/cody/pull/4837)

## 1.26.0

### Added

- Ollama: Added support for running Cody offline with local Ollama models. [pull/4691](https://github.com/sourcegraph/cody/pull/4691)
- Edit: Added support for users' to edit the applied edit before the diff view is removed. [pull/4684](https://github.com/sourcegraph/cody/pull/4684)
- Autocomplete: Added experimental support for Gemini 1.5 Flash as the autocomplete model. To enable this experimental feature, update the `autocomplete.advanced.provider` configuration setting to `unstable-gemini`. Prerequisite: Your Sourcegraph instance (v5.5.0+) must first be configured to use Gemini 1.5 Flash as the autocomplete model. [pull/4743](https://github.com/sourcegraph/cody/pull/4743)
- Enterprise: Enabled support for multiple dynaic models if the Sourcegraph backend provides them. Requires the experimental flag `modelsAPIEnabled` to be sent by the client config API. [pull/4780](https://github.com/sourcegraph/cody/pull/4780)
- Autocomplete: Fixed hot-streak cache keys for long documents. [pull/4817](https://github.com/sourcegraph/cody/pull/4817)
- Autocomplete: Added an extra abort call to ensure request cancellation. [pull/4818](https://github.com/sourcegraph/cody/pull/4818)

### Fixed

- Edit: Fixed an issue where, when unable to detect the indentation of a file, Cody would remove all indentation from a response. [pull/4704](https://github.com/sourcegraph/cody/pull/4704)
- Edit: Fixed an issue where Cody would sometimes remove unintended parts of the code when an edit was accepted on save. [pull/4720](https://github.com/sourcegraph/cody/pull/4720)
- Chat: The loading dots in the loading page are now centered correctly. [pull/4808](https://github.com/sourcegraph/cody/pull/4808)

### Changed

- Chat: Added a stop button and cleaned up the vertical space layout of the chat. [pull/4580](https://github.com/sourcegraph/cody/pull/4580)
- Autocomplete: Added a caching layer to Jaccard Similarity to reduce the load of context gathering during autocompletion. [pull/4608](https://github.com/sourcegraph/cody/pull/4608)
- Autocomplete: Added Fireworks headers to analytics events. [pull/4804](https://github.com/sourcegraph/cody/pull/4804)
- Chat: Simplify the Enterprise docs in the model selector [pull/4745](https://github.com/sourcegraph/cody/pull/4745)
- Edit: We now collapse the selection down to the cursor position after an edit is triggered. [pull/4781](https://github.com/sourcegraph/cody/pull/4781)
- Autocomplete: requests timeout decreased from 15s to 7s. [pull/4813](https://github.com/sourcegraph/cody/pull/4813)
- Chat & Edit: Claude 3.5 Sonnet is now the default model for Chat and Commands. [pull/4822](https://github.com/sourcegraph/cody/pull/4822)

## 1.24.2

### Added

- Autocomplete: Added a new experimental throttling mechanism that should decrease latency. [pull/4735](https://github.com/sourcegraph/cody/pull/4735)

### Changed

- Autocomplete: When the last completion candidate is not applicable at the current document position, it remains in the cache even after the user backspaces or deletes characters from the current line. [pull/4704](https://github.com/sourcegraph/cody/pull/4704)
- Autocomplete: Increase request manager cache size. [pull/4778](https://github.com/sourcegraph/cody/pull/4778)

## 1.24.1

- Autocomplete: Restrict the number of lines we await during hot-streak completion generation to prevent overwhelming inference providers. [pull/4737](https://github.com/sourcegraph/cody/pull/4737)

## 1.24.0

### Added

- Edit: Added a new visual inline diff output for applied edits. [pull/4525](https://github.com/sourcegraph/cody/pull/4525)
- Edit: Added a visual animation showing the progress of the LLM as it produces a final output. [pull/4525](https://github.com/sourcegraph/cody/pull/4525)

### Fixed

- Edit: Fixed incorrect codelens for "Generate Code". [pull/4525](https://github.com/sourcegraph/cody/pull/4525)
- Chat: Display the appropriate error message when input has exceeded the model's context window, instead of "Chat token usage must be updated before Context". [pull/4674](https://github.com/sourcegraph/cody/pull/4674)

### Changed

- Chat: @-mentions are shown as chips instead of text. [pull/4539](https://github.com/sourcegraph/cody/pull/4539)
- Edit: Removed usage of the users' default formatter, instead choosing to apply basic formatting and indentation matching before the edit is applied to the document. [pull/4525](https://github.com/sourcegraph/cody/pull/4525)
- Edit: Removed the manual "Show Diff" option, in favour of showing the diff directly in the editor. [pull/4525](https://github.com/sourcegraph/cody/pull/4525)

## 1.22.4

### Added

- Autocomplete: Support Google Vertex provider exclusively for Anthropic-based models. [pull/4606](https://github.com/sourcegraph/cody/pull/4606)
- Chat & Commands: New model Anthropic Claude 3.5 Sonnet available for Cody Pro users. [pull/4631](https://github.com/sourcegraph/cody/pull/4631)

### Fixed

### Changed

## 1.22.3

### Added

### Fixed

### Changed

## 1.22.2

### Added

- Autocomplete: Finetuned model shipment for code completions in py, jsx and jsx language. [pull/4533](https://github.com/sourcegraph/cody/pull/4533)
- Telemetry: Context logging for the autocomplete feature in private metadata. [pull/4501](https://github.com/sourcegraph/cody/pull/4501)
- Autocomplete: Feature flags for the fine-tuning model and deepseek experiment for code completions. [pull/4577](https://github.com/sourcegraph/cody/pull/4577)
- Telemetry: Added autocomplete stage counter logger. [pull/4595](https://github.com/sourcegraph/cody/pull/4595)
- Telemetry: Added resolved model to autocomplete events. [pull/4565](https://github.com/sourcegraph/cody/pull/4565)

## 1.22.1

### Added

- Enterprise: Expand the context window for Gemini 1.5 models. [pull/4563](https://github.com/sourcegraph/cody/pull/4563)

### Fixed

- Chat: Fix hover tooltips on overflowed paths in the @-mention file picker. [pull/4553](https://github.com/sourcegraph/cody/pull/4553)
- Custom Commands: Creating a new custom command through the menu without an existing cody.json file now creates a new cody.json file with the command added. [pull/4561](https://github.com/sourcegraph/cody/pull/4561)
- Ollama: Fix a bug where Ollama models were not connected to the correct client. [pull/4564](https://github.com/sourcegraph/cody/pull/4564)
- Windows: Fix a bug where Cody failed to load on Windows with the latest VS Code Insiders due to local certificates. [pull/4598](https://github.com/sourcegraph/cody/pull/4598)

### Changed

## 1.22.0

### Added

- Chat & Commands: New models available for Cody Pro users:
  - Google Gemini 1.5 Pro [#4360](https://github.com/sourcegraph/cody/pull/4360)
  - Google Gemini 1.5 Flash [#4360](https://github.com/sourcegraph/cody/pull/4360)
- Chat: Followup responses now more clearly indicate that prior context in the thread was used to generate the response. [pull/4479](https://github.com/sourcegraph/cody/pull/4479)

### Fixed

- Chat: Don't append @ when "Add context" is pressed multiple times. [pull/4439](https://github.com/sourcegraph/cody/pull/4439)
- Chat: Fix an issue where copying code (with right-click or Cmd/Ctrl+C) causes many event logs and may trip rate limits. [pull/4469](https://github.com/sourcegraph/cody/pull/4469)
- Chat: Fix an issue where it was difficult to copy code from responses that were still streaming in. [pull/4472](https://github.com/sourcegraph/cody/pull/4472)
- Chat: Fix an issue where opening the @-mention menu in a followup input would scroll the window to the top. [pull/4475](https://github.com/sourcegraph/cody/pull/4475)
- Chat: Show "Explain Code" and other commands in a more pleasant way, with @-mentions, in the chat. [pull/4424](https://github.com/sourcegraph/cody/pull/4424)
- Chat: Scrollbars are now shown in the @-mention menu when it overflows, same as chat models. [pull/4523](https://github.com/sourcegraph/cody/pull/4523)
- Chat: Prevent the chat from remaining in a loading state when using ESC to stop Cody's response mid-stream. [pull/4532](https://github.com/sourcegraph/cody/pull/4532)
- Chat: Large files added to new chats as @-mentions are now correctly displayed as invalid. [pull/4534](https://github.com/sourcegraph/cody/pull/4534)

### Changed

- Autocomplete: Improve finding of related code snippets by breaking camelCase and snake_case words. [pull/4467](https://github.com/sourcegraph/cody/pull/4467)
- The natural language search quickpick was removed. To perform a natural-language search, run a Cody chat and view the items in the context row. [pull/4506](https://github.com/sourcegraph/cody/pull/4506)
- Temporary Fix for [Win-ca package Certs] Issue(https://github.com/sourcegraph/cody/issues/4491): Bypassed problematic codepath to prevent system hang, resulting in temporary loss of self-signed certs import on Windows. Proper fix planned before July 1.

## [1.20.3]

### Fixed

- Chat: Fix an issue where copying code (with right-click or Cmd/Ctrl+C) causes many event logs and may trip rate limits. [pull/4469](https://github.com/sourcegraph/cody/pull/4469)

## [1.20.2]

### Fixed

- Performance: Reduced the performance overhead for certain types of context fetching, especially for larger files. This might have caused issues with slow autocomplete before. [pull/4446](https://github.com/sourcegraph/cody/pull/4446)
- Chat: Fixed an issue where the chat view would crash and display a gray screen in VS Code due to an out-of-memory situation. [pull/4459](https://github.com/sourcegraph/cody/pull/4459)

## [1.20.1]

### Fixed

- Chat: The @-mentions for workspace repositories, which are added to the input box by default for new messages, now take context filters into consideration and do not mention the excluded repos. [pull/4427](https://github.com/sourcegraph/cody/pull/4427)
- Chat: Fixed an issue where the buttons for copying and inserting code in assistant responses were not showing. [pull/4422](https://github.com/sourcegraph/cody/pull/4422)
- Edit: Fixed an issue where the edit commands context was removed from the final prompt. [pull/4432](https://github.com/sourcegraph/cody/pull/4432)
- Agent: Fixed an issue where the agent incorrectly calculated document range for out of bounds line numbers. [pull/4435](https://github.com/sourcegraph/cody/pull/4435)
- Chat: Fixed the contrast and colors of send button. [pull/4436](https://github.com/sourcegraph/cody/pull/4436)

## [1.20.0]

### Added

- Chat: Integrated OpenCtx providers with @-mention context menu. [pull/4201](https://github.com/sourcegraph/cody/pull/4201)
- Enterprise: Adds support for the `completions.smartContextWindow` (available in Sourcegraph v5.5.0+) site configuration. [pull/4236](https://github.com/sourcegraph/cody/pull/4236)
- Chat: Integrated OpenCtx providers with @-mention context menu. [pull/4201](https://github.com/sourcegraph/cody/pull/4201/files)
- Keybinding: Assign the same keyboard shortcut for starting a new chat to the "New Chat with Selection" command. [pull/4255](https://github.com/sourcegraph/cody/pull/4255)
- Telemetry: Adds a new telemetry event when users uninstall the extension. [pull/4246](https://github.com/sourcegraph/cody/pull/4246)
- Chat: Added @-mention remote repositories search provider for enterprise. [pull/4311](https://github.com/sourcegraph/cody/pull/4311)
- Chat: Editor selection is now included in all chats by default. [pull/4292](https://github.com/sourcegraph/cody/pull/4292)
- Chat: Assistant responses now have a "Try again with different context" line at the bottom with ways you can improve the context used to generate the response. [pull/4317](https://github.com/sourcegraph/cody/pull/4317)
- Document Code: Adds additional languages support for range expansion:
  - Java: [pull/4353](https://github.com/sourcegraph/cody/pull/4353)
  - Kotlin: [pull/4355](https://github.com/sourcegraph/cody/pull/4355)
  - Rust: [pull/4358](https://github.com/sourcegraph/cody/pull/4358)
  - PHP: [pull/4359](https://github.com/sourcegraph/cody/pull/4359)
  - C: [pull/4391](https://github.com/sourcegraph/cody/pull/4391)
  - C++: [pull/4392](https://github.com/sourcegraph/cody/pull/4392)

### Fixed

- Autocomplete: Fixed an issue where formatting on save could cause completions to show duplicated characters. [pull/4404](https://github.com/sourcegraph/cody/pull/4404)
- Edit: Fixed an issue where streamed insertions used invalid document ranges. [pull/4172](https://github.com/sourcegraph/cody/pull/4172)
- Chat: Fixed issues with chat commands where selection context is removed from context items. [pull/4229](https://github.com/sourcegraph/cody/pull/4229)
- Auth: Fixes an issue where Login page is not reloaded when proxy settings have changed. [pull/4233](https://github.com/sourcegraph/cody/pull/4233)
- Chat: Fixes issues with chat commands where selection context is removed from context items. [pull/4229](https://github.com/sourcegraph/cody/pull/4229)
- Chat: Fixes intermittent issues with `Add Selection to Cody Chat` where sometimes the @-mention would not actually be added. [pull/4237](https://github.com/sourcegraph/cody/pull/4237)
- Menu: Fixes an issue where the `Add Selection to Cody Chat` context menu item was incorrectly disabled when no new chat was open. [pull/4242](https://github.com/sourcegraph/cody/pull/4242)
- Fixed an issue where the test file name was incorrectly inserted with the unit test command. [pull/4262](https://github.com/sourcegraph/cody/pull/4262)
- Chat: Fixed a long-standing bug where it was not possible to copy code from Cody's response before it was finished. [pull/4268](https://github.com/sourcegraph/cody/pull/4268)
- Chat: Fixed a bug where list bullets or numbers were not shown in chat responses. [pull/4294](https://github.com/sourcegraph/cody/pull/4294)
- Chat: Fixed a bug where long messages could not be scrolled vertically in the input. [pull/4313](https://github.com/sourcegraph/cody/pull/4313)
- Chat: Copying and pasting @-mentions in the chat input now works. [pull/4319](https://github.com/sourcegraph/cody/pull/4319)
- Document Code: Fixed an issue where documentation would be incorrectly inserted in the middle of a line. [pull/4325](https://github.com/sourcegraph/cody/pull/4325)
- Edit: Fixed an issue where an invalid prompt would be used, resulting in an error in certain enterprise configurations. [pull/4350](https://github.com/sourcegraph/cody/pull/4350)

### Changed

- Chat: Pressing <kbd>Space</kbd> no longer accepts an @-mention item. Press <kbd>Tab</kbd> or <kbd>Enter</kbd> instead. [pull/4154](https://github.com/sourcegraph/cody/pull/4154)
- Chat: You can now change the model after you send a chat message. Subsequent messages will be sent using your selected model. [pull/4189](https://github.com/sourcegraph/cody/pull/4189)
- Chat: The @-mention menu now shows the types of context you can include. [pull/4188](https://github.com/sourcegraph/cody/pull/4188)
- Increases the context window for the new `GPT-4o` model. [pull/4180](https://github.com/sourcegraph/cody/pull/4180)
- Commands/Chat: Increased the maximum output limit of LLM responses for recommended Enterprise models. [pull/4203](https://github.com/sourcegraph/cody/pull/4203)
- Chat: The chat UI has been updated to make messages editable in-place and stream down from the top. [pull/4209](https://github.com/sourcegraph/cody/pull/4209)
- Chat: Improved chat model selector UI with GPT-4o now as a recommended model, improved usability for Cody Free users, and a chat models documentation link. [pull/4254](https://github.com/sourcegraph/cody/pull/4254)
- Chat: New welcome screen. [pull/4303](https://github.com/sourcegraph/cody/pull/4303)
- Chat: Added @-mention provider icons. [pull/4336](https://github.com/sourcegraph/cody/pull/4336)
- Chat: New chats now start with @-mentions of your current repository and file. Use @-mentions to include other context. Enterprise users can @-mention remote repositories to chat across multiple repositories. [pull/4364](https://github.com/sourcegraph/cody/pull/4364)

### Removed

- Chat: The `Rename Chat` functionality.

## [1.18.2]

### Added

- Feature flags for the fine-tuning model experiment for code completions. [pull/4245](https://github.com/sourcegraph/cody/pull/4245)

### Fixed

### Changed

## [1.18.1]

### Added

- Automatically start embeddings indexing using Sourcegraph embeddings API. [pull/4091](https://github.com/sourcegraph/cody/pull/4091/)
- Simplify upstream latency collector and measure Cody Gateway latency[pull/4193](https://github.com/sourcegraph/cody/pull/4193)

### Fixed

### Changed

## [1.18.0]

### Added

- Search: A new `Search Code` command added to the `Commands` sidebar for Cody's Natural Language Search. [pull/3991](https://github.com/sourcegraph/cody/pull/3991)
- Context Menu: Added commands to send file to chat as @-mention from the explorer context menu. [pull/4000](https://github.com/sourcegraph/cody/pull/4000)
  - `Add File to Chat`: Add file to the current opened chat, or start a new chat if no panel is opened.
  - `New Chat with File Content`: Opens a new chat with the file content when no existing chat panel is open.
- Chat: New optimization for prompt quality and token usage, deduplicating context items, and optimizing token allocation. [pull/3929](https://github.com/sourcegraph/cody/pull/3929)
- Document Code/Generate Tests: User selections are now matched against known symbol ranges, and adjusted in cases where a user selection in a suitable subset of one of these ranges. [pull/4031](https://github.com/sourcegraph/cody/pull/4031)
- Extension: Added the `vscode.git` extension to the `extensionDependencies` list. [pull/4110](https://github.com/sourcegraph/cody/pull/4110)
- Command: Add a new `Generate Commit Message` command for generating commit messages, available in the Cody sidebar, command palette, and Source Control panel. [pull/4130](https://github.com/sourcegraph/cody/pull/4130)
- Chat: The new `GPT-4o` model is available for Cody Pro users. [pull/4164](https://github.com/sourcegraph/cody/pull/4164)

### Fixed

- Autocomplete: Handle incomplete Ollama response chunks gracefully. [pull/4066](https://github.com/sourcegraph/cody/pull/4066)
- Edit: Improved handling of responses that contain HTML entities. [pull/4085](https://github.com/sourcegraph/cody/pull/4085)
- Chat: Fixed an issue where the chat message editor field was not able to be scrolled with the mouse or trackpad. [pull/4127](https://github.com/sourcegraph/cody/pull/4127)

### Changed

- Extension has been renamed from `Cody AI` to `Cody: AI Coding Assistant with Autocomplete & Chat`. [pull/4079](https://github.com/sourcegraph/cody/pull/4079)
- Search: Cody's Natural Language Search has been moved to a new quick pick interface, and the search box has been removed from the sidebar. [pull/3991](https://github.com/sourcegraph/cody/pull/3991)
- Editor Context Menu: Updated the existing `Cody Chat: Add context` command to handle selected code from the editor as @-mention . [pull/4000](https://github.com/sourcegraph/cody/pull/4000)
  - `Add Code to Chat`: Add selected code to the current opened chat, or new chat if no panel is opened.
  - `New Chat with Code`: Opens a new chat with the selected code when no existing chat panel is open and code is selected in the editor.
- Fixes an issue where triggering a recipe with no open editor window will cause unexpected behavior. [pull/3911](https://github.com/sourcegraph/cody/pull/3911)
- Edit: The "Document Code" and "Generate Tests" commands now execute with a single click/action, rather than requiring the user to specify the range first. The range can be modified from the normal Edit input. [pull/4071](https://github.com/sourcegraph/cody/pull/4071)
- Chat: The model selector now groups chat model choices by characteristics (such as "Optimized for Accuracy", "Balanced", "Optimized for Speed", and "Ollama") and indicates the default choice. [pull/4033](https://github.com/sourcegraph/cody/pull/4033) and [pull/4133](https://github.com/sourcegraph/cody/pull/4133)

## [1.16.7]

### Added

### Fixed

- Chat: Fixed a bug where the chat model dropdown would not work on first click. [pull/4122](https://github.com/sourcegraph/cody/pull/4122)

### Changed

## [1.16.6]

### Added

- Edit: Added a maximum timeout to the formatting logic, so the Edit does not appear stuck if the users' formatter takes a particularly long amount of time. [pull/4113](https://github.com/sourcegraph/cody/pull/4113)

### Fixed

- Edit: Fixed cases where the formatting of an Edit would not respect the editor tab size with certain formatters. [pull/4111](https://github.com/sourcegraph/cody/pull/4111)

### Changed

## [1.16.5]

### Added

### Fixed

- Tutorial: Fixed a bug where the tutorial would not open on first authentication. [pull/4108](https://github.com/sourcegraph/cody/pull/4108)

### Changed

## [1.16.4]

### Added

### Fixed

- Chat: Fixed a bug where the entire Cody chat view would appear blank when clicking the chat model dropdown. [pull/4098](https://github.com/sourcegraph/cody/pull/4098)

### Changed

## [1.16.3]

### Added

### Fixed

- Tutorial: Fixed telemetry when activating the tutorial on first authentication. [pull/4068](https://github.com/sourcegraph/cody/pull/4068)
- Tutorial: Improved the reliability and discoverability of the Edit command. [pull/4068](https://github.com/sourcegraph/cody/pull/4068)

### Changed

## [1.16.2]

### Added

### Fixed

- Chat: Fixed a bug where the entire Cody chat view would appear blank. [pull/4062](https://github.com/sourcegraph/cody/pull/4062)

### Changed

## [1.16.1]

### Added

### Fixed

- Fixed a bug where old Sourcegraph instances' error messages caused Cody to ignore all context files. [pull/4024](https://github.com/sourcegraph/cody/pull/4024)
- Fixed a visually distracting drop shadow on some text labels in the model selection dropdown menu. [pull/4026](https://github.com/sourcegraph/cody/pull/4026)

### Changed

## [1.16.0]

### Added

- Chat: The context window for the `Claude 3 Sonnet` and `Claude 3 Opus` models is now increased by default for all non-Enterprise users, without requiring a feature flag. [pull/3953](https://github.com/sourcegraph/cody/pull/3953)
- Custom Commands: Added the ability to create new custom Edit commands via the Custom Command Menu. [pull/3862](https://github.com/sourcegraph/cody/pull/3862)
- Custom Commands: Added 'currentFile' option to include the full file content in the Custom Commands menu. [pull/3960](https://github.com/sourcegraph/cody/pull/3960)
- Chat: Pressing <kbd>Alt+Enter</kbd> or <kbd>Opt+Enter</kbd> will submit a chat message without enhanced context (only @-mentions). [pull/3996](https://github.com/sourcegraph/cody/pull/3996)

### Fixed

- Chat: Fixed an issue where Cody's responses were not visible in small windows. [pull/3865](https://github.com/sourcegraph/cody/pull/3865)
- Edit: Fixed an issue where an Edit task would not correctly respin when an irresolvable conflict is encountered. [pull/3872](https://github.com/sourcegraph/cody/pull/3872)
- Chat: Fixed an issue where older chats were displaying as 'N months ago' instead of the number in the Chat History sidebar. [pull/3864](https://github.com/sourcegraph/cody/pull/3864)
- Custom Commands: Fixed an issue where the "selection" option was not being toggled correctly based on the user's selection in the Custom Command menu. [pull/3960](https://github.com/sourcegraph/cody/pull/3960)
- Chat: Fixed an issue where the chat title showed up as "New Chat" when the question started with a new line. [pull/3977](https://github.com/sourcegraph/cody/pull/3977)

### Changed

- Sidebar (Settings & Support): For Pro & Enterprise, moved 'Account' up to the top. For Pro only, removed 'Usage' as it can be accessed via 'Account' → 'Manage Account'. [pull/3868](https://github.com/sourcegraph/cody/pull/3868)
- Debug: Removed the `cody.debug.enabled` setting. Baseline debugging is now enabled by default [pull/3873](https://github.com/sourcegraph/cody/pull/3873)
- Chat: The experimental Ollama Chat feature, which allows using local Ollama models for chat and commands, is now enabled by default. [pull/3914](https://github.com/sourcegraph/cody/pull/3914)
- Removed Claude 2, Claude 2.1 and Claude Instant from Cody Free and Cody Pro. All users are now upgraded to use Claude 3 by default [pull/3971](https://github.com/sourcegraph/cody/pull/3971)

## [1.14.0]

### Added

- Chat: Add highlighted code to Cody Chat as `@-mentions` context by right-clicking on the code and selecting `Cody Chat: Add context`. [pull/3713](https://github.com/sourcegraph/cody/pull/3713)
- Autocomplete: Add the proper infilling prompt for Codegemma when using Ollama. [pull/3754](https://github.com/sourcegraph/cody/pull/3754)
- Chat: The new `Mixtral 8x22B` chat model is available for Cody Pro users. [pull/3768](https://github.com/sourcegraph/cody/pull/3768)
- Chat: Add a "Pop out" button to the chat title bar that allows you to move Cody chat into a floating window. [pull/3773](https://github.com/sourcegraph/cody/pull/3773)
- Sidebar: A new button to copy the current Cody extension version to the clipboard shows up next to the Release Notes item in the SETTINGS & SUPPORT sidebar on hover. This is useful for reporting issues or getting information about the installed version. [pull/3802](https://github.com/sourcegraph/cody/pull/3802)
- Generate Unit Tests: Added a new code action "Ask Cody to Test" currently shows against functions in JS, TS, Go and Python. [pull/3763](https://github.com/sourcegraph/cody/pull/3763)
- Chat: @-mentions that exceed the context window will be displayed as invalid to make it easier to identify them during input. [pull/3742](https://github.com/sourcegraph/cody/pull/3742)

### Fixed

- Generate Unit Tests: Fixed an issue where Cody would generate tests for the wrong code in the file. [pull/3759](https://github.com/sourcegraph/cody/pull/3759)
- Chat: Fixed an issue where changing the chat model did not update the token limit for the model. [pull/3762](https://github.com/sourcegraph/cody/pull/3762)
- Troubleshoot: Don't show SignIn page if the authentication error is because of network connectivity issues [pull/3750](https://github.com/sourcegraph/cody/pull/3750)
- Edit: Large file warnings for @-mentions are now updated dynamically as you add or remove them. [pull/3767](https://github.com/sourcegraph/cody/pull/3767)
- Generate Unit Tests: Improved quality for creating file names. [pull/3763](https://github.com/sourcegraph/cody/pull/3763)
- Custom Commands: Fixed an issue where newly added custom commands were not working when clicked in the sidebar tree view. [pull/3804](https://github.com/sourcegraph/cody/pull/3804)
- Chat: Fixed an issue where whitespaces in messages submitted by users were omitted. [pull/3817](https://github.com/sourcegraph/cody/pull/3817)
- Chat: Improved token counting mechanism that allows more context to be correctly included or excluded. [pull/3742](https://github.com/sourcegraph/cody/pull/3742)
- Chat: Fixed an issue where context files were opened with an incorrect link for Enterprise users due to double encoding. [pull/3818](https://github.com/sourcegraph/cody/pull/3818)
- Chat: Line numbers for @-mentions are now included and counted toward the "x lines from y files" section in the UI. [pull/3842](https://github.com/sourcegraph/cody/pull/3842)

### Changed

- Command: Ghost text hint for `Document Code` ("Alt+D to Document") now only shows on documentable symbols without an existing docstring. [pull/3622](https://github.com/sourcegraph/cody/pull/3622)
- Chat: Updates to the latest GPT 4 Turbo model. [pull/3790](https://github.com/sourcegraph/cody/pull/3790)
- Chat: Slightly speeds up enhanced context fetching on Cody Free and Cody Pro when both embeddings and search is used. [pull/3798](https://github.com/sourcegraph/cody/pull/3798)
- Support Sidebar: Consolidated all support links to our new [Support page](https://srcgr.ph/cody-support), which includes a new [Community Forum](https://community.sourcegraph.com/c/cody/vs-code/6) for user discussion.. [pull/3803](https://github.com/sourcegraph/cody/pull/3803)
- Support Sidebar: Update the icon for Discord to use the official Discord logo. [pull/3803](https://github.com/sourcegraph/cody/pull/3803)
- Commands/Chat: Increased the maximum output limit of LLM responses. [pull/3797](https://github.com/sourcegraph/cody/pull/3797)
- Commands: Updated the naming of various code actions to be more descriptive. [pull/3831](https://github.com/sourcegraph/cody/pull/3831)
- Chat: Adds chat model to more telemetry events. [pull/3829](https://github.com/sourcegraph/cody/pull/3829)
- Telemetry: Adds a new telemetry event when users sign-in the first time. [pull/3836](https://github.com/sourcegraph/cody/pull/3836)

### Feature Flags

> This section covers experiments that run behind feature flags for non-Enterprise users.

- Chat: Increased context window size when using the `Claude 3 Sonnet` and `Claude 3 Opus` models. [pull/3742](https://github.com/sourcegraph/cody/pull/3742)

## [1.12.0]

### Added

- Edit/Chat: Cody now expands the selection to the nearest enclosing function, if available, before attempting to expand to the nearest enclosing block. [pull/3507](https://github.com/sourcegraph/cody/pull/3507)
- Edit: New `cody.edit.preInstruction` configuration option for adding custom instruction at the end of all your requests. [pull/3542](https://github.com/sourcegraph/cody/pull/3542)
- Edit: Add support for the new `cody.edit.preInstruction` setting. [pull/3542](https://github.com/sourcegraph/cody/pull/3542)
- Edit: Added telemetry to measure the persistence of edits in the document. [pull/3550](https://github.com/sourcegraph/cody/pull/3550)
- Edit: "Ask Cody to Fix" now uses Claude 3 Sonnet. [pull/3555](https://github.com/sourcegraph/cody/pull/3555)
- Chat: Added buttons in the chat input box for enabling/disabling Enhanced Context. [pull/3547](https://github.com/sourcegraph/cody/pull/3547)
- Edit: Display warnings for large @-mentioned files during selection. [pull/3494](https://github.com/sourcegraph/cody/pull/3494)
- Edit: Automatically show open tabs as available options when triggering an @-mention. [pull/3494](https://github.com/sourcegraph/cody/pull/3494)
- `Cody Debug: Report Issue` command to easily file a pre-filled GitHub issue form for reporting bugs and issues directly inside VS Code. The `Cody Debug: Report Issue` command is accessible from the command palette and the `...` menu in the Cody Support sidebar. [pull/3624](https://github.com/sourcegraph/cody/pull/3624)

### Fixed

- Chat: Fixed issue where large files could not be added via @-mention. You can now @-mention line ranges within large files. [pull/3531](https://github.com/sourcegraph/cody/pull/3531) & [pull/3585](https://github.com/sourcegraph/cody/pull/3585)
- Edit: Improved the response reliability, Edit commands should no longer occasionally produce Markdown outputs.[pull/3192](https://github.com/sourcegraph/cody/pull/3192)
- Chat: Handle empty chat message input and prevent submission of empty messages. [pull/3554](https://github.com/sourcegraph/cody/pull/3554)
- Chat: Warnings are now displayed correctly for large files in the @-mention file selection list. [pull/3526](https://github.com/sourcegraph/cody/pull/3526)
- Custom Commands: Errors when running context command scripts now show the error output in the notification message. [pull/3565](https://github.com/sourcegraph/cody/pull/3565)
- Edit: Improved the response reliability, Edit commands should no longer occasionally produce Markdown outputs. [pull/3192](https://github.com/sourcegraph/cody/pull/3192)
- Edit: The `document` command now defaults to Claude 3 Haiku. [pull/3572](https://github.com/sourcegraph/cody/pull/3572)

### Changed

- Chat: A new design for chat messages, with avatars and a separate context row. [pull/3639](https://github.com/sourcegraph/cody/pull/3639)
- Chat: The Enhanced Context Settings modal is opened by default for the first chat session. [pull/3547](https://github.com/sourcegraph/cody/pull/3547)
- Add information on which Cody tier is being used to analytics events. [pull/3508](https://github.com/sourcegraph/cody/pull/3508)
- Auth: Enable the new onboarding flow that does not require the redirect back to VS Code for everyone. [pull/3574](https://github.com/sourcegraph/cody/pull/3574)
- Chat: Claude 3 Sonnet is now the default model for every Cody Free or Pro user. [pull/3575](https://github.com/sourcegraph/cody/pull/3575)
- Edit: Removed a previous Edit shortcut (`Shift+Cmd/Ctrl+v`), use `Opt/Alt+K` to trigger Edits. [pull/3591](https://github.com/sourcegraph/cody/pull/3591)
- Commands: The `Editor Title Icon` configuration option has been removed from the Cody Settings menu. Users can configure the title bar icon by right-clicking on the title bar. [pull/3677](https://github.com/sourcegraph/cody/pull/3677)

### Feature Flags

> This section covers experiments that run behind feature flags for non-Enterprise users.

- Hover Commands: Cody commands are now integrated with the native hover provider, allowing you to seamlessly access essential commands on mouse hover. [pull/3585](https://github.com/sourcegraph/cody/pull/3585)

## [1.10.2]

### Added

- Cody Enterprise users now have access to an `experimental-openaicompatible` which allows bringing your own LLM via any OpenAI-compatible API. For now, this is only supported with Starchat and specific configurations - but we continue to generalize this work to support more models and OpenAI-compatible endpoints. [pull/3218](https://github.com/sourcegraph/cody/pull/3218)

## [1.10.1]

### Added

- Autocomplete: Add Claude 3 Haiku experimental autocomplete support. [pull/3538](https://github.com/sourcegraph/cody/pull/3538)

### Changed

- Telemetry: Upgrade Sentry version. [pull/3502](https://github.com/sourcegraph/cody/pull/3502)
- Autocomplete: Subsequent new lines are added to the singleline stop sequences. [pull/3549](https://github.com/sourcegraph/cody/pull/3549)

## [1.10.0]

### Added

- Added support links for Cody Pro and Enterprise users. [pull/3330](https://github.com/sourcegraph/cody/pull/3330)
- Autocomplete: Add StarCoder2 experimental support. [pull/61207](https://github.com/sourcegraph/cody/pull/61207)
- Autocomplete: Add `cody.autocomplete.experimental.fireworksOptions` for local debugging with Fireworks. [pull/3415](https://github.com/sourcegraph/cody/pull/3415)
- Chat: Add Claude 3 Haiku for Pro users. [pull/3423](https://github.com/sourcegraph/cody/pull/3423)
- Chat: Upgrade GPT 4 turbo model. [pull/3468](https://github.com/sourcegraph/cody/pull/3468)
- Chat: Added experimental support for including web pages as context by @-mentioning a URL (when the undocumented `cody.experimental.urlContext` VS Code setting is enabled). [pull/3436](https://github.com/sourcegraph/cody/pull/3436)
- Document: Added support for automatically determining the symbol and range of a documentable block from the users' cursor position. Currently supported in JavaScript, TypeScript, Go and Python. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)
- Document: Added a ghost text hint ("Alt+D to Document") that shows when the users' cursor is on a documentable symbol. Currently supported in JavaScript, TypeScript, Go and Python. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)
- Document: Added a shortcut (`Alt+D`) to immediately execute the document command. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)
- Edit: Added a ghost text hint ("Alt+K to Generate Code") that shows on empty files. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)

### Fixed

- Chat: When `@`-mentioning files in chat and edits, the list of fuzzy-matching files is shown much faster (which is especially noticeable in large workspaces).
- Chat: Fix abort related error messages with Claude 3. [pull/3466](https://github.com/sourcegraph/cody/pull/3466)
- Document: Fixed an issue where the generated documentation would be incorrectly inserted for Python. Cody will now follow PEP 257 – Docstring Conventions. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)
- Edit: Fixed incorrect decorations being shown for edits that only insert new code. [pull/3424](https://github.com/sourcegraph/cody/pull/3424)

### Changed

- Autocomplete: Upgrade tree-sitter and expand language support. [pull/3373](https://github.com/sourcegraph/cody/pull/3373)
- Autocomplete: Do not cut off completions when they are almost identical to the following non-empty line. [pull/3377](https://github.com/sourcegraph/cody/pull/3377)
- Autocomplete: Enabled dynamic multiline completions by default. [pull/3392](https://github.com/sourcegraph/cody/pull/3392)
- Autocomplete: Improve StarCoder2 Ollama support. [pull/3452](https://github.com/sourcegraph/cody/pull/3452)
- Autocomplete: Upgrade tree-sitter grammars and add Dart support. [pull/3476](https://github.com/sourcegraph/cody/pull/3476)
- Autocomplete: Wrap tree-sitter parse calls in OpenTelemetry spans. [pull/3419](https://github.com/sourcegraph/cody/pull/3419)
- Chat: The <kbd>UpArrow</kbd> key in an empty chat editor now edits the most recently sent message instead of populating the editor with the last message's text.
- Chat: The chat editor uses a new rich editor component. If you open an old chat added before this version and edit a message in the transcript with @-mentions, the @-mentions will show up as plain text and will not actually include the mentioned files unless you re-type them.
- Command: Enhanced the context provided to the Test command to help the language model determine the appropriate testing framework to use. [pull/3344](https://github.com/sourcegraph/cody/pull/3344)
- Document: Upgraded to use a faster model. [pull/3275](https://github.com/sourcegraph/cody/pull/3275)
- Properly throw an error when attempting to parse an incomplete SSE stream with the nodeClient. [pull/3479](https://github.com/sourcegraph/cody/pull/3479)

## [1.8.3]

### Fixed

- Fix crash upon initialization in the stable build if a prerelease version of the VS Code extension was used for chat after 2024-03-08. [pull/3394](https://github.com/sourcegraph/cody/pull/3394)

## [1.8.2]

### Added

- Debug: Added new commands (`Cody Debug: Enable Debug Mode` and `Cody Debug: Open Output Channel`) to the editor Command Palette and the `Settings & Support` sidebar to streamline the process of getting started with debugging Cody. [pull/3342](https://github.com/sourcegraph/cody/pull/3342)

### Fixed

- Chat: Fixed an issue where in some cases the entire document instead of just the visible portion would be included as context. [pull/3351](https://github.com/sourcegraph/cody/pull/3351)
- Chat: Fixed an issue where user aborts was not handled correctly for Claude 3. [pull/3355](https://github.com/sourcegraph/cody/pull/3355)

### Changed

- Autocomplete: Improved the stop sequences list for Ollama models. [pull/3352](https://github.com/sourcegraph/cody/pull/3352)
- Chat: Welcome message is only shown on new chat panel. [pull/3341](https://github.com/sourcegraph/cody/pull/3341)
- Chat: Wrap pasted code blocks in triple-backticks automatically. [pull/3357](https://github.com/sourcegraph/cody/pull/3357)
- Command: You can now choose a LLM model for the Generate Unit Test command. [pull/3343](https://github.com/sourcegraph/cody/pull/3343)

## [1.8.1]

### Added

### Fixed

- Fixed an issue with the new auth experience that could prevent you from opening a sign in link. [pull/3339](https://github.com/sourcegraph/cody/pull/3339)
- Custom Commands: Fixed an issue that blocked shell commands from running on Windows. [pull/3333](https://github.com/sourcegraph/cody/pull/3333)

### Changed

## [1.8.0]

### Added

- Chat: Adds experimental support for local Ollama chat models. Simply start the Ollama app. You should be able to find the models you have pulled from Ollama in the model dropdown list in your chat panel after restarting VS Code. For detailed instructions, see [pull/3282](https://github.com/sourcegraph/cody/pull/3282)
- Chat: Adds support for line ranges with @-mentioned files (Example: `Explain @src/README.md:1-5`). [pull/3174](https://github.com/sourcegraph/cody/pull/3174)
- Chat: Command prompts are now editable and compatible with @ mentions. [pull/3243](https://github.com/sourcegraph/cody/pull/3243)
- Chat: Add Claude 3 Sonnet and Claude 3 Opus for Pro users. [pull/3301](https://github.com/sourcegraph/cody/pull/3301)
- Commands: Updated the prompts for the `Explain Code` and `Find Code Smell` commands to include file ranges. [pull/3243](https://github.com/sourcegraph/cody/pull/3243)
- Custom Command: All custom commands are now listed individually under the `Custom Commands` section in the Cody sidebar. [pull/3245](https://github.com/sourcegraph/cody/pull/3245)
- Custom Commands: You can now assign keybindings to individual custom commands. Simply search for `cody.command.custom.{CUSTOM_COMMAND_NAME}` (e.g. `cody.command.custom.commit`) in the Keyboard Shortcuts editor to add keybinding. [pull/3242](https://github.com/sourcegraph/cody/pull/3242)
- Chat/Search: Local indexes are rebuilt automatically on a daily cadence when they are stale. Staleness is determined by checking whether files have changed across Git commits and in the set of working file updates not yet committed. [pull/3261](https://github.com/sourcegraph/cody/pull/3261)
- Debug: Added `Export Logs` functionality to `Settings & Support` sidebar for exporting output logs when `cody.debug.enabled` is enabled. Also available in the Command Palette under `Cody: Export Logs`. [pull/3256](https://github.com/sourcegraph/cody/pull/3256)
- Auth: Adds a new onboarding flow that does not require the redirect back to VS Code behind a feature flag. [pull/3244](https://github.com/sourcegraph/cody/pull/3244)
- Font: Adds Ollama logo. [pull/3281](https://github.com/sourcegraph/cody/pull/3281)

### Fixed

- Auth: Logging in via redirect should now work in Cursor. This requires Sourcegraph 5.3.2 or later. [pull/3241](https://github.com/sourcegraph/cody/pull/3241)
- Chat: Fixed error `found consecutive messages with the same speaker 'assistant'` that occurred when prompt length exceeded limit. [pull/3228](https://github.com/sourcegraph/cody/pull/3228)
- Edit: Fixed an issue where preceding and following text would not be included for instruction-based Edits. [pull/3309](https://github.com/sourcegraph/cody/pull/3309)

### Changed

- Debug: The `cody.debug.enabled` setting is now set to `true` by default. [pull/](https://github.com/sourcegraph/cody/pull/)

## [1.6.1]

### Changed

- Autocomplete: Reduce the adaptive timeout to match latency improvements. [pull/3283](https://github.com/sourcegraph/cody/pull/3283)

## [1.6.0]

### Added

- Autocomplete: Adds a new experimental throttling mechanism that should decrease latency and backend load. [pull/3186](https://github.com/sourcegraph/cody/pull/3186)
- Edit: Added keyboard shortcuts for codelens actions such as "Undo" and "Retry" [pull/2757][https://github.com/sourcegraph/cody/pull/2757]
- Chat: Displays warnings for large @-mentioned files during selection. [pull/3118](https://github.com/sourcegraph/cody/pull/3118)
- Once [sourcegraph/sourcegraph#60515](https://github.com/sourcegraph/sourcegraph/pull/60515) is deployed, login works in VSCodium. [pull/3167](https://github.com/sourcegraph/cody/pull/3167)

### Fixed

- Autocomplete: Fixed an issue where the loading indicator might get stuck in the loading state. [pull/3178](https://github.com/sourcegraph/cody/pull/3178)
- Autocomplete: Fixes an issue where Ollama results were sometimes not visible when the current line has text after the cursor. [pull/3213](https://github.com/sourcegraph/cody/pull/3213)
- Chat: Fixed an issue where Cody Chat steals focus from file editor after a request is completed. [pull/3147](https://github.com/sourcegraph/cody/pull/3147)
- Chat: Fixed an issue where the links in the welcome message for chat are unclickable. [pull/3155](https://github.com/sourcegraph/cody/pull/3155)
- Chat: File range is now displayed correctly in the chat view. [pull/3172](https://github.com/sourcegraph/cody/pull/3172)

### Changed

- Autocomplete: Removes the latency for cached completions. [pull/3138](https://github.com/sourcegraph/cody/pull/3138)
- Autocomplete: Enable the recent jaccard similarity improvements by default. [pull/3135](https://github.com/sourcegraph/cody/pull/3135)
- Autocomplete: Start retrieval phase earlier to improve latency. [pull/3149](https://github.com/sourcegraph/cody/pull/3149)
- Autocomplete: Trigger one LLM request instead of three for multiline completions to reduce the response latency. [pull/3176](https://github.com/sourcegraph/cody/pull/3176)
- Autocomplete: Allow the client to pick up feature flag changes that were previously requiring a client restart. [pull/2992](https://github.com/sourcegraph/cody/pull/2992)
- Chat: Add tracing. [pull/3168](https://github.com/sourcegraph/cody/pull/3168)
- Command: Leading slashes are removed from command names in the command menu. [pull/3061](https://github.com/sourcegraph/cody/pull/3061)

## [1.4.4]

### Added

### Fixed

- The signin menu now displays a warning for invalid URL input. [pull/3156](https://github.com/sourcegraph/cody/pull/3156)

### Changed

## [1.4.3]

### Added

- Autocomplete: Updated the BFG binary version. [pull/3130](https://github.com/sourcegraph/cody/pull/3130)

### Changed

## [1.4.2]

### Fixed

- Chat: Fixed an issue where Cody would sometimes exceed the context window limit for shorter context OpenAI models. [pull/3121](https://github.com/sourcegraph/cody/pull/3121)

## [1.4.1]

### Added

- Chat: Support `@-mentioned` in mid sentences. [pull/3043](https://github.com/sourcegraph/cody/pull/3043)
- Chat: Support `@-mentioned` in editing mode. [pull/3091](https://github.com/sourcegraph/cody/pull/3091)

### Fixed

- Autocomplete: Fixed the completion partial removal upon acceptance caused by `cody.autocomplete.formatOnAccept`. [pull/3083](https://github.com/sourcegraph/cody/pull/3083)

### Changed

- Autocomplete: Improve client side tracing to get a better understanding of the E2E latency. [pull/3034](https://github.com/sourcegraph/cody/pull/3034)
- Autocomplete: Move some work off the critical path in an attempt to further reduce latency. [pull/3096](https://github.com/sourcegraph/cody/pull/3096)
- Custom Command: The `description` field is now optional and will default to use the command prompt. [pull/3025](https://github.com/sourcegraph/cody/pull/3025)

## [1.4.0]

### Added

- Autocomplete: Add a new `cody.autocomplete.disableInsideComments` option to prevent completions from being displayed while writing code comments. [pull/3049](https://github.com/sourcegraph/cody/pull/3049)
- Autocomplete: Added a shortcut to go to the Autocomplete settings from the Cody Settings overlay. [pull/3048](https://github.com/sourcegraph/cody/pull/3048)
- Chat: Display Cody icon in the editor title of the chat panels when `cody.editorTitleCommandIcon` is enabled. [pull/2937](https://github.com/sourcegraph/cody/pull/2937)
- Command: The `Generate Unit Tests` command now functions as an inline edit command. When executed, the new tests will be automatically appended to the test file. If no existing test file is found, a temporary one will be created. [pull/2959](https://github.com/sourcegraph/cody/pull/2959)
- Command: You can now highlight the output in your terminal panel and right-click to `Ask Cody to Explain`. [pull/3008](https://github.com/sourcegraph/cody/pull/3008)
- Edit: Added a multi-model selector to the Edit input, allowing quick access to change the Edit LLM. [pull/2951](https://github.com/sourcegraph/cody/pull/2951)
- Edit: Added Cody Pro support for models: GPT-4, GPT-3.5, Claude 2.1 and Claude Instant. [pull/2951](https://github.com/sourcegraph/cody/pull/2951)
- Edit: Added new keyboard shortcuts for Edit (`Alt+K`) and Chat (`Alt+L`). [pull/2865](https://github.com/sourcegraph/cody/pull/2865)
- Edit: Improved the input UX. You can now adjust the range of the Edit, select from available symbols in the document, and get quick access to the "Document" and "Test" commands. [pull/2884](https://github.com/sourcegraph/cody/pull/2884)
- Edit/Chat: Added "ghost" text alongside code to showcase Edit and Chat commands. Enable it by setting `cody.commandHints.enabled` to true. [pull/2865](https://github.com/sourcegraph/cody/pull/2865)
- [Internal] Command: Added new code lenses for generating additional unit tests. [pull/2959](https://github.com/sourcegraph/cody/pull/2959)

### Fixed

- Chat: Messages without enhanced context should not include the sparkle emoji in context list. [pull/3006](https://github.com/sourcegraph/cody/pull/3006)
- Custom Command: Fixed an issue where custom commands could fail to load due to an invalid entry (e.g. missing prompt). [pull/3012](https://github.com/sourcegraph/cody/pull/3012)
- Edit: Fixed an issue where "Ask Cody to Explain" would result in an error. [pull/3015](https://github.com/sourcegraph/cody/pull/3015)

### Changed

- Autocomplete: Expanded the configuration list to include `astro`, `rust`, `svelte`, and `elixir` for enhanced detection of multiline triggers. [pulls/3044](https://github.com/sourcegraph/cody/pull/3044)
- Autocomplete: Improved the new jaccard similarity retriever and context mixing experiments. [pull/2898](https://github.com/sourcegraph/cody/pull/2898)
- Autocomplete: Multiline completions are now enabled only for languages from a predefined list. [pulls/3044](https://github.com/sourcegraph/cody/pull/3044)
- Autocomplete: Remove obvious prompt-continuations. [pull/2974](https://github.com/sourcegraph/cody/pull/2974)
- Autocomplete: Enables the new fast-path mode for all Cody community users to directly connect with our inference service. [pull/2927](https://github.com/sourcegraph/cody/pull/2927)
- Autocomplete: Rename `unstable-ollama` option to `experimental-ollama` to better communicate the current state. We still support `unstable-ollama` in the config for backward compatibility. [pull/3077](https://github.com/sourcegraph/cody/pull/3077)
- Chat: Edit buttons are disabled on messages generated by the default commands. [pull/3005](https://github.com/sourcegraph/cody/pull/3005)

## [1.2.3]

### Added

- Autocomplete: local inference support with [deepseek-coder](https://ollama.ai/library/deepseek-coder) powered by ollama. [pull/2966](https://github.com/sourcegraph/cody/pull/2966)
- Autocomplete: Add a new experimental fast-path mode for Cody community users that directly connections to our inference services. [pull/2927](https://github.com/sourcegraph/cody/pull/2927)

## [1.2.2]

### Fixed

- Fixed an issue where the natural language search panel would disappear instead of showing results. [pull/2981](https://github.com/sourcegraph/cody/pull/2981)

## [1.2.1]

### Fixed

- Fixed an authentication issue that caused users to be unable to sign in. [pull/2943](https://github.com/sourcegraph/cody/pull/2943)
- Chat: Updated Chat input tips as commands are no longer executable from chat. [pull/2934](https://github.com/sourcegraph/cody/pull/2934)
- Custom Command: Removed codebase as context option from the custom command menu. [pull/2932](https://github.com/sourcegraph/cody/pull/2932)
- Command: Add `/ask` back to the Cody command menu, which was removed by accident. [pull/2939](https://github.com/sourcegraph/cody/pull/2939)

### Changed

- Chat: Updated message placeholder to mention you can @# to include symbols. [pull/2866](https://github.com/sourcegraph/cody/pull/2866)

## [1.2.0]

### Added

- Chat: Add a history quick in the editor panel for chats grouped by last interaction timestamp. [pull/2250](https://github.com/sourcegraph/cody/pull/2250)
- Added support for the new `fireworks/starcoder` virtual model name when used in combination with an Enterprise instance. [pull/2714](https://github.com/sourcegraph/cody/pull/2714)
- Chat: Added support for editing any non-command chat messages. [pull/2826](https://github.com/sourcegraph/cody/pull/2826)
- Chat: New action buttons added above the chat input area for easy keyboard access. [pull/2826](https://github.com/sourcegraph/cody/pull/2826)
- Chat: Using 'Up'/'Down' to reuse previous chat messages will now correctly bring `@`-mentioned files [pull/2473](https://github.com/sourcegraph/cody/pull/2473)
- Chat: Enterprise users can now search multiple repositories for context. [pull/2879](https://github.com/sourcegraph/cody/pull/2879)
- [Internal] Edit/Chat: Added "ghost" text alongside code to showcase Edit and Chat commands. [pull/2611](https://github.com/sourcegraph/cody/pull/2611)
- [Internal] Edit/Chat: Added Cmd/Ctrl+K and Cmd/Ctrl+L commands to trigger Edit and Chat [pull/2611](https://github.com/sourcegraph/cody/pull/2611)

### Fixed

- Edit: Fixed an issue where concurrent applying edits could result in the incorrect insertion point for a new edit. [pull/2707](https://github.com/sourcegraph/cody/pull/2707)
- Edit: Fixed an issue where the file/symbol hint would remain even after the file/symbol prefix had been deleted. [pull/2712](https://github.com/sourcegraph/cody/pull/2712)
- Commands: Fixed an issue where Cody failed to register additional instructions followed by the command key when submitted from the command menu. [pull/2789](https://github.com/sourcegraph/cody/pull/2789)
- Chat: The title for the chat panel is now reset correctly on "Restart Chat Session"/"New Chat Session" button click. [pull/2786](https://github.com/sourcegraph/cody/pull/2786)
- Chat: Fixed an issue where Ctrl+Enter on Windows would not work (did not send a follow-on chat). [pull/2823](https://github.com/sourcegraph/cody/pull/2823)
- Fixes an issue where the codebase URL was not properly inferred for a git repo when the repo name contains dots. [pull/2901](https://github.com/sourcegraph/cody/pull/2901)
- Chat: Fixed an issue where the user authentication view appeared in the chat panel. [pull/2904](https://github.com/sourcegraph/cody/pull/2904)

### Changed

- Changed code block UI to show actions immediately instead of waiting for Cody's response to be completed. [pull/2737](https://github.com/sourcegraph/cody/pull/2737)
- Removed recipes, which were replaced by commands in November 2023 (version 0.18.0).
- Edit: Updated the codelens display to be more descriptive. [pull/2710](https://github.com/sourcegraph/cody/pull/2710)
- New chats are now the default when the user submits a new quesetion. Previously, follow-up questions were the default, but this frequently led to exceeding the LLM context window, which users interpreted as an error state. Follow-up questions are still accessible via ⌘-Enter or Ctrl-Enter. [pull/2768](https://github.com/sourcegraph/cody/pull/2768)
- We now allocate no more than 60% of the overall LLM context window for enhanced context. This preserves more room for follow-up questions and context. [pull/2768](https://github.com/sourcegraph/cody/pull/2768)
- Chat: Renamed the "Restart Chat Session" button to "New Chat Session". [pull/2786](https://github.com/sourcegraph/cody/pull/2786)
- Removed the `cody.experimental.chatPredictions` setting. [pull/2848](https://github.com/sourcegraph/cody/pull/2848)
- Removed support for the `context.codebase` custom command property. [pull/2848](https://github.com/sourcegraph/cody/pull/2848)
- Autocomplete: Better cancellation of requests that are no longer relevant. [pull/2855](https://github.com/sourcegraph/cody/pull/2855)
- Updated Enhanced Context popover copy and added a link to the docs. [pull/2864](https://github.com/sourcegraph/cody/pull/2864)
- Include meta information about unit test files in Autocomplete analytics. [pull/2868](https://github.com/sourcegraph/cody/pull/2868)
- Moved the Context Limit errors in chat into the deboug log output. [pull/2891](https://github.com/sourcegraph/cody/pull/2891)
- Cleaned up chat editor title buttons & history separators. [pull/2895](https://github.com/sourcegraph/cody/pull/2895)
- Context: Embeddings search by sourcegraph.com have been removed. For the moment, remote embeddings may still affect results for Sourcegraph Enterprise users through the new multi-repo search feature described above. Local embeddings are not affected by this change. [pull/2879](https://github.com/sourcegraph/cody/pull/2879)
- [Internal] New generate unit test available behind `cody.internal.unstable`. [pull/2646](https://github.com/sourcegraph/cody/pull/2646)
- Commands: Slash commands are no longer supported in chat panel. [pull/2869](https://github.com/sourcegraph/cody/pull/2869)
- Commands: The underlying prompt for the default chat commands will be displayed in the chat panel. [pull/2869](https://github.com/sourcegraph/cody/pull/2869)

## [1.1.3]

### Added

### Fixed

- Autocomplete: Fixes an issue where the context retriever would truncate the results too aggressively. [pull/2652](https://github.com/sourcegraph/cody/pull/2652)
- Autocomplete: Improve the stability of multiline completion truncation during streaming by gracefully handling missing brackets in incomplete code segments. [pull/2682](https://github.com/sourcegraph/cody/pull/2682)
- Autocomplete: Improves the jaccard similarity retriever to find better matches. [pull/2662](https://github.com/sourcegraph/cody/pull/2662)
- Fixed prompt construction issue for the edit command. [pull/2716](https://github.com/sourcegraph/cody/pull/2716)

### Changed

- Made the Enterprise login button more prominent. [pull/2672](https://github.com/sourcegraph/cody/pull/2672)
- Edit: Cody will now always generate new code when the cursor is on an empty line. [pull/2611](https://github.com/sourcegraph/cody/pull/2611)

## [1.1.2]

### Fixed

- Fixing Steal the cursor issue https://github.com/sourcegraph/cody/pull/2674

## [1.1.1]

### Fixed

- Fixed authentication issue when trying to connect to an enterprise instance. [pull/2667](https://github.com/sourcegraph/cody/pull/2667)

## [1.1.0]

### Added

- Edit: Added support for user-provided context. Use "@" to include files and "@#" to include specific symbols. [pull/2574](https://github.com/sourcegraph/cody/pull/2574)
- Autocomplete: Experimental support for inline completions with Code Llama via [Ollama](https://ollama.ai/) running locally. [pull/2635](https://github.com/sourcegraph/cody/pull/2635)

### Fixed

- Chat no longer shows "embeddings" as the source for all automatically included context files [issues/2244](https://github.com/sourcegraph/cody/issues/2244)/[pull/2408](https://github.com/sourcegraph/cody/pull/2408)
- Display the source and range of enhanced context correctly in UI. [pull/2542](https://github.com/sourcegraph/cody/pull/2542)
- Context from directory for commands and custom commands now shows up correctly under enhanced context. [issues/2548](https://github.com/sourcegraph/cody/issues/2548)/[pull/2542](https://github.com/sourcegraph/cody/pull/2542)
- @-mentioning the same file a second time in chat no longer duplicates the filename prefix [issues/2243](https://github.com/sourcegraph/cody/issues/2243)/[pull/2474](https://github.com/sourcegraph/cody/pull/2474)
- Do not automatically append open file name to display text for chat questions. [pull/2580](https://github.com/sourcegraph/cody/pull/2580)
- Fixed unresponsive stop button in chat when an error is presented. [pull/2588](https://github.com/sourcegraph/cody/pull/2588)
- Added existing `cody.useContext` config to chat to control context fetching strategy. [pull/2616](https://github.com/sourcegraph/cody/pull/2616)
- Fixed extension start up issue for enterprise users who do not have primary email set up. [pull/2665](https://github.com/sourcegraph/cody/pull/2665)
- All Chat windows are now closed properly on sign out. [pull/2665](https://github.com/sourcegraph/cody/pull/2665)
- Fixed issue with incorrect chat model selected on first chat session for DotCom users after reauthorization. [issues/2648](https://github.com/sourcegraph/cody/issues/2648)
- Fixed unresponsive dropdown menu for selecting chat model in Chat view. [pull/2627](https://github.com/sourcegraph/cody/pull/2627)
- [Internal] Opening files with non-file schemed URLs no longer breaks Autocomplete when `.cody/ignore` is enabled. [pull/2640](https://github.com/sourcegraph/cody/pull/2640)

### Changed

- Chat: Display chats in the treeview provider grouped by last interaction timestamp. [pull/2250](https://github.com/sourcegraph/cody/pull/2250)
- Autocomplete: Accepting a full line completion will not immedialty start another completion request on the same line. [pulls/2446](https://github.com/sourcegraph/cody/pull/2446)
- Folders named 'bin/' are no longer filtered out from chat `@`-mentions but instead ranked lower. [pull/2472](https://github.com/sourcegraph/cody/pull/2472)
- Files ignored in `.cody/ignore` (if the internal experiment is enabled) will no longer show up in chat `@`-mentions. [pull/2472](https://github.com/sourcegraph/cody/pull/2472)
- Adds a new experiment to test a higher parameter StarCoder model for single-line completions. [pull/2632](https://github.com/sourcegraph/cody/pull/2632)
- [Internal] All non-file schemed URLs are now ignored by default when `.cody/ignore` is enabled. [pull/2640](https://github.com/sourcegraph/cody/pull/2640)

## [1.0.5]

### Added

- [Internal] New `cody.internal.unstable` setting for enabling unstable experimental features for internal use only. Included `.cody/ignore` for internal testing. [pulls/1382](https://github.com/sourcegraph/cody/pull/1382)

### Fixed

- @-mentioning files on Windows no longer sometimes renders visible markdown for the links in the chat [issues/2388](https://github.com/sourcegraph/cody/issues/2388)/[pull/2398](https://github.com/sourcegraph/cody/pull/2398)
- Mentioning multiple files in chat no longer only includes the first file [issues/2402](https://github.com/sourcegraph/cody/issues/2402)/[pull/2405](https://github.com/sourcegraph/cody/pull/2405)
- Enhanced context is no longer added to commands and custom commands that do not require codebase context. [pulls/2537](https://github.com/sourcegraph/cody/pull/2537)
- Unblock `AltGraph` key on chat inputs. [pulls/2558](https://github.com/sourcegraph/cody/pull/2558)
- Display error messages from the LLM without replacing existing responses from Cody in the Chat UI. [pull/2566](https://github.com/sourcegraph/cody/pull/2566)

### Changed

- The `inline` mode for Custom Commands has been removed. [pull/2551](https://github.com/sourcegraph/cody/pull/2551)

## [1.0.4]

### Added

### Fixed

- Fixed config parsing to ensure we read the right remote server endpoint everywhere. [pulls/2456](https://github.com/sourcegraph/cody/pull/2456)

### Changed

- Autocomplete: Accepting a full line completion will not immediately start another completion request on the same line. [pulls/2446](https://github.com/sourcegraph/cody/pull/2446)
- Changes to the model in the new chat experience on the Cody Pro plan will now be remembered. [pull/2438](https://github.com/sourcegraph/cody/pull/2438)

## [1.0.3]

### Added

### Fixed

### Changed

- Logging improvements for accuracy. [pulls/2444](https://github.com/sourcegraph/cody/pull/2444)

## [1.0.2]

### Added

### Fixed

- Chat: Honor the cody.codebase setting for manually setting the remote codebase context. [pulls/2415](https://github.com/sourcegraph/cody/pull/2415)
- Fixes the Code Lenses feature. [issues/2428](https://github.com/sourcegraph/cody/issues/2428)

### Changed

- The chat history is now associated to the currently logged in account. [issues/2261](https://github.com/sourcegraph/cody/issues/2261)

## [1.0.1]

### Added

### Fixed

- Fixes an issue where GPT 3.5 requests were sometimes left hanging. [pull/2386](https://github.com/sourcegraph/cody/pull/2386)
- Chat: Use the proper token limits for enterprise users. [pulls/2395](https://github.com/sourcegraph/cody/pull/2395)

### Changed

- Hide the LLM dropdown in the new Chat UX for enterprise instances where there is no choice to switch models. [pulls/2393](https://github.com/sourcegraph/cody/pull/2393)

## [1.0.0]

### Added

- Adds support for Mixtral by Mistral in the LLM dropdown list. [issues/2307](https://github.com/sourcegraph/cody/issues/2307)

### Fixed

- Context: The "Continue Indexing" button works on Windows. [issues/2328](https://github.com/sourcegraph/cody/issues/2328)
- Context: The "Embeddings Incomplete" status bar item shows an accurate percent completion. Previously we showed the percent *in*complete, but labeled it percent complete. We no longer display a spurious "Cody Embeddings Index Complete" toast if indexing fails a second time. [pull/2368](https://github.com/sourcegraph/cody/pull/2368)

### Changed

- Updates the code smell icon so it does not stand out in some VS Code themes.

## [0.18.6]

### Added

- Context: Incomplete embeddings indexing status can seen in the status bar. On macOS and Linux, indexing can be resumed by clicking there. However Windows users will still see an OS error 5 (access denied) when retrying indexing. [pull/2265](https://github.com/sourcegraph/cody/pull/2265)
- Autocomplete: Add the `cody.autocomplete.formatOnAccept` user setting, which allows users to enable or disable the automatic formatting of autocomplete suggestions upon acceptance. [pull/2327](https://github.com/sourcegraph/cody/pull/2327)

### Fixed

- Autocomplete: Don't show loading indicator when a user is rate limited. [pull/2314](https://github.com/sourcegraph/cody/pull/2314)
- Fixes an issue where the wrong rate limit count was shown. [pull/2312](https://github.com/sourcegraph/cody/pull/2312)
- Chat: Fix icon rendering on the null state. [pull/2336](https://github.com/sourcegraph/cody/pull/2336)
- Chat: The current file, when included as context, is now shown as a relative path and is a clickable link. [pull/2344](https://github.com/sourcegraph/cody/pull/2344)
- Chat: Reopened chat panels now use the correct chat title. [pull/2345](https://github.com/sourcegraph/cody/pull/2345)
- Chat: Fixed an issue where the command settings menu would not open when clicked. [pull/2346](https://github.com/sourcegraph/cody/pull/2346)
- Fixed an issue where `/reset` command throws an error in the chat panel. [pull/2313](https://github.com/sourcegraph/cody/pull/2313)

### Changed

- Update Getting Started Guide. [pull/2279](https://github.com/sourcegraph/cody/pull/2279)
- Commands: Edit commands are no longer shown in the chat slash command menu. [pull/2339](https://github.com/sourcegraph/cody/pull/2339)
- Change Natural Language Search to Beta [pull/2351](https://github.com/sourcegraph/cody/pull/2351)

## [0.18.5]

### Added

### Fixed

- Chat: Fixed support for the `cody.chat.preInstruction` setting. [pull/2255](https://github.com/sourcegraph/cody/pull/2255)
- Fixes an issue where pasting into the document was not properly tracked. [pull/2293](https://github.com/sourcegraph/cody/pull/2293)
- Edit: Fixed an issue where the documentation command would incorrectly position inserted edits. [pull/2290](https://github.com/sourcegraph/cody/pull/2290)
- Edit: Fixed an issue where the documentation command would scroll to code that is already visible [pull/2296](https://github.com/sourcegraph/cody/pull/2296)

### Changed

- Settings: Relabel "symf Context" as "Search Context". [pull/2285](https://github.com/sourcegraph/cody/pull/2285)
- Chat: Removed 'Chat Suggestions' setting. [pull/2284](https://github.com/sourcegraph/cody/pull/2284)
- Edit: Completed edits are no longer scrolled back into view in the active file. [pull/2297](https://github.com/sourcegraph/cody/pull/2297)
- Chat: Update welcome message. [pull/2298](https://github.com/sourcegraph/cody/pull/2298)
- Edit: Decorations are no longer shown once an edit has been applied. [pull/2304](https://github.com/sourcegraph/cody/pull/2304)

## [0.18.4]

### Added

### Fixed

- Fixes an issue where the sidebar would not properly load when not signed in. [pull/2267](https://github.com/sourcegraph/cody/pull/2267)
- Fixes an issue where telemetry events were not properly logged with the new chat experience. [pull/2291](https://github.com/sourcegraph/cody/pull/2291)

### Changed

## [0.18.3]

### Added

- Autocomplete: Adds a new experimental option to improve the latency when showing the next line after accepting a completion (hot streak mode). [pull/2118](https://github.com/sourcegraph/cody/pull/2118)
- Chat: Add a settings button in the Chat panel to open extension settings. [pull/2117](https://github.com/sourcegraph/cody/pull/2117)

### Fixed

- Fix pre-release version numbers not being correctly detected. [pull/2240](https://github.com/sourcegraph/cody/pull/2240)
- Embeddings appear in the enhanced context selector when the user is already signed in and loads/reloads VSCode. [pull/2247](https://github.com/sourcegraph/cody/pull/2247)
- Embeddings status in the enhanced context selector has accurate messages when working in workspaces that aren't git repositories, or in git repositories which don't have remotes. [pull/2235](https://github.com/sourcegraph/cody/pull/2235)

### Changed

- Replace "Sign Out" with an account dialog. [pull/2233](https://github.com/sourcegraph/cody/pull/2233)
- Chat: Update chat icon and transcript gradient. [pull/2254](https://github.com/sourcegraph/cody/pull/2254)
- Remove the experimental `syntacticPostProcessing` flag. This behavior is now the default.

## [0.18.2]

### Added

### Fixed

- Chat: You can @-mention files starting with a dot. [pull/2209](https://github.com/sourcegraph/cody/pull/2209)
- Chat: Typing a complete filename when @-mentioning files and then pressing `<tab>` will no longer duplicate the filename [pull/2218](https://github.com/sourcegraph/cody/pull/2218)
- Autocomplete: Fixes an issue where changing user accounts caused some configuration issues. [pull/2182](https://github.com/sourcegraph/cody/pull/2182)
- Fixes an issue where focusing the VS Code extension window caused unexpected errors when connected to an Enterprise instance. [pull/2182](https://github.com/sourcegraph/cody/pull/2182)
- Embeddings: Send embeddings/initialize to the local embeddings controller. [pull/2183](https://github.com/sourcegraph/cody/pull/2183)
- Chat: Do not parse Windows file paths as URIs. [pull/2197](https://github.com/sourcegraph/cody/pull/2197)
- Search: Fix symf index dir on Windows. [pull/2207](https://github.com/sourcegraph/cody/pull/2207)
- Chat: You can @-mention files on Windows without generating an error. [pull/2197](https://github.com/sourcegraph/cody/pull/2197)
- Chat: You can @-mention files on Windows using backslashes and displayed filenames will use backslashes [pull/2215](https://github.com/sourcegraph/cody/pull/2215)
- Sidebar: Fix "Release Notes" label & link for pre-releases in sidebar. [pull/2210](https://github.com/sourcegraph/cody/pull/2210)
- Search: Send sigkill to symf when extension exits. [pull/2225](https://github.com/sourcegraph/cody/pull/2225)
- Search: Support cancelling index. [pull/2202](https://github.com/sourcegraph/cody/pull/2202)
- Chat Fix cursor blink issue and ensure proper chat initialization synchronization. [pull/2193](https://github.com/sourcegraph/cody/pull/2193)
- plg: display errors when autocomplete rate limits trigger [pull/2193](https://github.com/sourcegraph/cody/pull/2135)
- Mark Upgrade/Usage links as dot-com only [pull/2219](https://github.com/sourcegraph/cody/pull/2219)

### Changed

- Search: Only show search instructions on hover or focus [pull/2212](https://github.com/sourcegraph/cody/pull/2212)

## [0.18.1]

### Added

### Fixed

- Chat: Always include selection in Enhanced Context. [pull/2144](https://github.com/sourcegraph/cody/pull/2144)
- Chat: Fix abort. [pull/2159](https://github.com/sourcegraph/cody/pull/2159)
- Autocomplete: Fix rate limits messages for short time spans. [pull/2152](https://github.com/sourcegraph/cody/pull/2152)

### Changed

- Chat: Improve slash command heading padding. [pull/2173](https://github.com/sourcegraph/cody/pull/2173)

## [0.18.0]

### Added

- Edit: "Ask Cody to Generate" or the "Edit" command now stream incoming code directly to the document when only inserting new code. [pull/1883](https://github.com/sourcegraph/cody/pull/1883)
- Chat: New chat preview models `claude-2.1` is now avaliable for sourcegraph.com users. [pull/1860](https://github.com/sourcegraph/cody/pull/1860)
- Edit: Added context-aware code actions for "Generate", "Edit" and "Document" commands. [pull/1724](https://github.com/sourcegraph/cody/pull/1724)
- Chat: @'ing files now uses a case insensitive fuzzy search. [pull/1889](https://github.com/sourcegraph/cody/pull/1889)
- Edit: Added a faster, more optimized response for the "document" command. [pull/1900](https://github.com/sourcegraph/cody/pull/1900)
- Chat: Restore last opened chat panel on reload. [pull/1918](https://github.com/sourcegraph/cody/pull/1918)

### Fixed

- Chat: Display OS specific keybinding in chat welcome message. [pull/2051](https://github.com/sourcegraph/cody/pull/2051)
- Embeddings indexes can be generated and stored locally in repositories with a default fetch URL that is not already indexed by sourcegraph.com through the Enhanced Context selector. [pull/2069](https://github.com/sourcegraph/cody/pull/2069)
- Chat: Support chat input history on "up" and "down" arrow keys again. [pull/2059](https://github.com/sourcegraph/cody/pull/2059)
- Chat: Decreased debounce time for creating chat panels to improve responsiveness. [pull/2115](https://github.com/sourcegraph/cody/pull/2115)
- Chat: Fix infinite loop when searching for symbols. [pull/2114](https://github.com/sourcegraph/cody/pull/2114)
- Chat: Speed up chat panel debounce w/ trigger on leading edge too. [pull/2126](https://github.com/sourcegraph/cody/pull/2126)
- Chat: Fix message input overlapping with enhanced context button. [pull/2141](https://github.com/sourcegraph/cody/pull/2141)
- Support chat input history on "up" and "down" arrow keys again. [pull/2059](https://github.com/sourcegraph/cody/pull/2059)
- Edit: Fixed an issue where Cody would regularly include unrelated XML tags in the generated output. [pull/1789](https://github.com/sourcegraph/cody/pull/1789)
- Chat: Fixed an issue that caused Cody to be unable to locate active editors when running commands from the new chat panel. [pull/1793](https://github.com/sourcegraph/cody/pull/1793)
- Chat: Replaced uses of deprecated getWorkspaceRootPath that caused Cody to be unable to determine the current workspace in the chat panel. [pull/1793](https://github.com/sourcegraph/cody/pull/1793)
- Chat: Input history is now preserved between chat sessions. [pull/1826](https://github.com/sourcegraph/cody/pull/1826)
- Chat: Fixed chat command selection behavior in chat input box. [pull/1828](https://github.com/sourcegraph/cody/pull/1828)
- Chat: Add delays before sending webview ready events to prevent premature sending. This fixes issue where chat panel fails to load when multiple chat panels are opened simultaneously. [pull/1836](https://github.com/sourcegraph/cody/pull/1836)
- Autocomplete: Fixes a bug that caused autocomplete to be triggered at the end of a block or function invocation. [pull/1864](https://github.com/sourcegraph/cody/pull/1864)
- Edit: Incoming edits that are afixed to the selected code and now handled properly (e.g. docstrings). [pull/1724](https://github.com/sourcegraph/cody/pull/1724)
- Chat: Allowed backspace and delete keys to remove characters in chat messages input box.
- Edit: Retrying an edit will now correctly use the original intended range. [pull/1926](https://github.com/sourcegraph/cody/pull/1926)
- Chat: Allowed backspace and delete keys to remove characters in chat messages input box. [pull/1906](https://github.com/sourcegraph/cody/pull/1906)
- Chat: The commands display box in the chat input box now uses the same styles as the @ command results box. [pull/1962](https://github.com/sourcegraph/cody/pull/1962)
- Chat: Sort commands and prompts alphabetically in commands menu and chat. [pull/1998](https://github.com/sourcegraph/cody/pull/1998)
- Chat: Fix chat command selection to only filter on '/' prefix. [pull/1980](https://github.com/sourcegraph/cody/pull/1980)
- Chat: Improve @-file completion to better preserve input value. [pull/1980](https://github.com/sourcegraph/cody/pull/1980)
- Edit: Fixed "Ask Cody: Edit Code" no longer showing in the command palette. [pull/2004](https://github.com/sourcegraph/cody/pull/2004)
- Edit: Fixed an issue where Cody could incorrectly produce edits when repositioning code or moving your cursor onto new lines. [pull/2005](https://github.com/sourcegraph/cody/pull/2005)

### Changed

- Chat: Uses the new Chat UI by default. [pull/2079](https://github.com/sourcegraph/cody/pull/2079)
- Inline Chat is now deprecated and removed. [pull/2079](https://github.com/sourcegraph/cody/pull/2079)
- Fixup Tree View is now deprecated and removed. [pull/2079](https://github.com/sourcegraph/cody/pull/2079)
- Enhanced Context used to turn off automatically after the first chat. Now it stays enabled until you disable it. [pull/2069](https://github.com/sourcegraph/cody/pull/2069)
- Chat: Reuse existing New Chat panel to prevent having multiple new chats open at once. [pull/2087](https://github.com/sourcegraph/cody/pull/2087)
- Chat: Close the Enhanced Context popover on chat input focus. [pull/2091](https://github.com/sourcegraph/cody/pull/2091)
- Chat: Show onboarding glowy dot guide until first time opening Enhanced Context. [pull/2097](https://github.com/sourcegraph/cody/pull/2097)
- In 0.12, we simplified the sign-in process and removed the option to sign into
  Cody App from VScode. If you were still signed in to Cody App, we invite you to
  sign in to Sourcegraph.com directly. The extension will do this automatically if
  possible but you may need to sign in again. If you have set up embeddings in
  Cody App, VScode will now search your local embeddings automatically: You no
  longer need to have the Cody App open. Note, the sidebar chat indicator may
  say embeddings were not found while we work on improving chat.
  [pull/2099](https://github.com/sourcegraph/cody/pull/2099)
- Commands: Expose commands in the VS Code command palette and clean up the context menu. [pull/1209](https://github.com/sourcegraph/cody/pull/2109)
- Search: Style and UX improvements to the search panel. [pull/2138](https://github.com/sourcegraph/cody/pull/2138)
- Chat: Reduce size of chats list blank copy. [pull/2137](https://github.com/sourcegraph/cody/pull/2137)
- Chat: Update message input placeholder to mention slash commands. [pull/2142](https://github.com/sourcegraph/cody/pull/2142)
- Inline Chat will soon be deprecated in favor of the improved chat and command experience. It is now disabled by default and does not work when the new chat panel is enabled. [pull/1797](https://github.com/sourcegraph/cody/pull/1797)
- Chat: Updated the design and location for the `chat submit` button and `stop generating` button. [pull/1782](https://github.com/sourcegraph/cody/pull/1782)
- Commands: `Command Code Lenses` has been moved out of experimental feature and is now available to general. [pull/0000](https://github.com/sourcegraph/cody/pull/0000)
- Commands: `Custom Commands` has been moved out of experimental and is now at Beta. [pull/0000](https://github.com/sourcegraph/cody/pull/0000)
- Commands: The Custom Commands Menu now closes on click outside of the menu. [pull/1854](https://github.com/sourcegraph/cody/pull/1854)
- Autocomplete: Remove the frequency of unhelpful autocompletions. [pull/1862](https://github.com/sourcegraph/cody/pull/1862)
- Chat: The default chat model `claude-2` has been replaced with the pinned version `claude-2.0`. [pull/1860](https://github.com/sourcegraph/cody/pull/1860)
- Edit: Improved the response consistency for edits. Incoming code should now better match the surrounding code and contain less formatting errors [pull/1892](https://github.com/sourcegraph/cody/pull/1892)
- Command: Editor title icon will only show up in non-readonly file editor views. [pull/1909](https://github.com/sourcegraph/cody/pull/1909)
- Chat: Include text in dotCom chat events. [pull/1910](https://github.com/sourcegraph/cody/pull/1910)
- Chat: Replaced vscode links with custom "cody.chat.open.file" protocol when displaying file names in chat. [pull/1919](https://github.com/sourcegraph/cody/pull/1919)
- Chat: Change "Restart Chat Session" icon and add a confirmation. [pull/2002](https://github.com/sourcegraph/cody/pull/2002)
- Chat; Improve enhanced context popover and button styles. [pull/2075](https://github.com/sourcegraph/cody/pull/2075)

## [0.16.3]

### Added

### Fixed

### Changed

- Reverting back to v0.16.1 due to critical issue found in v0.16.2.

## [0.16.2]

### Added

- Chat: New chat preview models `claude-2.1` is now avaliable for sourcegraph.com users. [pull/1860](https://github.com/sourcegraph/cody/pull/1860)
- Edit: Added context-aware code actions for "Generate", "Edit" and "Document" commands. [pull/1724](https://github.com/sourcegraph/cody/pull/1724)
- Chat: @'ing files now uses a case insensitive fuzzy search. [pull/1889](https://github.com/sourcegraph/cody/pull/1889)
- Edit: Added a faster, more optimized response for the "document" command. [pull/1900](https://github.com/sourcegraph/cody/pull/1900)
- Chat: Restore last opened chat panel on reload. [pull/1918](https://github.com/sourcegraph/cody/pull/1918)
- Chat: Edit button to rename the chat history. [pull/1818](https://github.com/sourcegraph/cody/pull/1818)

### Fixed

- Edit: Fixed an issue where Cody would regularly include unrelated XML tags in the generated output. [pull/1789](https://github.com/sourcegraph/cody/pull/1789)
- Chat: Fixed an issue that caused Cody to be unable to locate active editors when running commands from the new chat panel. [pull/1793](https://github.com/sourcegraph/cody/pull/1793)
- Chat: Replaced uses of deprecated getWorkspaceRootPath that caused Cody to be unable to determine the current workspace in the chat panel. [pull/1793](https://github.com/sourcegraph/cody/pull/1793)
- Chat: Input history is now preserved between chat sessions. [pull/1826](https://github.com/sourcegraph/cody/pull/1826)
- Chat: Fixed chat command selection behavior in chat input box. [pull/1828](https://github.com/sourcegraph/cody/pull/1828)
- Chat: Add delays before sending webview ready events to prevent premature sending. This fixes issue where chat panel fails to load when multiple chat panels are opened simultaneously. [pull/1836](https://github.com/sourcegraph/cody/pull/1836)
- Autocomplete: Fixes a bug that caused autocomplete to be triggered at the end of a block or function invocation. [pull/1864](https://github.com/sourcegraph/cody/pull/1864)
- Edit: Incoming edits that are afixed to the selected code and now handled properly (e.g. docstrings). [pull/1724](https://github.com/sourcegraph/cody/pull/1724)
- Chat: Allowed backspace and delete keys to remove characters in chat messages input box.
- Edit: Retrying an edit will now correctly use the original intended range. [pull/1926](https://github.com/sourcegraph/cody/pull/1926)
- Chat: Allowed backspace and delete keys to remove characters in chat messages input box. [pull/1906](https://github.com/sourcegraph/cody/pull/1906)
- Chat: The commands display box in the chat input box now uses the same styles as the @ command results box. [pull/1962](https://github.com/sourcegraph/cody/pull/1962)
- Chat: Sort commands and prompts alphabetically in commands menu and chat. [pull/1998](https://github.com/sourcegraph/cody/pull/1998)
- Chat: Fix chat command selection to only filter on '/' prefix. [pull/1980](https://github.com/sourcegraph/cody/pull/1980)
- Chat: Improve @-file completion to better preserve input value. [pull/1980](https://github.com/sourcegraph/cody/pull/1980)
- Edit: Fixed "Ask Cody: Edit Code" no longer showing in the command palette. [pull/2004](https://github.com/sourcegraph/cody/pull/2004)
- Edit: Fixed an issue where Cody could incorrectly produce edits when repositioning code or moving your cursor onto new lines. [pull/2005](https://github.com/sourcegraph/cody/pull/2005)

### Changed

- Inline Chat will soon be deprecated in favor of the improved chat and command experience. It is now disabled by default and does not work when the new chat panel is enabled. [pull/1797](https://github.com/sourcegraph/cody/pull/1797)
- Chat: Updated the design and location for the `chat submit` button and `stop generating` button. [pull/1782](https://github.com/sourcegraph/cody/pull/1782)
- Commands: `Command Code Lenses` has been moved out of experimental feature and is now available to general. [pull/0000](https://github.com/sourcegraph/cody/pull/0000)
- Commands: `Custom Commands` has been moved out of experimental and is now at Beta. [pull/0000](https://github.com/sourcegraph/cody/pull/0000)
- Commands: The Custom Commands Menu now closes on click outside of the menu. [pull/1854](https://github.com/sourcegraph/cody/pull/1854)
- Autocomplete: Remove the frequency of unhelpful autocompletions. [pull/1862](https://github.com/sourcegraph/cody/pull/1862)
- Chat: The default chat model `claude-2` has been replaced with the pinned version `claude-2.0`. [pull/1860](https://github.com/sourcegraph/cody/pull/1860)
- Edit: Improved the response consistency for edits. Incoming code should now better match the surrounding code and contain less formatting errors [pull/1892](https://github.com/sourcegraph/cody/pull/1892)
- Command: Editor title icon will only show up in non-readonly file editor views. [pull/1909](https://github.com/sourcegraph/cody/pull/1909)
- Chat: Include text in dotCom chat events. [pull/1910](https://github.com/sourcegraph/cody/pull/1910)
- Chat: Replaced vscode links with custom "cody.chat.open.file" protocol when displaying file names in chat. [pull/1919](https://github.com/sourcegraph/cody/pull/1919)
- Chat: Change "Restart Chat Session" icon and add a confirmation. [pull/2002](https://github.com/sourcegraph/cody/pull/2002)
- Chat; Improve enhanced context popover and button styles. [pull/2075](https://github.com/sourcegraph/cody/pull/2075)

## [0.16.1]

### Added

### Fixed

### Changed

- Move decision about which autocomplete deployment to use for StarCoder to the server. [pull/1845](https://github.com/sourcegraph/cody/pull/1845)

## [0.16.0]

### Added

- Chat: A new chat model selection dropdown that allows selecting between different chat models when connected to the sourcegraph.com instance. [pull/1676](https://github.com/sourcegraph/cody/pull/1676)
- Chat: New button in editor title for restarting chat session in current chat panel (non-sidebar chat view). [pull/1687](https://github.com/sourcegraph/cody/pull/1687)
- Chat: New `@` command that allows you to attach files via the chat input box. [pull/1631](https://github.com/sourcegraph/cody/pull/1631)
- Edit: Added a specific, faster, response flow for fixes when triggered directly from code actions. [pull/1639](https://github.com/sourcegraph/cody/pull/1639)
- Edit: Improved context fetching for quick fixes to better include code related to the problem. [pull/1723](https://github.com/sourcegraph/cody/pull/1723)
- Chat: Added option to configure whether to add enhanced context from codebase for chat question in the new chat panel. [pull/1738](https://github.com/sourcegraph/cody/pull/1738)
- Autocomplete: Added new retrieval and mixing strategies to improve Autocomplete context. [pull/1752](https://github.com/sourcegraph/cody/pull/1752)
- Commands: Supports passing additional input text to commands via the chat input box. For example, adds additional instruction after the command key: `/explain response in Spanish`. [pull/1731](https://github.com/sourcegraph/cody/pull/1731)

### Fixed

- Edit: Updated the fixup create task to just use the previous command text. [pull/1615](https://github.com/sourcegraph/cody/pull/1615)
- Fixed an issue that would cause an aborted chat message to show an error "Cody did not respond with any text". [pull/1668](https://github.com/sourcegraph/cody/pull/1668)
- Chat: Opening files from the new chat panel will now show up beside the chat panel instead of on top of the chat panel. [pull/1677](https://github.com/sourcegraph/cody/pull/1677)
- Chat: Prevented default events on certain key combos when chat box is focused. [pull/1690](https://github.com/sourcegraph/cody/pull/1690)
- Command: Fixed an issue that opened a new chat window when running `/doc` and `/edit` commands from the command palette. [pull/1678](https://github.com/sourcegraph/cody/pull/1678)
- Chat: Prevent sidebar from opening when switching editor chat panels. [pull/1691](https://github.com/sourcegraph/cody/pull/1691)
- Chat: Prevent `"command 'cody.chat'panel.new' not found"` error when the new chat panel UI is disabled. [pull/1696](https://github.com/sourcegraph/cody/pull/1696)
- Autocomplete: Improved the multiline completions truncation logic. [pull/1709](https://github.com/sourcegraph/cody/pull/1709)
- Autocomplete: Fix an issue where typing as suggested causes the completion to behave unexpectedly. [pull/1701](https://github.com/sourcegraph/cody/pull/1701)
- Chat: Forbid style tags in DOMPurify config to prevent code block rendering issues. [pull/1747](https://github.com/sourcegraph/cody/pull/1747)
- Edit: Fix `selectedCode` and `problemCode` sometimes being added to the document after an edit. [pull/1765](https://github.com/sourcegraph/cody/pull/1765)
- Edit: Fix the code lens containing options to diff, undo and retry being automatically dismissed for users who have `autoSave` enabled. [pull/1767](https://github.com/sourcegraph/cody/pull/1767)

### Changed

- Edit: Fixed formatting issues with some editor formatters that required explict indendation configuration. [pull/1620](https://github.com/sourcegraph/cody/pull/1620)
- Edit: Fixed an issue where the diff for an edit could expand recursively each time it is viewed. [pull/1621](https://github.com/sourcegraph/cody/pull/1621)
- Editor Title Icon has been moved out of the experimental stage and is now enabled by default. [pull/1651](https://github.com/sourcegraph/cody/pull/1651)
- Clean up login page styles and make Enterprise login more prominent. [pull/1708](https://github.com/sourcegraph/cody/pull/1708)
- Autocomplete: Slightly increase the amount of time we wait for another keystroke before starting completion requests. [pull/1737](https://github.com/sourcegraph/cody/pull/1737)
- Improved new chat model selector styles. [pull/1750](https://github.com/sourcegraph/cody/pull/1750)
- Improved response time for chat, commands and edits on repositories without embeddings. [pull/1722](https://github.com/sourcegraph/cody/pull/1722)

## [0.14.5]

### Added

### Fixed

### Changed

- Added support to test a Sourcegraph specific StarCoder setup for dotcom. [pull/1670]

## [0.14.4]

### Added

### Fixed

- Chat: Fixed an issue where multiple action buttons were appended to each Code Block per chat message. [pull/1617](https://github.com/sourcegraph/cody/pull/1617)

### Changed

## [0.14.3]

### Added

- Autocomplete: Add completion intent to analytics events. [pull/1457](https://github.com/sourcegraph/cody/pull/1457)
- Edit: Added the ability to provide instructions when retrying an edit. [pull/1411](https://github.com/sourcegraph/cody/pull/1411)
- Edit: Added the ability to undo an applied edit. [pull/1411](https://github.com/sourcegraph/cody/pull/1411)
- Edit: Support applying edits in the background, instead of relying on the users' open file. [pull/1411](https://github.com/sourcegraph/cody/pull/1411)
- Assign requestID to each Code Block actions. [pull/1586](https://github.com/sourcegraph/cody/pull/1586)
- [Internal Experimental] Chat: New Experimental Chat View that appears in the editor panel instead of the sidebar when `cody.experimental.chatPanel` is enabled. [pull/1509](https://github.com/sourcegraph/cody/pull/1509)

### Fixed

- Commands: Smart selection not working on the first line of code. [pull/1508](https://github.com/sourcegraph/cody/pull/1508)
- Chat: Aborted messages are now saved to local chat history properly. [pull/1550](https://github.com/sourcegraph/cody/pull/1550)
- Adjust a completion range if it does not match the current line suffix. [pull/1507](https://github.com/sourcegraph/cody/pull/1507)
- Chat: Fix heading styles and inline code colors. [pull/1528](https://github.com/sourcegraph/cody/pull/1528)
- Custom Commands: Fix custom command menu not showing for a single custom command. [pull/1532](https://github.com/sourcegraph/cody/pull/1532)
- Chat: Focus chat input on mount even when notification for version update is shown. [pull/1556](https://github.com/sourcegraph/cody/pull/1556)
- Commands: Commands selector in chat will now scroll to the selected item's viewport automatically. [pull/1556](https://github.com/sourcegraph/cody/pull/1556)
- Edit: Errors are now shown separately to incoming edits, and will not be applied to the document. [pull/1376](https://github.com/sourcegraph/cody/pull/1376)
- Chat: Prevent cursor from moving during chat command selection. [pull/1592](https://github.com/sourcegraph/cody/pull/1592)

### Changed

- Chat: Start prompt mixin by default. [pull/1479](https://github.com/sourcegraph/cody/pull/1479)
- Edit: Incoming changes are now applied by default. [pull/1411](https://github.com/sourcegraph/cody/pull/1411)

## [0.14.2]

### Added

- Code applied from the `/edit` command will be formatted automatically through the VS Code `formatDocument` API. [pull/1441](https://github.com/sourcegraph/cody/pull/1441)

### Fixed

- User selection in active editor will not be replaced by smart selections for the `/edit` command. [pull/1429](https://github.com/sourcegraph/cody/pull/1429)
- Fixes an issue that caused part of the autocomplete response to be completed when selecting an item from the suggest widget. [pull/1477](https://github.com/sourcegraph/cody/pull/1477)
- Fixed issues where autocomplete suggestions displayed on the wrong line when connected to Anthropic as provider. [pull/1440](https://github.com/sourcegraph/cody/pull/1440)

### Changed

- Changed the "Ask Cody to Explain" Code Action to respond in the Cody sidebar instead of Inline Chat. [pull/1427](https://github.com/sourcegraph/cody/pull/1427)
- Updated prompt preambles and mixin for chat to mitigate hallucinations. [pull/1442](https://github.com/sourcegraph/cody/pull/1442)
- Cody can now respond in languages other than the default language of the user's editor. [pull/1442](https://github.com/sourcegraph/cody/pull/1442)

## [0.14.1]

### Added

- Added client-side request timeouts to Autocomplete requests. [pull/1355](https://github.com/sourcegraph/cody/pull/1355)
- Added telemetry on how long accepted autocomplete requests are kept in the document. [pull/1380](https://github.com/sourcegraph/cody/pull/1380)
- Added support for using (workspace) relative paths in `filePath`and `directoryPath` fields as context for Custom Commands. [pull/1385](https://github.com/sourcegraph/cody/pull/1385)
- [Internal] Added `CodyAutocompleteLowPerformanceDebounce` feature flag to increase debounce interval for autocomplete requests in low-performance environments. [pull/1409](https://github.com/sourcegraph/cody/pull/1409)
- New `Regenerate` Code Lens for `/edit` command that allows users to easily ask Cody to generate a new response for the current request. [pull/1383](https://github.com/sourcegraph/cody/pull/1383)

### Fixed

- Fixed an issue where autocomplete suggestions where sometimes not shown when the overlap with the next line was too large. [pull/1320](https://github.com/sourcegraph/cody/pull/1320)
- Fixed unresponsive UI for the `Configure Custom Commands` option inside the `Cody: Custom Command (Experimental)` menu. [pull/1416](https://github.com/sourcegraph/cody/pull/1416)
- Fixed last 5 used commands not showing up in the custom command history menu. [pull/1416](https://github.com/sourcegraph/cody/pull/1416)

### Changed

- Removed the unused `unstable-codegen` autocomplete provider. [pull/1364](https://github.com/sourcegraph/cody/pull/1364)
- The Fireworks autocomplete provider is now considered stable. [pull/1363](https://github.com/sourcegraph/cody/pull/1363)
- The `CodyAutocompleteMinimumLatency` feature flag is now split into three independent feature flags: `CodyAutocompleteLanguageLatency`, `CodyAutocompleteProviderLatency`, and `CodyAutocompleteUserLatency`. [pull/1351](https://github.com/sourcegraph/cody/pull/1351)
- Prevents unhelpful autocomplete suggestions at the end of file when cursor position is at 0 and the line above is also empty. [pull/1330](https://github.com/sourcegraph/cody/pull/1330)
- Adds popups to show the state of indexing for dotcom/Cody App in more situations. Fixes an issue where the database icon below the chat input status box was low contrast in some dark themes. [pull/1374](https://github.com/sourcegraph/cody/pull/1374)
- Workspace-level custom commands now works in [trusted workspaces](https://code.visualstudio.com/api/extension-guides/workspace-trust#what-is-workspace-trust) only. This does not apply to user-level custom commands. [pull/1415](https://github.com/sourcegraph/cody/pull/1415)
- Custom commands can no longer override default commands. [pull/1414](https://github.com/sourcegraph/cody/pull/1414)

## [0.14.0]

### Added

- Added information to host operating system to our analytic events. [pull/1254](https://github.com/sourcegraph/cody/pull/1254)
- Executed the `/doc` command now automatically adds the documentation directly above your selected code in your editor, instead of shown in chat. [pull/1116](https://github.com/sourcegraph/cody/pull/1116)
- New `mode` field in the Custom Commands config file enables a command to be configured on how the prompt should be run by Cody. Currently supports `inline` (run command prompt in inline chat), `edit` (run command prompt on selected code for refactoring purpose), and `insert` (run command prompt on selected code where Cody's response will be inserted on top of the selected code) modes. [pull/1116](https://github.com/sourcegraph/cody/pull/1116)
- Experimentally added `smart selection` which removes the need to manually highlight code before running the `/doc` and `/test` commands. [pull/1116](https://github.com/sourcegraph/cody/pull/1116)
- Show a notice on first autocomplete. [pull/1071](https://github.com/sourcegraph/cody/pull/1071)
- Autocomplete now takes the currently selected item in the suggest widget into account. This behavior can be disabled by setting `cody.autocomplete.suggestWidgetSelection` to `false`.
- Add the `cody.autocomplete.languages` user setting to enable or disable inline code suggestions for specified languages. [pull/1290](https://github.com/sourcegraph/cody/pull/1290)

### Fixed

- Improved quality of documentation created by the `/doc` command. [pull/1198](https://github.com/sourcegraph/cody/pull/1198)
- Removed chat and chat history created by `/edit` and `/doc` commands. [pull/1220](https://github.com/sourcegraph/cody/pull/1220)
- Only show "Ask Cody Inline" context menu item when signed in. [pull/1281](https://github.com/sourcegraph/cody/pull/1281)

### Changed

- Improved detection for the most common test runner files. [pull/1297](https://github.com/sourcegraph/cody/pull/1297)

## [0.12.4]

### Added

- New "Save Code to File.." button on code blocks. [pull/1119](https://github.com/sourcegraph/cody/pull/1119)
- Add logging for partially accepting completions. [pull/1214](https://github.com/sourcegraph/cody/pull/1214)

### Fixed

- Removed invalid variable from logs that stopped rate-limit errors from displaying properly. [pull/1205](https://github.com/sourcegraph/cody/pull/1205)
- Disable `Ask Cody Inline` in Cody Context Menu when `cody.InlineChat.enabled` is set to false. [pull/1209](https://github.com/sourcegraph/cody/pull/1209)

### Changed

- Moved "Insert at Cursor" and "Copy" buttons to the bottom of code blocks, and no longer just show on hover. [pull/1119](https://github.com/sourcegraph/cody/pull/1119)
- Increased the token limit for the selection Cody uses for the `/edit` command. [pull/1139](https://github.com/sourcegraph/cody/pull/1139)
- Autocomplete now supports infilling through the customized `claude-instant-infill` model created for Anthropic Claude Instant by default. [pull/1164](https://github.com/sourcegraph/cody/pull/1164)
- Expand the range used for code actions (thought `smart selection`) to the top-level enclosing range rather than just the line. This improves the quality of fixup actions by providing more context. [pull/1163](https://github.com/sourcegraph/cody/pull/1163)
- Autocomplete no longer triggers after the end of a block of function invocation. [pull/1218](https://github.com/sourcegraph/cody/pull/1218)

## [0.12.3]

### Added

- Add situation-based latency for unwanted autocomplete suggestions. [pull/1202](https://github.com/sourcegraph/cody/pull/1202)

### Fixed

### Changed

- Simplified sign-in in, added in 0.12.0 [pull/1036,](https://github.com/sourcegraph/cody/pull/1036) is now rolled out to 100% of new installs. [pull/1235](https://github.com/sourcegraph/cody/pull/1235)
- VScode can communicate with Cody App, even if App is started after the user has signed in to sourcegraph.com. VScode continues to monitor Cody App if it is started and stopped. [pull/1210](https://github.com/sourcegraph/cody/pull/1210)

## [0.12.2]

### Added

- Adds information about completion `items` to the `CompletionEvent` we send on every completion suggestion. [pull/1144](https://github.com/sourcegraph/cody/pull/1144)
- Clicking on the status indicator under the chat input box displays a popup to install Cody App, open Cody App, etc. The popups are only displayed under certain circumstances where Cody App can provide embeddings. [pull/1089](https://github.com/sourcegraph/cody/pull/1089)

### Fixed

### Changed

- Improves interop with the VS Code suggest widget when using the `completeSuggestWidgetSelection` feature flag. [pull/1158](https://github.com/sourcegraph/cody/pull/1158)
- Removes the need to set an Anthropic API key for the `/symf` command. The `symf` binary is now automatically downloaded. [pull/1207](https://github.com/sourcegraph/cody/pull/1207)
- Replace the "Fixup ready | Apply" buttons when you do a code edit with a single "Apply Edits" button. [pull/1201](https://github.com/sourcegraph/cody/pull/1201)
- Updated "Refactor Code" to be "Edit Code" in right click context menu. [pull/1200](https://github.com/sourcegraph/cody/pull/1200)

## [0.12.1]

### Added

### Fixed

- Fixes an issue that caused the `cody-autocomplete-claude-instant-infill` feature flag to have no effect. [pull/1132](https://github.com/sourcegraph/cody/pull/1132)

### Changed

## [0.12.0]

### Added

- Add a UI indicator when you're not signed in. [pull/970](https://github.com/sourcegraph/cody/pull/970)
- Added a completion statistics summary to the autocomplete trace view. [pull/973](https://github.com/sourcegraph/cody/pull/973)
- Add experimental option `claude-instant-infill` to the `cody.autocomplete.advanced.model` config option that enables users using the Claude Instant model to get suggestions with context awareness (infill). [pull/974](https://github.com/sourcegraph/cody/pull/974)
- New `cody.chat.preInstruction` configuration option for adding custom message at the start of all chat messages sent to Cody. Extension reload required. [pull/963](https://github.com/sourcegraph/cody/pull/963)
- Add a simplified sign-in. 50% of people will see these new sign-in buttons. [pull/1036](https://github.com/sourcegraph/cody/pull/1036)
- Now removes completions from cache when the initial suggestion prefix is deleted by users after a suggestion was displayed. This avoids unhelpful/stale suggestions from persisting. [pull/1105](https://github.com/sourcegraph/cody/pull/1105)
- VScode can now share a dotcom access token with future versions of Cody App. [pull/1090](https://github.com/sourcegraph/cody/pull/1090)

### Fixed

- Fix a potential race condition for autocomplete requests that happen when a completion is stored as the last shown candidate when it will not be shown. [pull/1059](https://github.com/sourcegraph/cody/pull/1059)
- Use `insert` instead of `replace` for `Insert at Cursor` button for inserting code to current cursor position. [pull/1118](https://github.com/sourcegraph/cody/pull/1118)
- Autocomplete: Fix support for working with CRLF line endings. [pull/1124](https://github.com/sourcegraph/cody/pull/1124)
- Fix issue that caused the custom commands menu to unable to execute commands. [pull/1123](https://github.com/sourcegraph/cody/pull/1123)

### Changed

- Remove `starter` and `premade` fields from the configuration files for custom commands (cody.json). [pull/939](https://github.com/sourcegraph/cody/pull/939)
- Enabled streaming responses for all autocomplete requests. [pull/995](https://github.com/sourcegraph/cody/pull/995)
- Sign out immediately instead of showing the quick-pick menu. [pull/1032](https://github.com/sourcegraph/cody/pull/1032)
- UX improvements to the custom command workflow (and new [custom command docs](https://sourcegraph.com/docs/cody/custom-commands)). [pull/992](https://github.com/sourcegraph/cody/pull/992)
- You can now use `alt` + `\` to trigger autocomplete requests manually. [pull/1060](https://github.com/sourcegraph/cody/pull/1060)
- Slightly reduce latency when manually triggering autocomplete requests. [pull/1060](https://github.com/sourcegraph/cody/pull/1060)
- Configure autocomplete provider based on cody LLM settings in site config. [pull/1035](https://github.com/sourcegraph/cody/pull/1035)
- Filters out single character autocomplete results. [pull/1109](https://github.com/sourcegraph/cody/pull/1109)
- Register inline completion provider for text files and notebooks only to ensure autocomplete works in environments that are fully supported. [pull/1114](https://github.com/sourcegraph/cody/pull/1114)
- The `Generate Unit Tests` command has been improved with an enhanced context fetching process that produces test results with better quality. [pull/907](https://github.com/sourcegraph/cody/pull/907)

## [0.10.2]

### Added

### Fixed

### Changed

- Use the same token limits for StarCoder as we do for Anthropic for the current experiments. [pull/1058](https://github.com/sourcegraph/cody/pull/1058)

## [0.10.1]

### Added

### Fixed

- Fix feature flag initialization for autocomplete providers. [pull/965](https://github.com/sourcegraph/cody/pull/965)

### Changed

## [0.10.0]

### Added

- New button in Chat UI to export chat history to a JSON file. [pull/829](https://github.com/sourcegraph/cody/pull/829)
- Rank autocomplete suggestion with tree-sitter when `cody.autocomplete.experimental.syntacticPostProcessing` is enabled. [pull/837](https://github.com/sourcegraph/cody/pull/837)
- Rate limit during autocomplete will now surface to the user through the status bar item. [pull/851](https://github.com/sourcegraph/cody/pull/851)

### Fixed

- Do not display error messages after clicking on the "stop-generating" button. [pull/776](https://github.com/sourcegraph/cody/pull/776)
- Add null check to Inline Controller on file change that caused the `Cannot read properties of undefined (reading 'scheme')` error when starting a new chat session. [pull/781](https://github.com/sourcegraph/cody/pull/781)
- Fixup: Resolved issue where `/fix` command incorrectly returned error "/fix is not a valid command". The `/fix` command now functions as expected when invoked in the sidebar chat. [pull/790](https://github.com/sourcegraph/cody/pull/790)
- Set font family and size in side chat code blocks to match editor font. [pull/813](https://github.com/sourcegraph/cody/pull/813)
- Add error handling to unblock Command Menu from being started up when invalid json file for custom commands is detected. [pull/827](https://github.com/sourcegraph/cody/pull/827)
- Enhanced the main quick pick menu items filtering logic. [pull/852](https://github.com/sourcegraph/cody/pull/852)
- Sidebar chat commands now match main quick pick menu commands. [pull/902](https://github.com/sourcegraph/cody/pull/902)

### Changed

- Trigger single-line completion instead of multi-line completion if the cursor is at the start of a non-empty block. [pull/913](https://github.com/sourcegraph/cody/pull/913)
- Autocomplete on VS Code desktop instances now reuses TCP connections to reduce latency. [pull/868](https://github.com/sourcegraph/cody/pull/868)
- Errors are now always logged to the output console, even if the debug mode is not enabled. [pull/851](https://github.com/sourcegraph/cody/pull/851)
- Changed default and custom commands format: slash command is now required. [pull/841](https://github.com/sourcegraph/cody/pull/841)
- The `Generate Unit Tests` command has been improved with an enhanced context fetching process that produces test results with better quality. [pull/907](https://github.com/sourcegraph/cody/pull/907)

## [0.8.0]

### Added

- Cody Commands: New `/smell` command, an improved version of the old `Find Code Smell` recipe. [pull/602](https://github.com/sourcegraph/cody/pull/602)
- Cody Commands: Display of clickable file path for current selection in chat view after executing a command. [pull/602](https://github.com/sourcegraph/cody/pull/602)
- Add a settings button to Cody pane header. [pull/701](https://github.com/sourcegraph/cody/pull/701)
- Compute suggestions based on the currently selected option in the suggest widget when `cody.autocomplete.experimental.completeSuggestWidgetSelection` is enabled. [pull/636](https://github.com/sourcegraph/cody/pull/636)
- Fixup: New `Discard` code lens to remove suggestions and decorations. [pull/711](https://github.com/sourcegraph/cody/pull/711)
- Adds an experiment to stream autocomplete responses in order to improve latency. [pull/723](https://github.com/sourcegraph/cody/pull/723)
- New chat message input, with auto-resizing and a command button. [pull/718](https://github.com/sourcegraph/cody/pull/718)
- Increased autocomplete debounce time feature flag support. [pull/733](https://github.com/sourcegraph/cody/pull/733)
- Show an update notice after extension updates. [pull/746](https://github.com/sourcegraph/cody/pull/746)
- Experimental user setting `cody.experimental.localSymbols` to enable inclusion of symbol definitions in the LLM context window. [pull/692](https://github.com/sourcegraph/cody/pull/692)
- Experimental command `/symf`, which uses a local keyword index to perform searches for symbols. Requires setting `cody.experimental.symf.path` and `cody.experimental.symf.anthropicKey`. [pull/728](https://github.com/sourcegraph/cody/pull/728).

### Fixed

- Inline Chat: Fix issue where state was not being set correctly, causing Cody Commands to use the selection range from the last created Inline Chat instead of the current selection. [pull/602](https://github.com/sourcegraph/cody/pull/602)
- Cody Commands: Commands that use the current file as context now correctly generate context message for the current file instead of using codebase context generated from current selection. [pull/683](https://github.com/sourcegraph/cody/pull/683)
- Improves the autocomplete responses on a new line after a comment. [pull/727](https://github.com/sourcegraph/cody/pull/727)
- Fixes an issue where the inline chat UI would render briefly when starting VS Code even when the feature is disabled. [pull/764](https://github.com/sourcegraph/cody/pull/764)

### Changed

- `Explain Code` command now includes visible content of the current file when no code is selected. [pull/602](https://github.com/sourcegraph/cody/pull/602)
- Cody Commands: Show errors in chat view instead of notification windows. [pull/602](https://github.com/sourcegraph/cody/pull/602)
- Cody Commands: Match commands on description in Cody menu. [pull/702](https://github.com/sourcegraph/cody/pull/702)
- Cody Commands: Don't require Esc to dismiss Cody menu. [pull/700](https://github.com/sourcegraph/cody/pull/700)
- Updated welcome chat words. [pull/748](https://github.com/sourcegraph/cody/pull/748)
- Autocomplete: Reduce network bandwidth with requests are resolved by previous responses. [pull/762](https://github.com/sourcegraph/cody/pull/762)
- Fixup: Remove `/document` and other command handling from the Refactor Menu. [pull/766](https://github.com/sourcegraph/cody/pull/766)
- The `/test` (Generate Unit Test) command was updated to use file dependencies and test examples when fetching context, in order to produce better results. To use this command, select code in your editor and run the `/test` command. It is recommended to set up test files before running the command to get optimal results. [pull/683](https://github.com/sourcegraph/cody/pull/683) [pull/602](https://github.com/sourcegraph/cody/pull/602)

## [0.6.7]

### Added

- Include token count for code generated and button click events. [pull/675](https://github.com/sourcegraph/cody/pull/675)

### Fixed

### Changed

- Include the number of accepted characters per autocomplete suggestion. [pull/674](https://github.com/sourcegraph/cody/pull/674)

## [0.6.6]

### Added

- Cody Commands: Add tab-to-complete & enter-to-complete behavior. [pull/606](https://github.com/sourcegraph/cody/pull/606)
- Option to toggle `cody.experimental.editorTitleCommandIcon` setting through status bar. [pull/611](https://github.com/sourcegraph/cody/pull/611)
- New walkthrough for Cody Commands. [pull/648](https://github.com/sourcegraph/cody/pull/648)

### Fixed

- Update file link color to match buttons. [pull/600](https://github.com/sourcegraph/cody/pull/600)
- Handle `socket hung up` errors that are not caused by the `stop generating` button. [pull/598](https://github.com/sourcegraph/cody/pull/598)
- Fix "Reload Window" appearing in all VS Code views. [pull/603](https://github.com/sourcegraph/cody/pull/603)
- Fixes issues where in some instances, suggested autocomplete events were under counted. [pull/649](https://github.com/sourcegraph/cody/pull/649)
- Various smaller tweaks to autocomplete analytics. [pull/644](https://github.com/sourcegraph/cody/pull/644)
- Includes the correct pre-release version in analytics events. [pull/641](https://github.com/sourcegraph/cody/pull/641)

### Changed

- Removed beta labels from Autocomplete and Inline Chat features. [pull/605](https://github.com/sourcegraph/cody/pull/605)
- Update shortcut for Cody Commands to `alt` + `c` due to conflict with existing keybinding for `fixup`. [pull/648](https://github.com/sourcegraph/cody/pull/648)

## [0.6.5]

### Added

- Custom Commands: An experimental feature for creating Cody chat commands with custom prompts and context. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- Custom Commands: Quick pick menu for running default and custom commands. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- New commands:
  - `/explain`: Explain Code
  - `/doc`: Document Code
  - `/fix`: Inline Fixup
  - `/test`: Generate Unit Tests
- Code Actions: You can now ask Cody to explain or fix errors and warnings that are highlighted in your editor. [pull/510](https://github.com/sourcegraph/cody/pull/510)
- Inline Fixup: You can now run parallel inline fixes, you do not need to wait for the previous fix to complete. [pull/510](https://github.com/sourcegraph/cody/pull/510)
- Inline Fixup: You no longer need to select code to generate an inline fix. [pull/510](https://github.com/sourcegraph/cody/pull/510)

### Fixed

- Bug: Fixes an issue where the codebase context was not correctly inferred to load embeddings context for autocomplete. [pull/525](https://github.com/sourcegraph/cody/pull/525)
- Inline Fixup: `/chat` will now redirect your question to the chat view correctly through the Non-Stop Fixup input box. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- Fix REGEX issue for existing `/reset`, `/search`, and `/fix` commands. [pull/594](https://github.com/sourcegraph/cody/pull/594)

### Changed

- `Recipes` are removed in favor of `Commands`, which is the improved version of `Recipes`. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- Remove `Header` and `Navbar` from `Chat` view due to removal of the `Recipes` tab. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- Replace `Custom Recipes` with `Custom Commands`. [pull/386](https://github.com/sourcegraph/cody/pull/386)
- Inline Fixup: Integrated the input field into the command palette. [pull/510](https://github.com/sourcegraph/cody/pull/510)
- Inline Fixup: Using `/fix` from Inline Chat now triggers an improved fixup experience. [pull/510](https://github.com/sourcegraph/cody/pull/510)
- Autocomplete: Include current file name in anthropic prompt. [580](https://github.com/sourcegraph/cody/pull/580)
- Autocomplete: Requests can now be resolved while the network request is still in progress. [pull/559](https://github.com/sourcegraph/cody/pull/559)

## [0.6.4]

### Added

- Inline Fixups: Cody is now aware of errors, warnings and hints within your editor selection. [pull/376](https://github.com/sourcegraph/cody/pull/376)
- Experimental user setting `cody.experimental.localTokenPath` to store authentication token in local file system when keychain access is unavailable. This provides alternative to [settings sync keychain storage](https://code.visualstudio.com/docs/editor/settings-sync#_troubleshooting-keychain-issues), but is not the recommended method for storing tokens securely. Use at your own risk. [pull/471](https://github.com/sourcegraph/cody/pull/471)

### Fixed

- Bug: Chat History command shows chat view instead of history view. [pull/414](https://github.com/sourcegraph/cody/pull/414)
- Fix some bad trailing `}` autocomplete results. [pull/378](https://github.com/sourcegraph/cody/pull/378)

### Changed

- Inline Fixups: Added intent detection to improve prompt and context quality. [pull/376](https://github.com/sourcegraph/cody/pull/376)
- Layout cleanups: smaller header and single line message input. [pull/449](https://github.com/sourcegraph/cody/pull/449)
- Improve response feedback button behavior. [pull/451](https://github.com/sourcegraph/cody/pull/451)
- Remove in-chat onboarding buttons for new chats. [pull/450](https://github.com/sourcegraph/cody/pull/450)
- Improve the stability of autocomplete results. [pull/442](https://github.com/sourcegraph/cody/pull/442)

## [0.6.3]

### Added

- Added the functionality to drag and reorder the recipes. [pull/314](https://github.com/sourcegraph/cody/pull/314)

### Fixed

### Changed

- Removed the experimental hallucination detection that highlighted nonexistent file paths.
- Hide the feedback button in case of error assistant response. [pull/448](https://github.com/sourcegraph/cody/pull/448)

## [0.6.2]

### Added

- [Internal] `Custom Recipes`: An experimental feature now available behind the `cody.experimental.customRecipes` feature flag for internal testing purpose. [pull/348](https://github.com/sourcegraph/cody/pull/348)
- Inline Chat: Improved response quality by ensuring each inline chat maintains its own unique context, and doesn't share with the sidebar and other inline chats. This should also benefit response quality for inline /fix and /touch commands.
- Inline Chat: Added the option to 'Stop generating' from within the inline chat window.
- Inline Chat: Added the option to transfer a chat from the inline window to the Cody sidebar.

### Fixed

### Changed

- The setting `cody.autocomplete.experimental.triggerMoreEagerly` (which causes autocomplete to trigger earlier, before you type a space or other non-word character) now defaults to `true`.
- If you run the `Trigger Inline Suggestion` VS Code action, 3 suggestions instead of just 1 will be shown.

## [0.6.1]

### Added

- A new experimental user setting `cody.autocomplete.experimental.triggerMoreEagerly` causes autocomplete to trigger earlier, before you type a space or other non-word character.
- [Internal Only] `Custom Recipe`: Support context type selection when creating a new recipe via UI. [pull/279](https://github.com/sourcegraph/cody/pull/279)
- New `/open` command for opening workspace files from chat box. [pull/327](https://github.com/sourcegraph/cody/pull/327)

### Fixed

- Insert at Cusor now inserts the complete code snippets at cursor position. [pull/282](https://github.com/sourcegraph/cody/pull/282)
- Minimizing the change of Cody replying users with response related to the language-uage prompt. [pull/279](https://github.com/sourcegraph/cody/pull/279)
- Inline Chat: Add missing icons for Inline Chat and Inline Fixups decorations. [pull/320](https://github.com/sourcegraph/cody/pull/320)
- Fix the behaviour of input history down button. [pull/328](https://github.com/sourcegraph/cody/pull/328)

### Changed

- Exclude context for chat input with only one word. [pull/279](https://github.com/sourcegraph/cody/pull/279)
- [Internal Only] `Custom Recipe`: Store `cody.json` file for user recipes within the `.vscode` folder located in the $HOME directory. [pull/279](https://github.com/sourcegraph/cody/pull/279)
- Various autocomplete improvements. [pull/344](https://github.com/sourcegraph/cody/pull/344)

## [0.4.4]

### Added

- Added support for the CMD+K hotkey to clear the code chat history. [pull/245](https://github.com/sourcegraph/cody/pull/245)
- [Internal Only] `Custom Recipe` is available for S2 internal users for testing purpose. [pull/81](https://github.com/sourcegraph/cody/pull/81)

### Fixed

- Fixed a bug that caused messages to disappear when signed-in users encounter an authentication error. [pull/201](https://github.com/sourcegraph/cody/pull/201)
- Inline Chat: Since last version, running Inline Fixups would add an additional `</selection>` tag to the end of the code edited by Cody, which has now been removed. [pull/182](https://github.com/sourcegraph/cody/pull/182)
- Chat Command: Fixed an issue where /r(est) had a trailing space. [pull/245](https://github.com/sourcegraph/cody/pull/245)
- Inline Fixups: Fixed a regression where Cody's inline fixup suggestions were not properly replacing the user's selection. [pull/70](https://github.com/sourcegraph/cody/pull/70)

### Changed

## [0.4.3]

### Added

- Added support for server-side token limits to Chat. [pull/54488](https://github.com/sourcegraph/sourcegraph/pull/54488)
- Add "Find code smells" recipe to editor context menu and command pallette [pull/54432](https://github.com/sourcegraph/sourcegraph/pull/54432)
- Add a typewriter effect to Cody's responses to mimic typing in characters rather than varying chunks [pull/54522](https://github.com/sourcegraph/sourcegraph/pull/54522)
- Add suggested recipes to the new chat welcome message. [pull/54277](https://github.com/sourcegraph/sourcegraph/pull/54277)
- Inline Chat: Added the option to collapse all inline chats from within the inline chat window. [pull/54675](https://github.com/sourcegraph/sourcegraph/pull/54675)
- Inline Chat: We now stream messages rather than waiting for the response to be fully complete. This means you can read Cody's response as it is being generated. [pull/54665](https://github.com/sourcegraph/sourcegraph/pull/54665)
- Show network error message when connection is lost and a reload button to get back when network is restored. [pull/107](https://github.com/sourcegraph/cody/pull/107)

### Fixed

- Inline Chat: Update keybind when condition to `editorFocus`. [pull/54437](https://github.com/sourcegraph/sourcegraph/pull/54437)
- Inline Touch: Create a new `.test.` file when `test` or `tests` is included in the instruction. [pull/54437](https://github.com/sourcegraph/sourcegraph/pull/54437)
- Prevents errors from being displayed for a cancelled requests. [pull/54429](https://github.com/sourcegraph/sourcegraph/pull/54429)

### Changed

- Inline Touch: Remove Inline Touch from submenu and command palette. It can be started with `/touch` or `/t` from the Inline Chat due to current limitation. [pull/54437](https://github.com/sourcegraph/sourcegraph/pull/54437)
- Removed the Optimize Code recipe. [pull/54471](https://github.com/sourcegraph/sourcegraph/pull/54471)

## [0.4.2]

### Added

- Add support for onboarding Cody App users on Intel Mac and Linux. [pull/54405](https://github.com/sourcegraph/sourcegraph/pull/54405)

### Fixed

- Fixed HTML escaping in inline chat markdown. [pull/1349](https://github.com/sourcegraph/sourcegraph/pull/1349)

### Changed

## [0.4.1]

### Fixed

- Fixed `cody.customHeaders` never being passed through. [pull/54354](https://github.com/sourcegraph/sourcegraph/pull/54354)
- Fixed users are signed out on 0.4.0 update [pull/54367](https://github.com/sourcegraph/sourcegraph/pull/54367)

### Changed

- Provide more information on Cody App, and improved the login page design for Enterprise customers. [pull/54362](https://github.com/sourcegraph/sourcegraph/pull/54362)

## [0.4.0]

### Added

- The range of the editor selection, if present, is now displayed alongside the file name in the chat footer. [pull/53742](https://github.com/sourcegraph/sourcegraph/pull/53742)
- Support switching between multiple instances with `Switch Account`. [pull/53434](https://github.com/sourcegraph/sourcegraph/pull/53434)
- Automate sign-in flow with Cody App. [pull/53908](https://github.com/sourcegraph/sourcegraph/pull/53908)
- Add a warning message to recipes when the selection gets truncated. [pull/54025](https://github.com/sourcegraph/sourcegraph/pull/54025)
- Start up loading screen. [pull/54106](https://github.com/sourcegraph/sourcegraph/pull/54106)

### Fixed

- Autocomplete: Include the number of lines of an accepted autocomplete recommendation and fix an issue where sometimes accepted completions would not be logged correctly. [pull/53878](https://github.com/sourcegraph/sourcegraph/pull/53878)
- Stop-Generating button does not stop Cody from responding if pressed before answer is generating. [pull/53827](https://github.com/sourcegraph/sourcegraph/pull/53827)
- Endpoint setting out of sync issue. [pull/53434](https://github.com/sourcegraph/sourcegraph/pull/53434)
- Endpoint URL without protocol causing sign-ins to fail. [pull/53908](https://github.com/sourcegraph/sourcegraph/pull/53908)
- Autocomplete: Fix network issues when using remote VS Code setups. [pull/53956](https://github.com/sourcegraph/sourcegraph/pull/53956)
- Autocomplete: Fix an issue where the loading indicator would not reset when a network error ocurred. [pull/53956](https://github.com/sourcegraph/sourcegraph/pull/53956)
- Autocomplete: Improve local context performance. [pull/54124](https://github.com/sourcegraph/sourcegraph/pull/54124)
- Chat: Fix an issue where the window would automatically scroll to the bottom as Cody responds regardless of where the users scroll position was. [pull/54188](https://github.com/sourcegraph/sourcegraph/pull/54188)
- Codebase index status does not get updated on workspace change. [pull/54106](https://github.com/sourcegraph/sourcegraph/pull/54106)
- Button for connect to App after user is signed out. [pull/54106](https://github.com/sourcegraph/sourcegraph/pull/54106)
- Fixes an issue with link formatting. [pull/54200](https://github.com/sourcegraph/sourcegraph/pull/54200)
- Fixes am issue where Cody would sometimes not respond. [pull/54268](https://github.com/sourcegraph/sourcegraph/pull/54268)
- Fixes authentication related issues. [pull/54237](https://github.com/sourcegraph/sourcegraph/pull/54237)

### Changed

- Autocomplete: Improve completion quality. [pull/53720](https://github.com/sourcegraph/sourcegraph/pull/53720)
- Autocomplete: Completions are now referred to as autocomplete. [pull/53851](https://github.com/sourcegraph/sourcegraph/pull/53851)
- Autocomplete: Autocomplete is now turned on by default. [pull/54166](https://github.com/sourcegraph/sourcegraph/pull/54166)
- Improved the response quality when Cody is asked about a selected piece of code through the chat window. [pull/53742](https://github.com/sourcegraph/sourcegraph/pull/53742)
- Refactored authentication process. [pull/53434](https://github.com/sourcegraph/sourcegraph/pull/53434)
- New sign-in and sign-out flow. [pull/53434](https://github.com/sourcegraph/sourcegraph/pull/53434)
- Analytical logs are now displayed in the Output view. [pull/53870](https://github.com/sourcegraph/sourcegraph/pull/53870)
- Inline Chat: Renamed Inline Assist to Inline Chat. [pull/53725](https://github.com/sourcegraph/sourcegraph/pull/53725) [pull/54315](https://github.com/sourcegraph/sourcegraph/pull/54315)
- Chat: Link to the "Getting Started" guide directly from the first chat message instead of the external documentation website. [pull/54175](https://github.com/sourcegraph/sourcegraph/pull/54175)
- Codebase status icons. [pull/54262](https://github.com/sourcegraph/sourcegraph/pull/54262)
- Changed the keyboard shortcut for the file touch recipe to `ctrl+alt+/` to avoid conflicts. [pull/54275](https://github.com/sourcegraph/sourcegraph/pull/54275)
- Inline Chat: Do not change current focus when Inline Fixup is done. [pull/53980](https://github.com/sourcegraph/sourcegraph/pull/53980)
- Inline Chat: Replace Close CodeLens with Accept. [pull/53980](https://github.com/sourcegraph/sourcegraph/pull/53980)
- Inline Chat: Moved to Beta state. It is now enabled by default. [pull/54315](https://github.com/sourcegraph/sourcegraph/pull/54315)

## [0.2.5]

### Added

- `Stop Generating` button to cancel a request and stop Cody's response. [pull/53332](https://github.com/sourcegraph/sourcegraph/pull/53332)

### Fixed

- Fixes the rendering of duplicate context files in response. [pull/53662](https://github.com/sourcegraph/sourcegraph/pull/53662)
- Fixes an issue where local keyword context was trying to open binary files. [pull/53662](https://github.com/sourcegraph/sourcegraph/pull/53662)
- Fixes the hallucination detection behavior for directory, API and git refs pattern. [pull/53553](https://github.com/sourcegraph/sourcegraph/pull/53553)

### Changed

- Completions: Updating configuration no longer requires reloading the extension. [pull/53401](https://github.com/sourcegraph/sourcegraph/pull/53401)
- New chat layout. [pull/53332](https://github.com/sourcegraph/sourcegraph/pull/53332)
- Completions: Completions can now be used on unsaved files. [pull/53495](https://github.com/sourcegraph/sourcegraph/pull/53495)
- Completions: Add multi-line heuristics for C, C++, C#, and Java. [pull/53631](https://github.com/sourcegraph/sourcegraph/pull/53631)
- Completions: Add context summaries and language information to analytics. [pull/53746](https://github.com/sourcegraph/sourcegraph/pull/53746)
- More compact chat suggestion buttons. [pull/53755](https://github.com/sourcegraph/sourcegraph/pull/53755)

## [0.2.4]

### Added

- Hover tooltips to intent-detection underlines. [pull/52029](https://github.com/sourcegraph/sourcegraph/pull/52029)
- Notification to prompt users to setup Cody if it wasn't configured initially. [pull/53321](https://github.com/sourcegraph/sourcegraph/pull/53321)
- Added a new Cody status bar item to relay global loading states and allowing you to quickly enable/disable features. [pull/53307](https://github.com/sourcegraph/sourcegraph/pull/53307)

### Fixed

- Fix `Continue with Sourcegraph.com` callback URL. [pull/53418](https://github.com/sourcegraph/sourcegraph/pull/53418)

### Changed

- Simplified the appearance of commands in various parts of the UI [pull/53395](https://github.com/sourcegraph/sourcegraph/pull/53395)

## [0.2.3]

### Added

- Add delete button for removing individual history. [pull/52904](https://github.com/sourcegraph/sourcegraph/pull/52904)
- Load the recent ongoing chat on reload of window. [pull/52904](https://github.com/sourcegraph/sourcegraph/pull/52904)
- Handle URL callbacks from `vscode-insiders`. [pull/53313](https://github.com/sourcegraph/sourcegraph/pull/53313)
- Inline Assist: New Code Lens to undo `inline fix` performed by Cody. [pull/53348](https://github.com/sourcegraph/sourcegraph/pull/53348)

### Fixed

- Fix the loading of files and scroll chat to the end while restoring the history. [pull/52904](https://github.com/sourcegraph/sourcegraph/pull/52904)
- Open file paths from Cody's responses in a workspace with the correct protocol. [pull/53103](https://github.com/sourcegraph/sourcegraph/pull/53103)
- Cody completions: Fixes an issue where completions would often start in the next line. [pull/53246](https://github.com/sourcegraph/sourcegraph/pull/53246)

### Changed

- Save the current ongoing conversation to the chat history [pull/52904](https://github.com/sourcegraph/sourcegraph/pull/52904)
- Inline Assist: Updating configuration no longer requires reloading the extension. [pull/53348](https://github.com/sourcegraph/sourcegraph/pull/53348)
- Context quality has been improved when the repository has not been indexed. The LLM is used to generate keyword and filename queries, and the LLM also reranks results from multiple sources. Response latency has also improved on long user queries. [pull/52815](https://github.com/sourcegraph/sourcegraph/pull/52815)

## [0.2.2]

### Added

- New recipe: `Generate PR description`. Generate the PR description using the PR template guidelines for the changes made in the current branch. [pull/51721](https://github.com/sourcegraph/sourcegraph/pull/51721)
- Open context search results links as workspace file. [pull/52856](https://github.com/sourcegraph/sourcegraph/pull/52856)
- Cody Inline Assist: Decorations for `/fix` errors. [pull/52796](https://github.com/sourcegraph/sourcegraph/pull/52796)
- Open file paths from Cody's responses in workspace. [pull/53069](https://github.com/sourcegraph/sourcegraph/pull/53069)
- Help & Getting Started: Walkthrough to help users get setup with Cody and discover new features. [pull/52560](https://github.com/sourcegraph/sourcegraph/pull/52560)

### Fixed

- Cody Inline Assist: Decorations for `/fix` on light theme. [pull/52796](https://github.com/sourcegraph/sourcegraph/pull/52796)
- Cody Inline Assist: Use more than 1 context file for `/touch`. [pull/52796](https://github.com/sourcegraph/sourcegraph/pull/52796)
- Cody Inline Assist: Fixes cody processing indefinitely issue. [pull/52796](https://github.com/sourcegraph/sourcegraph/pull/52796)
- Cody completions: Various fixes for completion analytics. [pull/52935](https://github.com/sourcegraph/sourcegraph/pull/52935)
- Cody Inline Assist: Indentation on `/fix` [pull/53068](https://github.com/sourcegraph/sourcegraph/pull/53068)

### Changed

- Internal: Do not log events during tests. [pull/52865](https://github.com/sourcegraph/sourcegraph/pull/52865)
- Cody completions: Improved the number of completions presented and reduced the latency. [pull/52935](https://github.com/sourcegraph/sourcegraph/pull/52935)
- Cody completions: Various improvements to the context. [pull/53043](https://github.com/sourcegraph/sourcegraph/pull/53043)

## [0.2.1]

### Fixed

- Escape Windows path separator in fast file finder path pattern. [pull/52754](https://github.com/sourcegraph/sourcegraph/pull/52754)
- Only display errors from the embeddings clients for users connected to an indexed codebase. [pull/52780](https://github.com/sourcegraph/sourcegraph/pull/52780)

### Changed

## [0.2.0]

### Added

- Cody Inline Assist: New recipe for creating new files with `/touch` command. [pull/52511](https://github.com/sourcegraph/sourcegraph/pull/52511)
- Cody completions: Experimental support for multi-line inline completions for JavaScript, TypeScript, Go, and Python using indentation based truncation. [issues/52588](https://github.com/sourcegraph/sourcegraph/issues/52588)
- Display embeddings search, and connection error to the webview panel. [pull/52491](https://github.com/sourcegraph/sourcegraph/pull/52491)
- New recipe: `Optimize Code`. Optimize the time and space consumption of code. [pull/51974](https://github.com/sourcegraph/sourcegraph/pull/51974)
- Button to insert code block text at cursor position in text editor. [pull/52528](https://github.com/sourcegraph/sourcegraph/pull/52528)

### Fixed

- Cody completions: Fixed interop between spaces and tabs. [pull/52497](https://github.com/sourcegraph/sourcegraph/pull/52497)
- Fixes an issue where new conversations did not bring the chat into the foreground. [pull/52363](https://github.com/sourcegraph/sourcegraph/pull/52363)
- Cody completions: Prevent completions for lines that have a word in the suffix. [issues/52582](https://github.com/sourcegraph/sourcegraph/issues/52582)
- Cody completions: Fixes an issue where multi-line inline completions closed the current block even if it already had content. [pull/52615](https://github.com/sourcegraph/sourcegraph/52615)
- Cody completions: Fixed an issue where the Cody response starts with a newline and was previously ignored. [issues/52586](https://github.com/sourcegraph/sourcegraph/issues/52586)

### Changed

- Cody is now using `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions. [pull/52412](https://github.com/sourcegraph/sourcegraph/pull/52412)
- Cody completions: Fixed an issue where the Cody response starts with a newline and was previously ignored [issues/52586](https://github.com/sourcegraph/sourcegraph/issues/52586)
- Cody completions: Improves the behavior of the completions cache when characters are deleted from the editor. [pull/52695](https://github.com/sourcegraph/sourcegraph/pull/52695)

### Changed

- Cody completions: Improve completion logger and measure the duration a completion is displayed for. [pull/52695](https://github.com/sourcegraph/sourcegraph/pull/52695)

## [0.1.5]

### Added

### Fixed

- Inline Assist broken decorations for Inline-Fixup tasks [pull/52322](https://github.com/sourcegraph/sourcegraph/pull/52322)

### Changed

- Various Cody completions related improvements [pull/52365](https://github.com/sourcegraph/sourcegraph/pull/52365)

## [0.1.4]

### Added

- Added support for local keyword search on Windows. [pull/52251](https://github.com/sourcegraph/sourcegraph/pull/52251)

### Fixed

- Setting `cody.useContext` to `none` will now limit Cody to using only the currently open file. [pull/52126](https://github.com/sourcegraph/sourcegraph/pull/52126)
- Fixes race condition in telemetry. [pull/52279](https://github.com/sourcegraph/sourcegraph/pull/52279)
- Don't search for file paths if no file paths to validate. [pull/52267](https://github.com/sourcegraph/sourcegraph/pull/52267)
- Fix handling of embeddings search backward compatibility. [pull/52286](https://github.com/sourcegraph/sourcegraph/pull/52286)

### Changed

- Cleanup the design of the VSCode history view. [pull/51246](https://github.com/sourcegraph/sourcegraph/pull/51246)
- Changed menu icons and order. [pull/52263](https://github.com/sourcegraph/sourcegraph/pull/52263)
- Deprecate `cody.debug` for three new settings: `cody.debug.enable`, `cody.debug.verbose`, and `cody.debug.filter`. [pull/52236](https://github.com/sourcegraph/sourcegraph/pull/52236)

## [0.1.3]

### Added

- Add support for connecting to Sourcegraph App when a supported version is installed. [pull/52075](https://github.com/sourcegraph/sourcegraph/pull/52075)

### Fixed

- Displays error banners on all view instead of chat view only. [pull/51883](https://github.com/sourcegraph/sourcegraph/pull/51883)
- Surfaces errors for corrupted token from secret storage. [pull/51883](https://github.com/sourcegraph/sourcegraph/pull/51883)
- Inline Assist add code lenses to all open files [pull/52014](https://github.com/sourcegraph/sourcegraph/pull/52014)

### Changed

- Removes unused configuration option: `cody.enabled`. [pull/51883](https://github.com/sourcegraph/sourcegraph/pull/51883)
- Arrow key behavior: you can now navigate forwards through messages with the down arrow; additionally the up and down arrows will navigate backwards and forwards only if you're at the start or end of the drafted text, respectively. [pull/51586](https://github.com/sourcegraph/sourcegraph/pull/51586)
- Display a more user-friendly error message when the user is connected to sourcegraph.com and doesn't have a verified email. [pull/51870](https://github.com/sourcegraph/sourcegraph/pull/51870)
- Keyword context: Excludes files larger than 1M and adds a 30sec timeout period [pull/52038](https://github.com/sourcegraph/sourcegraph/pull/52038)

## [0.1.2]

### Added

- `Inline Assist`: a new way to interact with Cody inside your files. To enable this feature, please set the `cody.experimental.inline` option to true. [pull/51679](https://github.com/sourcegraph/sourcegraph/pull/51679)

### Fixed

- UI bug that capped buttons at 300px max-width with visible border [pull/51726](https://github.com/sourcegraph/sourcegraph/pull/51726)
- Fixes anonymous user id resetting after logout [pull/51532](https://github.com/sourcegraph/sourcegraph/pull/51532)
- Add error message on top of Cody's response instead of overriding it [pull/51762](https://github.com/sourcegraph/sourcegraph/pull/51762)
- Fixes an issue where chat input messages where not rendered in the UI immediately [pull/51783](https://github.com/sourcegraph/sourcegraph/pull/51783)
- Fixes an issue where file where the hallucination detection was not working properly [pull/51785](https://github.com/sourcegraph/sourcegraph/pull/51785)
- Aligns Edit button style with feedback buttons [pull/51767](https://github.com/sourcegraph/sourcegraph/pull/51767)

### Changed

- Pressing the icon to reset the clear history now makes sure that the chat tab is shown [pull/51786](https://github.com/sourcegraph/sourcegraph/pull/51786)
- Rename the extension from "Sourcegraph Cody" to "Cody AI by Sourcegraph" [pull/51702](https://github.com/sourcegraph/sourcegraph/pull/51702)
- Remove HTML escaping artifacts [pull/51797](https://github.com/sourcegraph/sourcegraph/pull/51797)

## [0.1.1]

### Fixed

- Remove system alerts from non-actionable items [pull/51714](https://github.com/sourcegraph/sourcegraph/pull/51714)

## [0.1.0]

### Added

- New recipe: `Codebase Context Search`. Run an approximate search across the codebase. It searches within the embeddings when available to provide relevant code context. [pull/51077](https://github.com/sourcegraph/sourcegraph/pull/51077)
- Add support to slash commands `/` in chat. [pull/51077](https://github.com/sourcegraph/sourcegraph/pull/51077)
  - `/r` or `/reset` to reset chat
  - `/s` or `/search` to perform codebase context search
- Adds usage metrics to the experimental chat predictions feature [pull/51474](https://github.com/sourcegraph/sourcegraph/pull/51474)
- Add highlighted code to context message automatically [pull/51585](https://github.com/sourcegraph/sourcegraph/pull/51585)
- New recipe: `Generate Release Notes` --generate release notes based on the available tags or the selected commits for the time period. It summarises the git commits into standard release notes format of new features, bugs fixed, docs improvements. [pull/51481](https://github.com/sourcegraph/sourcegraph/pull/51481)
- New recipe: `Generate Release Notes`. Generate release notes based on the available tags or the selected commits for the time period. It summarizes the git commits into standard release notes format of new features, bugs fixed, docs improvements. [pull/51481](https://github.com/sourcegraph/sourcegraph/pull/51481)

### Fixed

- Error notification display pattern for rate limit [pull/51521](https://github.com/sourcegraph/sourcegraph/pull/51521)
- Fixes issues with branch switching and file deletions when using the experimental completions feature [pull/51565](https://github.com/sourcegraph/sourcegraph/pull/51565)
- Improves performance of hallucination detection for file paths and supports paths relative to the project root [pull/51558](https://github.com/sourcegraph/sourcegraph/pull/51558), [pull/51625](https://github.com/sourcegraph/sourcegraph/pull/51625)
- Fixes an issue where inline code blocks were unexpectedly escaped [pull/51576](https://github.com/sourcegraph/sourcegraph/pull/51576)

### Changed

- Promote Cody from experimental to beta [pull/](https://github.com/sourcegraph/sourcegraph/pull/)
- Various improvements to the experimental completions feature

## [0.0.10]

### Added

- Adds usage metrics to the experimental completions feature [pull/51350](https://github.com/sourcegraph/sourcegraph/pull/51350)
- Updating `cody.codebase` does not require reloading VS Code [pull/51274](https://github.com/sourcegraph/sourcegraph/pull/51274)

### Fixed

- Fixes an issue where code blocks were unexpectedly escaped [pull/51247](https://github.com/sourcegraph/sourcegraph/pull/51247)

### Changed

- Improved Cody header and layout details [pull/51348](https://github.com/sourcegraph/sourcegraph/pull/51348)
- Replace `Cody: Set Access Token` command with `Cody: Sign in` [pull/51274](https://github.com/sourcegraph/sourcegraph/pull/51274)
- Various improvements to the experimental completions feature

## [0.0.9]

### Added

- Adds new experimental chat predictions feature to suggest follow-up conversations. Enable it with the new `cody.experimental.chatPredictions` feature flag. [pull/51201](https://github.com/sourcegraph/sourcegraph/pull/51201)
- Auto update `cody.codebase` setting from current open file [pull/51045](https://github.com/sourcegraph/sourcegraph/pull/51045)
- Properly render rate-limiting on requests [pull/51200](https://github.com/sourcegraph/sourcegraph/pull/51200)
- Error display in UI [pull/51005](https://github.com/sourcegraph/sourcegraph/pull/51005)
- Edit buttons for editing last submitted message [pull/51009](https://github.com/sourcegraph/sourcegraph/pull/51009)
- [Security] Content security policy to webview [pull/51152](https://github.com/sourcegraph/sourcegraph/pull/51152)

### Fixed

- Escaped HTML issue [pull/51144](https://github.com/sourcegraph/sourcegraph/pull/51151)
- Unauthorized sessions [pull/51005](https://github.com/sourcegraph/sourcegraph/pull/51005)

### Changed

- Various improvements to the experimental completions feature [pull/51161](https://github.com/sourcegraph/sourcegraph/pull/51161) [51046](https://github.com/sourcegraph/sourcegraph/pull/51046)
- Visual improvements to the history page, ability to resume past conversations [pull/51159](https://github.com/sourcegraph/sourcegraph/pull/51159)

## [Template]

### Added

### Fixed

### Changed
