# Changelog

All notable changes to Sourcegraph Cody will be documented in this file.

Starting from `0.2.0`, Cody is using `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions.

## [Unreleased]

### Added

- Chat: A new chat model selection dropdown that allows selecting between different chat models when connected to the sourcegraph.com instance. [pull/1676](https://github.com/sourcegraph/cody/pull/1676)
- Chat: New button in editor title for restarting chat session in current chat panel (non-sidebar chat view). [pull/1687](https://github.com/sourcegraph/cody/pull/1687)
- Chat: New `@` command that allows you to attach files via the chat input box. [pull/1631](https://github.com/sourcegraph/cody/pull/1631)
- Edit: Added a specific, faster, response flow for fixes when triggered directly from code actions. [pull/1639](https://github.com/sourcegraph/cody/pull/1639)

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

### Changed

- Edit: Fixed formatting issues with some editor formatters that required explict indendation configuration. [pull/1620](https://github.com/sourcegraph/cody/pull/1620)
- Edit: Fixed an issue where the diff for an edit could expand recursively each time it is viewed. [pull/1621](https://github.com/sourcegraph/cody/pull/1621)
- Editor Title Icon has been moved out of the experimental stage and is now enabled by default. [pull/1651](https://github.com/sourcegraph/cody/pull/1651)
- Clean up login page styles and make Enterprise login more prominent. [pull/1708](https://github.com/sourcegraph/cody/pull/1708)

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
- UX improvements to the custom command workflow (and new [custom command docs](https://docs.sourcegraph.com/cody/custom-commands)). [pull/992](https://github.com/sourcegraph/cody/pull/992)
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
