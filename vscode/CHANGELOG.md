# Changelog

This is a log of all notable changes to Cody for VS Code.

<!--- {/_ CHANGELOG_START _/} -->

## v1.66.0

### Features

#### Agentic-Context

- disable setting by default [#6641](https://github.com/sourcegraph/cody/pull/6641)
- add feature flag for session usage limit [#6623](https://github.com/sourcegraph/cody/pull/6623)

#### Audo-Edit

- target vim normal mode only [#6647](https://github.com/sourcegraph/cody/pull/6647)

#### Audoedit

- update billing categories [#6591](https://github.com/sourcegraph/cody/pull/6591)
- add char/line count stats to analytics events [#6563](https://github.com/sourcegraph/cody/pull/6563)
- check if suggestion is still visible before marking as read [#6552](https://github.com/sourcegraph/cody/pull/6552)
- improve output channel logs [#6551](https://github.com/sourcegraph/cody/pull/6551)
- add the `accept` command callback [#6543](https://github.com/sourcegraph/cody/pull/6543)
- autoedits provider integration tests [#6536](https://github.com/sourcegraph/cody/pull/6536)
- integrate analytics logger with autoedits provider [#6535](https://github.com/sourcegraph/cody/pull/6535)
- add `isRead` field and `postProcessed` state to the analytics logger [#6534](https://github.com/sourcegraph/cody/pull/6534)
- rename `logSummary` to `contextSummary` to match the type name [#6533](https://github.com/sourcegraph/cody/pull/6533)
- improve suffix duplicate detection [#6532](https://github.com/sourcegraph/cody/pull/6532)
- update vscode mocks [#6531](https://github.com/sourcegraph/cody/pull/6531)
- reactive config singleton [#6530](https://github.com/sourcegraph/cody/pull/6530)
- remove the auto edit experimental command [#6471](https://github.com/sourcegraph/cody/pull/6471)
- ensure inline completions are also hidden on dismiss [#6465](https://github.com/sourcegraph/cody/pull/6465)
- extract autoedits config from the provider [#6460](https://github.com/sourcegraph/cody/pull/6460)
- implement basic analytics logger [#6430](https://github.com/sourcegraph/cody/pull/6430)
- dismiss suggestions on selection change [#6406](https://github.com/sourcegraph/cody/pull/6406)
- inline renderer – prevent flickering on acceptance [#6360](https://github.com/sourcegraph/cody/pull/6360)
- add full line removal decorations to the inline renderer [#6359](https://github.com/sourcegraph/cody/pull/6359)
- shrink autoedits on document suffix match [#6343](https://github.com/sourcegraph/cody/pull/6343)
- improve inline renderer offline testing logic [#6341](https://github.com/sourcegraph/cody/pull/6341)
- smartly merge whitespace line changes [#6340](https://github.com/sourcegraph/cody/pull/6340)
- avoid decoration info mutation [#6313](https://github.com/sourcegraph/cody/pull/6313)
- enable E2E UX testing with mock responses [#6236](https://github.com/sourcegraph/cody/pull/6236)
- fix dupicate suggestion text [#6235](https://github.com/sourcegraph/cody/pull/6235)
- inline renderer POC [#6214](https://github.com/sourcegraph/cody/pull/6214)

#### Auth

- Allow workspace to pre-populate URL for quick sign-in (#6653) [#6812](https://github.com/sourcegraph/cody/pull/6812)
- Allow workspace to pre-populate URL for quick sign-in [#6653](https://github.com/sourcegraph/cody/pull/6653)

#### Auto-Edit

- fix the temperature value regression with the auto-edit [#6848](https://github.com/sourcegraph/cody/pull/6848)
- fix problem with vim extension supressing the tab [#6640](https://github.com/sourcegraph/cody/pull/6640)
- improve error logging [#6609](https://github.com/sourcegraph/cody/pull/6609)

#### Auto-Edits

- add telemetry for auto-edits notification [#6594](https://github.com/sourcegraph/cody/pull/6594)
- add test case for setting context [#6592](https://github.com/sourcegraph/cody/pull/6592)
- fix the suffix duplication on inline accept [#6583](https://github.com/sourcegraph/cody/pull/6583)
- fix the partial decoration issue when not enough lines in the editor [#6582](https://github.com/sourcegraph/cody/pull/6582)
- fix tab not working when decorations are triggered on conflicting decorations [#6581](https://github.com/sourcegraph/cody/pull/6581)
- clean auto-edits output channel [#6547](https://github.com/sourcegraph/cody/pull/6547)
- adding autoedits onboarding setup for dotcom users [#6463](https://github.com/sourcegraph/cody/pull/6463)

#### Autoedit

- Fix blockify range logic for tab indentation [#6701](https://github.com/sourcegraph/cody/pull/6701)
- E2E tests, adjust color threshold [#6616](https://github.com/sourcegraph/cody/pull/6616)
- Add telemetry and accept behaviour to E2E tests [#6575](https://github.com/sourcegraph/cody/pull/6575)
- Add more E2E test scenarios [#6573](https://github.com/sourcegraph/cody/pull/6573)
- add `discarded` events [#6564](https://github.com/sourcegraph/cody/pull/6564)
- restrict autoedit to vscode [#6184](https://github.com/sourcegraph/cody/pull/6184)
- refactor renderer code to simplify iteration on decor… [#6163](https://github.com/sourcegraph/cody/pull/6163)
- use code completion feature for auto edits [#6161](https://github.com/sourcegraph/cody/pull/6161)
- fix cursor jumping issue [#6156](https://github.com/sourcegraph/cody/pull/6156)
- combine inline completion provider and selection change [#6147](https://github.com/sourcegraph/cody/pull/6147)

#### Autoedits

- Correctly produce decorations for files that use Tab indentation [#6617](https://github.com/sourcegraph/cody/pull/6617)
- make it reactive to config changes [#6537](https://github.com/sourcegraph/cody/pull/6537)

#### Bench

- unit test framework for cody-bench [#4710](https://github.com/sourcegraph/cody/pull/4710)

#### Cached-Retriever

- handle non-file scheme URIs in openTextDocument [#4942](https://github.com/sourcegraph/cody/pull/4942)

#### Chat

- improve messaging for non-streaming models [#5568](https://github.com/sourcegraph/cody/pull/5568)

#### Cody

- Prep for the A/B test on Claude 3.5 Haiku as the default chat model for Free users (CODY-4455) [#6304](https://github.com/sourcegraph/cody/pull/6304)
- Prevent Enterprise users from logging into dotcom/PLG (CODY-4295) [#6182](https://github.com/sourcegraph/cody/pull/6182)
  - Prevent PLG login methods for enterprise users

#### Context

- Add Prompt Caching to Code Context (CODY-4807) [#6878](https://github.com/sourcegraph/cody/pull/6878)

#### Context-Agent

- move Deep Cody out of model dropdown [#6513](https://github.com/sourcegraph/cody/pull/6513)
- tool status callbacks and process support [#6451](https://github.com/sourcegraph/cody/pull/6451)

#### Deep-Cody

- add selected agent tracking and update telemetry [#6548](https://github.com/sourcegraph/cody/pull/6548)
- implement daily usage limit [#6307](https://github.com/sourcegraph/cody/pull/6307)

#### Eclipse

- Add support for linux (CODY-3536) [#5573](https://github.com/sourcegraph/cody/pull/5573)

#### Edit

- enable predicted outputs for gpt-4o models [#6116](https://github.com/sourcegraph/cody/pull/6116)
  - Edit: Enabled [the Predicted Outputs feature](https://platform.openai.com/docs/guides/predicted-outputs) for GPT-4o models.

#### Enterprise

- allow multiple models for enterprise customers [#4780](https://github.com/sourcegraph/cody/pull/4780)

#### Jetbrains

- enable shell capabilities [#6298](https://github.com/sourcegraph/cody/pull/6298)

#### Logging

- Add interactionId to header of Cody Client requests (CODY-4117) [#6450](https://github.com/sourcegraph/cody/pull/6450)

#### Nls

- add relevant repo boost [#6502](https://github.com/sourcegraph/cody/pull/6502)

#### Onebox

- Collect more telemetry [#6394](https://github.com/sourcegraph/cody/pull/6394)
- Add ability to select search results as follow up context [#6347](https://github.com/sourcegraph/cody/pull/6347)
- Use new prompt editor when onebox is enabled [#6288](https://github.com/sourcegraph/cody/pull/6288)

#### Perf

- adds `CachedRetriever` [#4608](https://github.com/sourcegraph/cody/pull/4608)

#### Plugins

- add experimental client side Cody plugins [#76](https://github.com/sourcegraph/cody/pull/76)

#### Prompt-Editor

- Add new ProseMirror-based implementation [#6272](https://github.com/sourcegraph/cody/pull/6272)

#### Release

- add backport workflow [#6119](https://github.com/sourcegraph/cody/pull/6119)
  - N/A

#### Ui-Modelselectorfield

- Add max height and scrolling to model selector popover [#5844](https://github.com/sourcegraph/cody/pull/5844)

#### Uninstall

- Delete cached credentials during re-install (CODY-1043) [#5819](https://github.com/sourcegraph/cody/pull/5819)
  - deletes auth credentials and endpoint history when the extension is reinstalled

#### Vscode

- Adds uninstall hook [#4246](https://github.com/sourcegraph/cody/pull/4246)

#### Webview

- replace Deep Cody with Agentic Chat [#6561](https://github.com/sourcegraph/cody/pull/6561)

#### Webviews

- add Sourcegraph Workspaces CTA [#6604](https://github.com/sourcegraph/cody/pull/6604)
- add Sourcegraph Teams providers [#6373](https://github.com/sourcegraph/cody/pull/6373)
- add telemetry events and session-based dismissal for notices [#6266](https://github.com/sourcegraph/cody/pull/6266)

#### Others

- Add more control options to cody web [#6715](https://github.com/sourcegraph/cody/pull/6715)
- omnibox cheatsheet [#6676](https://github.com/sourcegraph/cody/pull/6676)
- at mentions for prompt templates editor [#6638](https://github.com/sourcegraph/cody/pull/6638)
- changelog generation + version update action [#6597](https://github.com/sourcegraph/cody/pull/6597)
- generate changelog action [#6516](https://github.com/sourcegraph/cody/pull/6516)
- boost current repo [#6402](https://github.com/sourcegraph/cody/pull/6402)
- add keyboard nav for prompts library [#6388](https://github.com/sourcegraph/cody/pull/6388)
  - feat: add keyboard nav for prompts library
- prompts library [#6346](https://github.com/sourcegraph/cody/pull/6346)
  - feat: prompts library
- "Report Issue" command for filing bug reports inside VS Code [#3624](https://github.com/sourcegraph/cody/pull/3624)
- support at-mentions context on edits [#3091](https://github.com/sourcegraph/cody/pull/3091)
- support @mention in mid message [#3043](https://github.com/sourcegraph/cody/pull/3043)
- ask Cody about terminal output [#3008](https://github.com/sourcegraph/cody/pull/3008)
- test (edit) command & add tests code lenses [#2959](https://github.com/sourcegraph/cody/pull/2959)
- chat editings, new keybindings, with updated UI [#2826](https://github.com/sourcegraph/cody/pull/2826)
- add support for custom edit commands in chat [#2789](https://github.com/sourcegraph/cody/pull/2789)
- add generated unit test to files automatically [#2646](https://github.com/sourcegraph/cody/pull/2646)
- display error in webview for simple chat [#2132](https://github.com/sourcegraph/cody/pull/2132)
- restore chat webview on reload [#1918](https://github.com/sourcegraph/cody/pull/1918)
- add Claude model 2.0 and 2.1 [#1860](https://github.com/sourcegraph/cody/pull/1860)
- add configurable enhanced context [#1738](https://github.com/sourcegraph/cody/pull/1738)
- pass additional input to custom command [#1731](https://github.com/sourcegraph/cody/pull/1731)
- add restart chat btn to new chat panel [#1687](https://github.com/sourcegraph/cody/pull/1687)
- add chat model selection dropdown [#1676](https://github.com/sourcegraph/cody/pull/1676)
- enable editor title icon by default [#1651](https://github.com/sourcegraph/cody/pull/1651)
- add context file via @ in chat input [#1631](https://github.com/sourcegraph/cody/pull/1631)
- add chat command to sidebar view [#1609](https://github.com/sourcegraph/cody/pull/1609)
- add icons and enablement conditions for commands [#1510](https://github.com/sourcegraph/cody/pull/1510)
- add experimental chat panel [#1486](https://github.com/sourcegraph/cody/pull/1486)
- add source tracking for recipe execution [#1467](https://github.com/sourcegraph/cody/pull/1467)
- auto format code after applying edits [#1441](https://github.com/sourcegraph/cody/pull/1441)
- add source tracing for code generated [#1419](https://github.com/sourcegraph/cody/pull/1419)
- feature flag for making less unhelpful suggestion requests [#1392](https://github.com/sourcegraph/cody/pull/1392)
- add "regenerate" code lens for edits [#1383](https://github.com/sourcegraph/cody/pull/1383)
- filter context with .cody/.ignore [#1382](https://github.com/sourcegraph/cody/pull/1382)
- prevent unhelpful suggestion at empty file end line [#1330](https://github.com/sourcegraph/cody/pull/1330)
- New "Save Code to File" button and other chat code block style updates [#1119](https://github.com/sourcegraph/cody/pull/1119)
- new /doc command with smart selection [#1116](https://github.com/sourcegraph/cody/pull/1116)
- remove unwanted suggestion from the cache [#1105](https://github.com/sourcegraph/cody/pull/1105)
- add infill mode to anthropic claude instant [#974](https://github.com/sourcegraph/cody/pull/974)
- custom starter message configuration [#963](https://github.com/sourcegraph/cody/pull/963)
- add button to export chat history to JSON [#829](https://github.com/sourcegraph/cody/pull/829)
- code smell command, display commands error in chat [#602](https://github.com/sourcegraph/cody/pull/602)
- use token from local fs path [#471](https://github.com/sourcegraph/cody/pull/471)

### Fix

#### Accounts

- Do not prefill the dotcom URL in the Enterprise login field [#6418](https://github.com/sourcegraph/cody/pull/6418)
- Do not sign out when removing an unrelated account [#6269](https://github.com/sourcegraph/cody/pull/6269)
  - fix/accounts: Removing a second account does not dump you back at the login screen.

#### Agent

- Client-managed secrets bug [#6238](https://github.com/sourcegraph/cody/pull/6238)
  - Fixes a bug in the Eclipse plugin where the extension could become unresponsive.

#### Agentic-Chat

- fix prompt-mixin for deep-cody agent [#6654](https://github.com/sourcegraph/cody/pull/6654)

#### Agentic-Context

- Reveal hidden switch in context popup [#6694](https://github.com/sourcegraph/cody/pull/6694)
- update search tool prompt and examples [#6632](https://github.com/sourcegraph/cody/pull/6632)

#### Api

- Set API identifying headers on all HTTP requests (CODY-4209) [#6102](https://github.com/sourcegraph/cody/pull/6102)
  - Sets the `X-Requested-With` header on all HTTP requests.

#### Audoedit

- fix renderer testing command [#6408](https://github.com/sourcegraph/cody/pull/6408)
- do not render removal decorations twice [#6405](https://github.com/sourcegraph/cody/pull/6405)
- fix the scrollbar issue [#6158](https://github.com/sourcegraph/cody/pull/6158)

#### Auto-Edit

- fix the false notification for auto-edit non eligibility [#6899](https://github.com/sourcegraph/cody/pull/6899)
- fix temperature value to be low for output consistency [#6853](https://github.com/sourcegraph/cody/pull/6853)
- fix the cody status bar with new suggestion mode [#6691](https://github.com/sourcegraph/cody/pull/6691)
- fix the feature name [#6682](https://github.com/sourcegraph/cody/pull/6682)

#### Autoedit

- Ensure suffix decorations do not visually interfere with other decorations [#6554](https://github.com/sourcegraph/cody/pull/6554)
- fix shrink prediction logic [#6404](https://github.com/sourcegraph/cody/pull/6404)
- fix suffix matching logic [#6171](https://github.com/sourcegraph/cody/pull/6171)

#### Autoedits

- Fix E2E tests on main [#6576](https://github.com/sourcegraph/cody/pull/6576)

#### Chat

- Hide insert and new file buttons if there is no `edit` capability [#6018](https://github.com/sourcegraph/cody/pull/6018)
  - Hide non-functional edit buttons in chat if client does not support the functionality.
- Improve performance in streaming responses in long chats [#5875](https://github.com/sourcegraph/cody/pull/5875)
  - Chat response streaming is much smoother, especially for long chats.
- support non-streaming chat completion requests [#5565](https://github.com/sourcegraph/cody/pull/5565)
  - feat(chat): support non-streaming requests
- reorder feedback button submission logic [#5509](https://github.com/sourcegraph/cody/pull/5509)
  - Chat: Fixed feedback buttons not working in chat.

#### Ci

- add cross-env dep and use with LOG_BUNDLE_SIZE [#6819](https://github.com/sourcegraph/cody/pull/6819)
- Increase test timeout for uninstall test [#6038](https://github.com/sourcegraph/cody/pull/6038)
- disable google auth login if the PR is from a fork [#5984](https://github.com/sourcegraph/cody/pull/5984)
- improvements for test reliability in CI [#4447](https://github.com/sourcegraph/cody/pull/4447)

#### Cli

- fail fast if the provided --context-file is too large [#5191](https://github.com/sourcegraph/cody/pull/5191)

#### Codegen

- Adds special cases for `AuthStatus` to re-enable codegen [#5854](https://github.com/sourcegraph/cody/pull/5854)

#### Cody

- fix chat context review logic [#6602](https://github.com/sourcegraph/cody/pull/6602)
- fix empty local storage cody chat run [#6322](https://github.com/sourcegraph/cody/pull/6322)

#### Commands

- remove duplicated commands from Cody Commands menu [#5557](https://github.com/sourcegraph/cody/pull/5557)

#### Context

- Link to helpful resource when current repo not indexed in non-dotcom [#6695](https://github.com/sourcegraph/cody/pull/6695)
- Nit, remove duplicate "this" from Agentic context popover [#6633](https://github.com/sourcegraph/cody/pull/6633)

#### Context-Agent

- add status callbacks back [#6479](https://github.com/sourcegraph/cody/pull/6479)

#### Deep-Cody

- Rate limiter synchronization issue [#6377](https://github.com/sourcegraph/cody/pull/6377)
- missing experimental badge on model list [#6334](https://github.com/sourcegraph/cody/pull/6334)
- agent can removes memory from storage [#6332](https://github.com/sourcegraph/cody/pull/6332)
- wildcard should not be ignored in allow list for shell context [#6256](https://github.com/sourcegraph/cody/pull/6256)

#### Deps

- update dependency commander to v11 [#530](https://github.com/sourcegraph/cody/pull/530)
- update dependency lru-cache to v10 [#526](https://github.com/sourcegraph/cody/pull/526)

#### Dev

- fix params used by groqChatClient [#5490](https://github.com/sourcegraph/cody/pull/5490)
  - Fixed an issue where incorrect request parameters caused stream requests to fail when using local OpenAI-compatible model provider through the groqChatClients.

#### Editor

- Ask Cody to Fix no longer throws exceptions in TypeScript files [#6473](https://github.com/sourcegraph/cody/pull/6473)

#### Graphql

- Cache the SiteProductVersion query for up to 10 minutes [#6111](https://github.com/sourcegraph/cody/pull/6111)
  - SiteProductVersion, a heavily used GraphQL query, is cached for up to 10 minutes. Failures are retried with exponential backoff.

#### Intent

- Insert detected intent scores into telemetry event metadata in acceptable format [#6686](https://github.com/sourcegraph/cody/pull/6686)

#### Jetbrains

- Don't open a new chat window when applying code from chat [#5358](https://github.com/sourcegraph/cody/pull/5358)
- Use postcss-nested to support Chromium 111 in JetBrains 2023.2 JBCEF [#5344](https://github.com/sourcegraph/cody/pull/5344)

#### Local_e2e

- diagnose properly access token issues [#4854](https://github.com/sourcegraph/cody/pull/4854)

#### Models

- ensure Tool Cody is only added when enabled [#6753](https://github.com/sourcegraph/cody/pull/6753)

#### Modelselectfield

- missing overflow scrollbar when there isn't space to show entire list [#6423](https://github.com/sourcegraph/cody/pull/6423)
  - fix(modelSelectField): missing overflow scrollbar when there isn't space to show entire list

#### Omnibox

- add conditional rendering to buttons [#6731](https://github.com/sourcegraph/cody/pull/6731)
- fix available filters when deselecting [#6717](https://github.com/sourcegraph/cody/pull/6717)
- Hide header labels in narrow chat [#6407](https://github.com/sourcegraph/cody/pull/6407)

#### Onebox

- Do not focus editor when inserting/updating search results context [#6385](https://github.com/sourcegraph/cody/pull/6385)

#### Release

- remove checkout and pull steps to keep workflow referen… [#6737](https://github.com/sourcegraph/cody/pull/6737)
- fix generate changelog template string [#6726](https://github.com/sourcegraph/cody/pull/6726)
- add GH_TOKEN for gh command [#6517](https://github.com/sourcegraph/cody/pull/6517)
- add $ variable invocation [#6509](https://github.com/sourcegraph/cody/pull/6509)
  - Fixes error in release notification step
- remove brackets around version number [#6310](https://github.com/sourcegraph/cody/pull/6310)
- Update backport action to override team_reviews [#6136](https://github.com/sourcegraph/cody/pull/6136)
  - N/A

#### Telemetry

- add billing metadata to `onebox` events [#6802](https://github.com/sourcegraph/cody/pull/6802)

#### Vscode

- adjust user avatar image size in UserMenu and TabsBar [#6518](https://github.com/sourcegraph/cody/pull/6518)

#### Web

- Fix an error in auth arising from missing Symbol.dispose. [#6328](https://github.com/sourcegraph/cody/pull/6328)

#### Webview

- reorder human editor menu buttons [#6660](https://github.com/sourcegraph/cody/pull/6660)
- update context cell for deep cody [#6553](https://github.com/sourcegraph/cody/pull/6553)
- Skip webview copying for eclipse [#5924](https://github.com/sourcegraph/cody/pull/5924)

#### Webviews

- update z-index for user menu [#6380](https://github.com/sourcegraph/cody/pull/6380)
- standardized user avatar size [#6331](https://github.com/sourcegraph/cody/pull/6331)
- limit user avatar height to 24px [#6319](https://github.com/sourcegraph/cody/pull/6319)
- update visual-studio.css scrollbar color [#5513](https://github.com/sourcegraph/cody/pull/5513)

#### Others

- remove code search button [#6855](https://github.com/sourcegraph/cody/pull/6855)
- handle missing spaces around @ mentions in cody chat [#6842](https://github.com/sourcegraph/cody/pull/6842)
- define all base64 characters [#6837](https://github.com/sourcegraph/cody/pull/6837)
- improved support for special characters around @ mentions [#6797](https://github.com/sourcegraph/cody/pull/6797)
- added extension banner to web [#6757](https://github.com/sourcegraph/cody/pull/6757)
- Search results in Cody visual update [#6714](https://github.com/sourcegraph/cody/pull/6714)
- add z-index to quick start modal [#6711](https://github.com/sourcegraph/cody/pull/6711)
- only log on open file [#6704](https://github.com/sourcegraph/cody/pull/6704)
- unicode support, remove current repo mention [#6688](https://github.com/sourcegraph/cody/pull/6688)
- changelog generator with titles instead of changelog entries [#6669](https://github.com/sourcegraph/cody/pull/6669)
- Intent handling logic fixes [#6637](https://github.com/sourcegraph/cody/pull/6637)
- Hide search result checkboxes instead of disabling them [#6568](https://github.com/sourcegraph/cody/pull/6568)
- Remove search context chip on resubmission [#6556](https://github.com/sourcegraph/cody/pull/6556)
- do not filter out path-only results [#6549](https://github.com/sourcegraph/cody/pull/6549)
- Move BigQuery insertion after release step [#6477](https://github.com/sourcegraph/cody/pull/6477)
- remove trailing spaces from extracted query [#6432](https://github.com/sourcegraph/cody/pull/6432)
- Prevent style leaks in cody web [#6427](https://github.com/sourcegraph/cody/pull/6427)
- Styling updates to prompt list [#6409](https://github.com/sourcegraph/cody/pull/6409)
- no prompts found is now shown even with filters [#6387](https://github.com/sourcegraph/cody/pull/6387)
  - fix: show "no prompts found" when no prompt matches the filter
- rewrite symf query only once [#6070](https://github.com/sourcegraph/cody/pull/6070)
- Change chat input placeholder text [#6011](https://github.com/sourcegraph/cody/pull/6011)
- make default chat input taller [#6002](https://github.com/sourcegraph/cody/pull/6002)
- visual tweaks and polish on Cody chat panel [#6000](https://github.com/sourcegraph/cody/pull/6000)
- handle git diff path parsing on Windows [#5449](https://github.com/sourcegraph/cody/pull/5449)
  - Command: Fixed an issue where the experimental `Generate Commit Message` command would fail on Windows due to incorrect parsing of the git diff output.
- use backticks for correct string template syntax [#4967](https://github.com/sourcegraph/cody/pull/4967)
- set cody.chatInSidebar context before cody.activated [#4952](https://github.com/sourcegraph/cody/pull/4952)
- support tree view for non-plg users only [#4950](https://github.com/sourcegraph/cody/pull/4950)
- remove isFirstMessage check for adding userContextFromSelection [#4341](https://github.com/sourcegraph/cody/pull/4341)
- ensure range is RangeData instance [#4084](https://github.com/sourcegraph/cody/pull/4084)
- update ContextItemSource for usage examples [#3986](https://github.com/sourcegraph/cody/pull/3986)
- Handle HTTP URIs and decode URI components in URL context mentions [#3902](https://github.com/sourcegraph/cody/pull/3902)
- sync edit models on AuthStatus change [#3058](https://github.com/sourcegraph/cody/pull/3058)
- ignore non file in status bar [#3013](https://github.com/sourcegraph/cody/pull/3013)
- handle missing prompts in custom commands [#3012](https://github.com/sourcegraph/cody/pull/3012)
- handle ask and edit commands from menu [#2941](https://github.com/sourcegraph/cody/pull/2941)
- update chat input placeholder [#2934](https://github.com/sourcegraph/cody/pull/2934)
- do not display non-chat view in panel [#2904](https://github.com/sourcegraph/cody/pull/2904)
- doc command with empty chat [#2886](https://github.com/sourcegraph/cody/pull/2886)
- update chat panel title on resetting chat [#2786](https://github.com/sourcegraph/cody/pull/2786)
- missing preamble in edit commands [#2716](https://github.com/sourcegraph/cody/pull/2716)
- remove codyProEnabled field from GraphQL API call [#2667](https://github.com/sourcegraph/cody/pull/2667)
- handle missing primaryEmail for enterprise users [#2665](https://github.com/sourcegraph/cody/pull/2665)
- model selection on start up [#2648](https://github.com/sourcegraph/cody/pull/2648)
- ignore all non-file uris by default [#2640](https://github.com/sourcegraph/cody/pull/2640)
- Chat Model DropDown [#2627](https://github.com/sourcegraph/cody/pull/2627)
- respect cody.useContext for context fetching [#2616](https://github.com/sourcegraph/cody/pull/2616)
- check active editor before executing commands [#2614](https://github.com/sourcegraph/cody/pull/2614)
- duplicate edit handling in chat [#2612](https://github.com/sourcegraph/cody/pull/2612)
- show error after Cody response in chat UI [#2566](https://github.com/sourcegraph/cody/pull/2566)
- only prevent default on Ctrl key combo [#2558](https://github.com/sourcegraph/cody/pull/2558)
- remove enhanced context from commands [#2537](https://github.com/sourcegraph/cody/pull/2537)
- chat show up in tree view on submit [#2171](https://github.com/sourcegraph/cody/pull/2171)
- invert notification toggle logic [#2122](https://github.com/sourcegraph/cody/pull/2122)
- decrease chat panel creation debounce time [#2115](https://github.com/sourcegraph/cody/pull/2115)
- open file with range in simple chat [#2092](https://github.com/sourcegraph/cody/pull/2092)
- migrate to chat history manager [#2059](https://github.com/sourcegraph/cody/pull/2059)
- display welcome message by os [#2051](https://github.com/sourcegraph/cody/pull/2051)
- truncate long panel title [#2031](https://github.com/sourcegraph/cody/pull/2031)
- revive simple chat panel [#2016](https://github.com/sourcegraph/cody/pull/2016)
- handle chat command selection logic [#1980](https://github.com/sourcegraph/cody/pull/1980)
- send-button resizes on click [#1977](https://github.com/sourcegraph/cody/pull/1977)
- format chat panel titles [#1967](https://github.com/sourcegraph/cody/pull/1967)
- aligns chat pop-up selection style [#1962](https://github.com/sourcegraph/cody/pull/1962)
- backspace and delete keys to remove character [#1906](https://github.com/sourcegraph/cody/pull/1906)
- display local context [#1858](https://github.com/sourcegraph/cody/pull/1858)
- chat submit button style [#1850](https://github.com/sourcegraph/cody/pull/1850)
- race condition when opening chat panel [#1836](https://github.com/sourcegraph/cody/pull/1836)
- race condition on new panel creation [#1835](https://github.com/sourcegraph/cody/pull/1835)
- select first command on slash [#1828](https://github.com/sourcegraph/cody/pull/1828)
- chat history handling in ChatPanelProvider [#1826](https://github.com/sourcegraph/cody/pull/1826)
- resolve editor when getting doc context [#1793](https://github.com/sourcegraph/cody/pull/1793)
- show edit button on last user message [#1781](https://github.com/sourcegraph/cody/pull/1781)
- context files always display 0 lines [#1776](https://github.com/sourcegraph/cody/pull/1776)
- do not reset file matches on every key [#1755](https://github.com/sourcegraph/cody/pull/1755)
- forbid `<style>` tags in DOMPurify config [#1747](https://github.com/sourcegraph/cody/pull/1747)
- adjust width and height of provider logo [#1743](https://github.com/sourcegraph/cody/pull/1743)
- handle @ files with start line 0 [#1734](https://github.com/sourcegraph/cody/pull/1734)
- error from new chat shortcut [#1696](https://github.com/sourcegraph/cody/pull/1696)
- stop sidebar from opening on panels switch [#1691](https://github.com/sourcegraph/cody/pull/1691)
- handle keyboard shortcuts with Ctrl key [#1690](https://github.com/sourcegraph/cody/pull/1690)
- do not open chat for doc/edit commands [#1678](https://github.com/sourcegraph/cody/pull/1678)
- open document side by side with chat panel [#1677](https://github.com/sourcegraph/cody/pull/1677)
- code block actions event handlers [#1617](https://github.com/sourcegraph/cody/pull/1617)
- prevent chat command selection from propagating event [#1592](https://github.com/sourcegraph/cody/pull/1592)
- remove extra call to loadChatHistory [#1589](https://github.com/sourcegraph/cody/pull/1589)
- handle chat command selection wrapping [#1556](https://github.com/sourcegraph/cody/pull/1556)
- save transcript to chat history on abort [#1550](https://github.com/sourcegraph/cody/pull/1550)
- smart selection not working on the first line of code [#1508](https://github.com/sourcegraph/cody/pull/1508)
- update post process logic for claude instant [#1440](https://github.com/sourcegraph/cody/pull/1440)
- use selectionRange in edits when available [#1429](https://github.com/sourcegraph/cody/pull/1429)
- unresponsive selections in custom command menu [#1416](https://github.com/sourcegraph/cody/pull/1416)
- build workspace commands in trusted workspace only [#1415](https://github.com/sourcegraph/cody/pull/1415)
- swap custom prompts and default prompts order [#1414](https://github.com/sourcegraph/cody/pull/1414)
- apply latency only when last suggestion was read [#1394](https://github.com/sourcegraph/cody/pull/1394)
- remove redundant conditional checks [#1385](https://github.com/sourcegraph/cody/pull/1385)
- simplify inline chat thread label [#1384](https://github.com/sourcegraph/cody/pull/1384)
- log failures during fixup apply and respin [#1357](https://github.com/sourcegraph/cody/pull/1357)
- remove HTML escaping in inline chat markdown [#1349](https://github.com/sourcegraph/cody/pull/1349)
- must stringify public argument before sending [#1325](https://github.com/sourcegraph/cody/pull/1325)
- preamble leak for anthropic [#1274](https://github.com/sourcegraph/cody/pull/1274)
- doc command [#1273](https://github.com/sourcegraph/cody/pull/1273)
- set display text for typewriter [#1270](https://github.com/sourcegraph/cody/pull/1270)
- add enablement for inline chat in context menu [#1209](https://github.com/sourcegraph/cody/pull/1209)
- remove params from logError verbose logging [#1205](https://github.com/sourcegraph/cody/pull/1205)
- doc prompt improvements [#1198](https://github.com/sourcegraph/cody/pull/1198)
- use lastTriggerDocContext instead current [#1168](https://github.com/sourcegraph/cody/pull/1168)
- fixup token limits [#1139](https://github.com/sourcegraph/cody/pull/1139)
- changelog item for pull/907 [#1128](https://github.com/sourcegraph/cody/pull/1128)
- custom command in context menu [#1123](https://github.com/sourcegraph/cody/pull/1123)
- insert not replace for insert at cursor [#1118](https://github.com/sourcegraph/cody/pull/1118)
- use infillBlock not infillBlock.trimEnd() [#1099](https://github.com/sourcegraph/cody/pull/1099)
- reset current chat after clearing history [#857](https://github.com/sourcegraph/cody/pull/857)
- invalid json file for custom commands blocks command menu [#827](https://github.com/sourcegraph/cody/pull/827)
- use editor font for code blocks in chat view [#813](https://github.com/sourcegraph/cody/pull/813)
- support /fix command in chat [#790](https://github.com/sourcegraph/cody/pull/790)
- add null check to inline controller on change [#781](https://github.com/sourcegraph/cody/pull/781)
- handle message abort errors gracefully [#776](https://github.com/sourcegraph/cody/pull/776)
- replace {languageName} in custom prompt [#681](https://github.com/sourcegraph/cody/pull/681)
- change file link color to match buttons [#600](https://github.com/sourcegraph/cody/pull/600)
- handle aborted messages correctly [#598](https://github.com/sourcegraph/cody/pull/598)
- command filter regex [#594](https://github.com/sourcegraph/cody/pull/594)
- relative patterns for file watchers [#573](https://github.com/sourcegraph/cody/pull/573)
- handle errors from Git extension APIs [#562](https://github.com/sourcegraph/cody/pull/562)
- Context file item UI out of sync with file events (VS Code) [#554](https://github.com/sourcegraph/cody/pull/554)
- chat history command and remove setTab [#414](https://github.com/sourcegraph/cody/pull/414)
- missing icons for Inline Chat [#320](https://github.com/sourcegraph/cody/pull/320)
- insert full code at cursor [#282](https://github.com/sourcegraph/cody/pull/282)
- disappearing message for unauthed user [#201](https://github.com/sourcegraph/cody/pull/201)
- remove fixup ending tag [#182](https://github.com/sourcegraph/cody/pull/182)

### Chore

#### Agent

- disable flaky test [#6429](https://github.com/sourcegraph/cody/pull/6429)

#### Audo-Edit

- fix the illegal line runtime error [#6727](https://github.com/sourcegraph/cody/pull/6727)
- add backward compatible setting value [#6673](https://github.com/sourcegraph/cody/pull/6673)
- encapsulate prompt components [#6672](https://github.com/sourcegraph/cody/pull/6672)

#### Audoedit

- ensure consistent auto-edit name [#6611](https://github.com/sourcegraph/cody/pull/6611)
- simplify output channel logger [#6610](https://github.com/sourcegraph/cody/pull/6610)
- decouple `codeToReplaceData` from `getPromptForModelType` [#6474](https://github.com/sourcegraph/cody/pull/6474)
- consistent use of the ouptut channel logger [#6472](https://github.com/sourcegraph/cody/pull/6472)
- test diff logic with different new line chars [#6176](https://github.com/sourcegraph/cody/pull/6176)
- simplify diff utils and renderer data structures [#6172](https://github.com/sourcegraph/cody/pull/6172)

#### Autocomplete

- use the correct output channel label [#6709](https://github.com/sourcegraph/cody/pull/6709)

#### Build

- Teach JetBrains push-git-tag-for-next-release.sh about release branches [#6881](https://github.com/sourcegraph/cody/pull/6881)
- Bump IntelliJ supported platform version to 251 [#6675](https://github.com/sourcegraph/cody/pull/6675)
- Do not complain about GITHUB_ENV when building locally [#6586](https://github.com/sourcegraph/cody/pull/6586)
- Match JetBrains and VSCode branch names for backports [#6258](https://github.com/sourcegraph/cody/pull/6258)
  - chore/build: The backports workflow matches JetBrains and VSCode branch names.
- Remove cody.commit, simply build from the same commit [#6249](https://github.com/sourcegraph/cody/pull/6249)
  - JetBrains and Cody agent are now built from the same commit in the sourcegraph/cody repo.
  - `CODY_DIR` environment variable is no longer an option for JetBrains development.
  - `CODY_AGENT_DEBUG_INSPECT` environment variable can take a new value, `wait`, to wait for attach.
- Merge sourcegraph/jetbrains into the Cody repo [#6247](https://github.com/sourcegraph/cody/pull/6247)
  - JetBrains is in the `jetbrains/` folder and GitHub workflows are adapted to use it.
  - The JetBrains FYI bot is removed.
- VSCode Insiders builds are manually triggered and automatically tagged [#6083](https://github.com/sourcegraph/cody/pull/6083)
  - VSCode Insiders builds are now manually triggered, instead of nightly.
  - VSCode Insiders builds can be triggered on branches. We intend to produce these builds from release branches sometimes.
  - VSCode Insiders builds are tagged with `vscode-insiders-vN.N.NNNN`. This supports bisecting regressions in these builds.

#### Ci

- handle concurrency with github actions [#6798](https://github.com/sourcegraph/cody/pull/6798)
- fix reported branch name in BKA [#5202](https://github.com/sourcegraph/cody/pull/5202)
- moved playwright install command [#4545](https://github.com/sourcegraph/cody/pull/4545)

#### Client

- update display name for agentic model [#6827](https://github.com/sourcegraph/cody/pull/6827)

#### Cody

- Update CHANGELOG.md [#6468](https://github.com/sourcegraph/cody/pull/6468)

#### Deps

- update dependency stylelint to ^15.11.0 [#2119](https://github.com/sourcegraph/cody/pull/2119)
- update dependency @types/isomorphic-fetch to ^0.0.38 [#1587](https://github.com/sourcegraph/cody/pull/1587)
- update node.js to v18 [#519](https://github.com/sourcegraph/cody/pull/519)
- update react monorepo [#515](https://github.com/sourcegraph/cody/pull/515)
- update dependency prettier to v3 [#67](https://github.com/sourcegraph/cody/pull/67)
- update dependency typescript to ^5.1.6 [#65](https://github.com/sourcegraph/cody/pull/65)
- update pnpm to v8.6.7 [#62](https://github.com/sourcegraph/cody/pull/62)
- update dependency vite to ^4.4.3 [#61](https://github.com/sourcegraph/cody/pull/61)

#### Dev

- fix broken link in PR template [#4395](https://github.com/sourcegraph/cody/pull/4395)

#### Es

- fix cta typo [#6856](https://github.com/sourcegraph/cody/pull/6856)
- update CTAs and eligibility logic [#6803](https://github.com/sourcegraph/cody/pull/6803)

#### Marketing

- update listing description [#6862](https://github.com/sourcegraph/cody/pull/6862)

#### Onebox/Telemetry

- add `billingMetadata` [#6426](https://github.com/sourcegraph/cody/pull/6426)

#### Release

- Add support for milestone branch labels for backports [#6880](https://github.com/sourcegraph/cody/pull/6880)
- Give release scripts consistent names & some clean up [#6879](https://github.com/sourcegraph/cody/pull/6879)
- Bump package version and update changelog for 1.64 [#6876](https://github.com/sourcegraph/cody/pull/6876)
- Bump package version and update changelog for 1.62 [#6736](https://github.com/sourcegraph/cody/pull/6736)
- Bump package version and update changelog for 1.60 [#6666](https://github.com/sourcegraph/cody/pull/6666)
- Bump package version and update changelog for 1.58 [#6566](https://github.com/sourcegraph/cody/pull/6566)
- Bump package version and update changelog for 1.56 [#6503](https://github.com/sourcegraph/cody/pull/6503)
- Remove the changelog section from the PR template. [#6470](https://github.com/sourcegraph/cody/pull/6470)
- Bump package version and update changelog for 1.54 [#6466](https://github.com/sourcegraph/cody/pull/6466)
- Bump package version and update changelog for 1.52 [#6414](https://github.com/sourcegraph/cody/pull/6414)
- remove next pre-release branch and label creation [#6399](https://github.com/sourcegraph/cody/pull/6399)
- VSCode, bump package.json version to 1.50.0 and update release notes [#6312](https://github.com/sourcegraph/cody/pull/6312)
  - The vscode/scripts/changelog.sh script now correctly points to pull not pulls in the GitHub URLs.
- Update CHANGELOG for VSCode 1.48.0 [#6257](https://github.com/sourcegraph/cody/pull/6257)
  - chore/release: Prepare changelog for VSCode v1.48.0

#### Security

- Fix closed events for sast scan [#6512](https://github.com/sourcegraph/cody/pull/6512)

#### Telemetry

- remove legacy back-compat [#6265](https://github.com/sourcegraph/cody/pull/6265)

#### Vscode

- simplify test assertion [#4394](https://github.com/sourcegraph/cody/pull/4394)

#### Webview

- Fix webview-extension RPC logging to contain message payloads [#6671](https://github.com/sourcegraph/cody/pull/6671)

#### Webviews

- remove teams upgrade notice [#6651](https://github.com/sourcegraph/cody/pull/6651)

#### Others

- disable flaky test [#6783](https://github.com/sourcegraph/cody/pull/6783)
- Remove unused getSiteIdentification [#6336](https://github.com/sourcegraph/cody/pull/6336)
- Remove unused queries from 969 prototype and rename client [#5731](https://github.com/sourcegraph/cody/pull/5731)
- Fix incorrect changelog items [#5203](https://github.com/sourcegraph/cody/pull/5203)
- remove unused feature flags [#4857](https://github.com/sourcegraph/cody/pull/4857)
- Stop uploading indexes to k8s.sgdev.org [#4147](https://github.com/sourcegraph/cody/pull/4147)
- Add changelog for #4031 [#4074](https://github.com/sourcegraph/cody/pull/4074)
- upgrade to biome@1.7.2 [#3989](https://github.com/sourcegraph/cody/pull/3989)
- Bump dependencies [#3387](https://github.com/sourcegraph/cody/pull/3387)
- Simplify new-history-ui e2e test to deflake [#2147](https://github.com/sourcegraph/cody/pull/2147)
- Speed up at-file-selection e2e test [#2146](https://github.com/sourcegraph/cody/pull/2146)
- Bump up macOS e2e runner instance size [#2145](https://github.com/sourcegraph/cody/pull/2145)
- Add missing changelog entry [#1558](https://github.com/sourcegraph/cody/pull/1558)
- gitignore playwright failure recordings [#1557](https://github.com/sourcegraph/cody/pull/1557)

### Refactor

#### Agentic-Context

- update status messaging [#6670](https://github.com/sourcegraph/cody/pull/6670)
- rename experimental feature flags [#6644](https://github.com/sourcegraph/cody/pull/6644)

#### Deep-Cody

- show model to Pro users only [#6353](https://github.com/sourcegraph/cody/pull/6353)
- disable shell command context by default [#6279](https://github.com/sourcegraph/cody/pull/6279)

#### User-Menu

- improve display of user menu [#6389](https://github.com/sourcegraph/cody/pull/6389)

#### Webviews

- remove "Upgrade to Team" from context menu [#6621](https://github.com/sourcegraph/cody/pull/6621)

#### Others

- on AuthStatus sync [#4824](https://github.com/sourcegraph/cody/pull/4824)
- replace file mode with test mode in edit [#2952](https://github.com/sourcegraph/cody/pull/2952)
- commands [#2869](https://github.com/sourcegraph/cody/pull/2869)
- chat action command [#2784](https://github.com/sourcegraph/cody/pull/2784)
- convert fs paths to uris in test file utils [#2765](https://github.com/sourcegraph/cody/pull/2765)
- move commands for vsce out of lib [#2637](https://github.com/sourcegraph/cody/pull/2637)
- rename chat question events [#2613](https://github.com/sourcegraph/cody/pull/2613)
- rename .cody/.ignore to .cody/ignore [#2554](https://github.com/sourcegraph/cody/pull/2554)
- remove command inline mode [#2551](https://github.com/sourcegraph/cody/pull/2551)
- update recipe telemetry events and naming [#2538](https://github.com/sourcegraph/cody/pull/2538)
- remove old chat panel provider [#2528](https://github.com/sourcegraph/cody/pull/2528)
- update submit and stop buttons [#1782](https://github.com/sourcegraph/cody/pull/1782)
- add VSCodeEditorContext class [#1745](https://github.com/sourcegraph/cody/pull/1745)
- update context files display widget [#1706](https://github.com/sourcegraph/cody/pull/1706)
- move codeblock and workspace actions [#1695](https://github.com/sourcegraph/cody/pull/1695)
- add default prompt mixin to transcripts by default [#1479](https://github.com/sourcegraph/cody/pull/1479)
- update preamble rules and mixin [#1442](https://github.com/sourcegraph/cody/pull/1442)
- split min latency flags [#1351](https://github.com/sourcegraph/cody/pull/1351)
- add commands integration test file [#1329](https://github.com/sourcegraph/cody/pull/1329)
- change default prompts from JSON to Typescript [#1197](https://github.com/sourcegraph/cody/pull/1197)
- unify fixup and refactor commands&events [#1186](https://github.com/sourcegraph/cody/pull/1186)
- expand code action range [#1163](https://github.com/sourcegraph/cody/pull/1163)
- telemetry names for command events [#1134](https://github.com/sourcegraph/cody/pull/1134)
- simplify prefix code extraction for anthropic [#1117](https://github.com/sourcegraph/cody/pull/1117)
- remove starter and premade from cody.json [#939](https://github.com/sourcegraph/cody/pull/939)
- restructure custom commands menus [#571](https://github.com/sourcegraph/cody/pull/571)
- Restructure commands in .vscode/cody.json [#561](https://github.com/sourcegraph/cody/pull/561)
- replace recipes with commands [#386](https://github.com/sourcegraph/cody/pull/386)

### Reverts

- revert transcriptContainer change from pull/557 [#-1](https://github.com/sourcegraph/cody/pull/679)
- Revert "refactor: move commands away from recipe (#2542)" [#2542](https://github.com/sourcegraph/cody/pull/2575)

### Uncategorized

#### Others

- Fix problem with race between auth and config causing issues with models loading [#6886](https://github.com/sourcegraph/cody/pull/6886)
- Changes the default chat model in cody to DeepSeek-V3 but only once [#6882](https://github.com/sourcegraph/cody/pull/6882)
- Make Play Button stateful and remove intent toggle [#6833](https://github.com/sourcegraph/cody/pull/6833)
- Fix jetbrains recordings [#6821](https://github.com/sourcegraph/cody/pull/6821)
- Fix OpenTelemetryService initialization+observables code and  fix the span closure of Chat Spans [#6807](https://github.com/sourcegraph/cody/pull/6807)
- Fix typo in protocol.md [#6787](https://github.com/sourcegraph/cody/pull/6787)
- omnibox: open results locally if possible [#6781](https://github.com/sourcegraph/cody/pull/6781)
- mention menu: migrate from codicon to lucide [#6780](https://github.com/sourcegraph/cody/pull/6780)
- Fix intent telemetry [#6779](https://github.com/sourcegraph/cody/pull/6779)
- Update Cody Web 0.27.0 [#6760](https://github.com/sourcegraph/cody/pull/6760)
- disable omnibox on dotcom [#6755](https://github.com/sourcegraph/cody/pull/6755)
- Update Cody Web 0.26.0 [#6752](https://github.com/sourcegraph/cody/pull/6752)
- Disable Intent Detection if Code Search Disabled [#6750](https://github.com/sourcegraph/cody/pull/6750)
- Update Cody Web 0.25.0 [#6746](https://github.com/sourcegraph/cody/pull/6746)
- omnibox: add callout for results from other repos [#6732](https://github.com/sourcegraph/cody/pull/6732)
- Support endpoint param in auth flow (workspaces vscode sign-in flow) [#6730](https://github.com/sourcegraph/cody/pull/6730)
- fix(agentic chat): exclude deep-cody prompt for o1 models [#6725](https://github.com/sourcegraph/cody/pull/6725)
- More CSS updates [#6723](https://github.com/sourcegraph/cody/pull/6723)
- Naman/update cody web 0.24.0 [#6721](https://github.com/sourcegraph/cody/pull/6721)
- Update UI and fix intent bug [#6720](https://github.com/sourcegraph/cody/pull/6720)
- refactor(agentic chat): move into model dropdown [#6718](https://github.com/sourcegraph/cody/pull/6718)
- Update jetbrains recordings and build script [#6713](https://github.com/sourcegraph/cody/pull/6713)
- Release Omnibox: remove feature flag [#6710](https://github.com/sourcegraph/cody/pull/6710)
- omnibox: remove code search external link [#6706](https://github.com/sourcegraph/cody/pull/6706)
- omnibox: link file path to the line of the first match [#6705](https://github.com/sourcegraph/cody/pull/6705)
- Update Cody Web to 0.23.1 [#6693](https://github.com/sourcegraph/cody/pull/6693)
- Refactor external auth providers to re-generate headers on demand [#6687](https://github.com/sourcegraph/cody/pull/6687)
- Naman/new play button [#6685](https://github.com/sourcegraph/cody/pull/6685)
- Update Cody Web to 0.23.0 [#6683](https://github.com/sourcegraph/cody/pull/6683)
- Fix pointer cursor displaying on line numbers in search results [#6681](https://github.com/sourcegraph/cody/pull/6681)
- Fix: Changelog generator action frfr no cap [#6659](https://github.com/sourcegraph/cody/pull/6659)
- omnibox: add "Did you mean" notice [#6655](https://github.com/sourcegraph/cody/pull/6655)
- Fix missing current repo context in jetbrains [#6649](https://github.com/sourcegraph/cody/pull/6649)
- Fix: Can actually run the changelog github action [#6645](https://github.com/sourcegraph/cody/pull/6645)
- Improve reporting auth errors [#6639](https://github.com/sourcegraph/cody/pull/6639)
- Add disabled to recording modes [#6615](https://github.com/sourcegraph/cody/pull/6615)
- feat(agentic context): add agentic context component [#6598](https://github.com/sourcegraph/cody/pull/6598)
- refactor(agentic context): update agent context settings [#6596](https://github.com/sourcegraph/cody/pull/6596)
- NLS: escape backslashes in query string [#6585](https://github.com/sourcegraph/cody/pull/6585)
- feat(agentic chat): showing  error for toolbox settings status [#6579](https://github.com/sourcegraph/cody/pull/6579)
- Update Cody Web 0.22.0 [#6578](https://github.com/sourcegraph/cody/pull/6578)
- Implement showWindowsMessage in JetBrains [#6577](https://github.com/sourcegraph/cody/pull/6577)
- Allow to force usage of pre-defined endpoint [#6574](https://github.com/sourcegraph/cody/pull/6574)
- Make sure precomputed intent is not stale [#6572](https://github.com/sourcegraph/cody/pull/6572)
- Fix repo name resolver cache miss due to using separate RepoNameResol… [#6570](https://github.com/sourcegraph/cody/pull/6570)
- bench/context: Cache repo IDs [#6569](https://github.com/sourcegraph/cody/pull/6569)
- Pass query as 'content' in NLS bench [#6565](https://github.com/sourcegraph/cody/pull/6565)
- fix(agentic chat): update rate limit telemetry event to billable [#6562](https://github.com/sourcegraph/cody/pull/6562)
- Add NO_PROXY test that ensures dot prefixes are considered a wildcard [#6560](https://github.com/sourcegraph/cody/pull/6560)
- Fix Cody Web Search [#6559](https://github.com/sourcegraph/cody/pull/6559)
- Simplify jetbrains account management [#6558](https://github.com/sourcegraph/cody/pull/6558)
- Bench: add option to disable Polly [#6557](https://github.com/sourcegraph/cody/pull/6557)
- Network: respect NO_PROXY settings [#6555](https://github.com/sourcegraph/cody/pull/6555)
- Result Types & Repo Filter [#6546](https://github.com/sourcegraph/cody/pull/6546)
- Fix not working authorisation actions after previous one was cancelled [#6544](https://github.com/sourcegraph/cody/pull/6544)
- fix(Deep Cody): skip query rewrite for Deep Cody [#6539](https://github.com/sourcegraph/cody/pull/6539)
- Record telemetry when executing search [#6538](https://github.com/sourcegraph/cody/pull/6538)
- External Authentication Providers Support for Cody [#6526](https://github.com/sourcegraph/cody/pull/6526)
- suggestion mode UI [#6523](https://github.com/sourcegraph/cody/pull/6523)
- Update CHANGELOG.md versioning for 1.56 [#6522](https://github.com/sourcegraph/cody/pull/6522)
- Experimental proof-of-concept tool use in omnibox [#6510](https://github.com/sourcegraph/cody/pull/6510)
  - This is an experimental feature which we're not turning on or onboarding users to yet, so no changelog entry.
- storybook: add context items with sources for steps [#6505](https://github.com/sourcegraph/cody/pull/6505)
- Edit: Handle conflicting diff decorations [#6501](https://github.com/sourcegraph/cody/pull/6501)
- Add Cody bench command for NLS [#6497](https://github.com/sourcegraph/cody/pull/6497)
- Fix Ghost Text and CodeLens issue in Jetbrains [#6494](https://github.com/sourcegraph/cody/pull/6494)
- fix NonEmptyFirstMessage storybook [#6492](https://github.com/sourcegraph/cody/pull/6492)
- Fix failing kotlin protocol files generation [#6490](https://github.com/sourcegraph/cody/pull/6490)
- add more debug logs to inspect autoedits issue [#6476](https://github.com/sourcegraph/cody/pull/6476)
- Open remote files locally in VSCode [#6475](https://github.com/sourcegraph/cody/pull/6475)
- Decompose ChatController.sendChat into handlers for different request types [#6469](https://github.com/sourcegraph/cody/pull/6469)
- Fixing Css logic to correctly show rate limit banners in the correct place [#6464](https://github.com/sourcegraph/cody/pull/6464)
- Adding fixing save chat session overwriting [#6457](https://github.com/sourcegraph/cody/pull/6457)
- Add security considerations to prompt [#6456](https://github.com/sourcegraph/cody/pull/6456)
- autoedit: address dogfooding feedback [#6454](https://github.com/sourcegraph/cody/pull/6454)
- track notebook for auto-edits [#6449](https://github.com/sourcegraph/cody/pull/6449)
- Enable repo boost for inactive editor [#6443](https://github.com/sourcegraph/cody/pull/6443)
- include symbol matches in search results [#6441](https://github.com/sourcegraph/cody/pull/6441)
- autoedits e2e tests [#6425](https://github.com/sourcegraph/cody/pull/6425)
- Fix small screen filters panel opening & change sticky intent behaviour [#6420](https://github.com/sourcegraph/cody/pull/6420)
- Use omnibox ff for intent detector [#6419](https://github.com/sourcegraph/cody/pull/6419)
- Fixes paper cuts for Cody Web 0.20.0 cut [#6412](https://github.com/sourcegraph/cody/pull/6412)
- fix diff rendering for autoedits [#6410](https://github.com/sourcegraph/cody/pull/6410)
- autoedits disable shrink suffix logic [#6398](https://github.com/sourcegraph/cody/pull/6398)
- add heuristic to filter suggestion [#6396](https://github.com/sourcegraph/cody/pull/6396)
- Fix race issue for edit prompts in Cody JetBrains [#6384](https://github.com/sourcegraph/cody/pull/6384)
- Hitesh/heuristic recent edit based [#6383](https://github.com/sourcegraph/cody/pull/6383)
- Filters layout for Cody Web [#6382](https://github.com/sourcegraph/cody/pull/6382)
- autoedit: fix inline completion extraction when deletion [#6381](https://github.com/sourcegraph/cody/pull/6381)
- Add instance banners support [#6372](https://github.com/sourcegraph/cody/pull/6372)
- fix result count copy [#6371](https://github.com/sourcegraph/cody/pull/6371)
- chore/(telemetry): update `billingMetadata` [#6367](https://github.com/sourcegraph/cody/pull/6367)
- fix(deep-cody) Rate Limiter Reset Logic [#6366](https://github.com/sourcegraph/cody/pull/6366)
- Wait for auth status completion during agent initialisation [#6365](https://github.com/sourcegraph/cody/pull/6365)
  - After my recent changes `firstResultFromOperation(authStatus)` was waiting until auth status was set, but that auth status could be in `pendingValidation: true` state.We do not want that, we want to wait until it's either authenticated successfully or not.This PR is fixing that.
- Hitesh/use ds v2 autoedits [#6363](https://github.com/sourcegraph/cody/pull/6363)
- Remove deprecated CodyAgentServer.kt [#6361](https://github.com/sourcegraph/cody/pull/6361)
- Fix GitHub/GitLab brand capitalization [#6356](https://github.com/sourcegraph/cody/pull/6356)
- Fix tests on windows [#6348](https://github.com/sourcegraph/cody/pull/6348)
  -
- fix newline indentation as per finetuning data [#6333](https://github.com/sourcegraph/cody/pull/6333)
- Implement Search Filters for OneBox [#6329](https://github.com/sourcegraph/cody/pull/6329)
- Fix manual intent selection for onebox [#6324](https://github.com/sourcegraph/cody/pull/6324)
- map mentions to format expected by intent API [#6321](https://github.com/sourcegraph/cody/pull/6321)
- Implement more results and intent switcher [#6320](https://github.com/sourcegraph/cody/pull/6320)
- Fix jetbrains integration tests [#6314](https://github.com/sourcegraph/cody/pull/6314)
- refactor code with different folder for prompt and moving interface t… [#6309](https://github.com/sourcegraph/cody/pull/6309)
- Fix invalid range errors [#6306](https://github.com/sourcegraph/cody/pull/6306)
  - This PR make us more strict about where we trigger the autucomplete.
- fix(Deep Cody): show notices for Pro and Enterprise users [#6302](https://github.com/sourcegraph/cody/pull/6302)
- Double revert the PRs for distributed tracing to finally get them merged into the codebase [#6294](https://github.com/sourcegraph/cody/pull/6294)
- Migrate `testing/requestErrors` [#6293](https://github.com/sourcegraph/cody/pull/6293)
- Fix pollyjs recordings [#6289](https://github.com/sourcegraph/cody/pull/6289)
- Fix Edit Model Selection for Enterprise customers [#6286](https://github.com/sourcegraph/cody/pull/6286)
- fix line level aggregation logic for recent edits [#6282](https://github.com/sourcegraph/cody/pull/6282)
- VS Code: Release 1.48.1 [#6277](https://github.com/sourcegraph/cody/pull/6277)
- Improve prompting to prevent loading .env files [#6267](https://github.com/sourcegraph/cody/pull/6267)
- NLS search for OneBox [#6263](https://github.com/sourcegraph/cody/pull/6263)
- Deep Cody: enable for all Cody Pro users by default [#6255](https://github.com/sourcegraph/cody/pull/6255)
  - Deep Cody can be enabled on Sourcegraph Enterprise instance with the `deep-cody` feature flag.
    - Enable Deep Cody agent to execute terminal commands automatically for context:
      - Feature flag `deep-cody-shell-context` enabled on instance
      - User settings `cody.agentic.context` has `shell` set up for allow list.
- update `billingMetadata` for failed/disconnected type of events [#6254](https://github.com/sourcegraph/cody/pull/6254)
- Webviews: add new CTA for Sourcegraph Teams [#6245](https://github.com/sourcegraph/cody/pull/6245)
- Deep Cody: loading message for context fetching step [#6241](https://github.com/sourcegraph/cody/pull/6241)
- fix detecting the fireworks model [#6239](https://github.com/sourcegraph/cody/pull/6239)
- add completions support for autoedits [#6237](https://github.com/sourcegraph/cody/pull/6237)
- Update tracing for chat [#6230](https://github.com/sourcegraph/cody/pull/6230)
- Add separate command to run cody web in standalone mode [#6227](https://github.com/sourcegraph/cody/pull/6227)
- Fix prompt execution in existing chat [#6226](https://github.com/sourcegraph/cody/pull/6226)
- Add bundle size limits and tracking to Github CLI [#6222](https://github.com/sourcegraph/cody/pull/6222)
- use chat client for s2 [#6219](https://github.com/sourcegraph/cody/pull/6219)
- Improve release process with slack notifications and automated branching [#6218](https://github.com/sourcegraph/cody/pull/6218)
- Update changelog.sh instructions and add cody-core to backports [#6217](https://github.com/sourcegraph/cody/pull/6217)
- Deep Cody: remove setting user model preferences [#6211](https://github.com/sourcegraph/cody/pull/6211)
- suppress emission of characters on emacs keybindings [#6210](https://github.com/sourcegraph/cody/pull/6210)
- Webviews: add user menu and update avatar styles [#6209](https://github.com/sourcegraph/cody/pull/6209)
  - Add user menu to tab bar.
- Make signout as non-blocking as possible [#6207](https://github.com/sourcegraph/cody/pull/6207)
- remove last line in backport GHA [#6204](https://github.com/sourcegraph/cody/pull/6204)
- Add default value for 'search.useIgnoreFiles' in agent config [#6202](https://github.com/sourcegraph/cody/pull/6202)
- Deep Cody: Move shell context behind feature flag [#6199](https://github.com/sourcegraph/cody/pull/6199)
  - Deep Cody: Move shell context behind feature flag "deep-cody-shell-context".
- Auth: new enterprise sign-in flow and improve auth UI [#6198](https://github.com/sourcegraph/cody/pull/6198)
  - Webviews: The Sign-in page is now unified across clients through webview.
- VS Code: Release v1.46.0 [#6196](https://github.com/sourcegraph/cody/pull/6196)
- add changelog templating and tooling [#6195](https://github.com/sourcegraph/cody/pull/6195)
- Agent: set client environment based on client configuration info [#6194](https://github.com/sourcegraph/cody/pull/6194)
  - Agent: Add shell capability to enable agent shell process spawning.
- use local storage to save repo accessibility [#6193](https://github.com/sourcegraph/cody/pull/6193)
- Fixing Integrate OpenTelemetry tracing in Cody Webview PR 6100 [#6192](https://github.com/sourcegraph/cody/pull/6192)
- add 10 sec diff for autoedit experiments [#6191](https://github.com/sourcegraph/cody/pull/6191)
- Hitesh/add diff stratagies [#6190](https://github.com/sourcegraph/cody/pull/6190)
- Hitesh/add diff strategies logging [#6189](https://github.com/sourcegraph/cody/pull/6189)
- adding line level diff strategy for the recent edits diff calculation [#6188](https://github.com/sourcegraph/cody/pull/6188)
- do not block chat panel initialization or human message handling on current session save [#6186](https://github.com/sourcegraph/cody/pull/6186)
- Add built-in prompts related fields to prompt select analytic event [#6180](https://github.com/sourcegraph/cody/pull/6180)
- Adding Distributed Tracing and Smart Apply to cody [#6178](https://github.com/sourcegraph/cody/pull/6178)
- Add Sourcegraph CLI installation description to README.md [#6170](https://github.com/sourcegraph/cody/pull/6170)
  - This PR adds missing description.
- Bench: make sure to respect CODY_RECORDING_MODE [#6167](https://github.com/sourcegraph/cody/pull/6167)
- VS Code: Release v1.44.0 [#6165](https://github.com/sourcegraph/cody/pull/6165)
- Prompts Picker [#6160](https://github.com/sourcegraph/cody/pull/6160)
  - Adds quick pick for prompts with `alt+p` shortcut.
- Add account switcher component in the Accounts webview tab [#6159](https://github.com/sourcegraph/cody/pull/6159)
- only activate autoedits command when experimental setting is enabled [#6157](https://github.com/sourcegraph/cody/pull/6157)
- fix added lines sorting in autoedits [#6155](https://github.com/sourcegraph/cody/pull/6155)
- Fix various JetBrains styling issues [#6153](https://github.com/sourcegraph/cody/pull/6153)
- Fetch standard prompts from remote prompts API [#6150](https://github.com/sourcegraph/cody/pull/6150)
- remove ctrl+shift+L shortcut and update shift+alt+L shortcut [#6148](https://github.com/sourcegraph/cody/pull/6148)
- patch highlight.js to address memory leak [#6146](https://github.com/sourcegraph/cody/pull/6146)
- autoedit: Add feature flag to enable/disable autoedit feature [#6145](https://github.com/sourcegraph/cody/pull/6145)
- Simplify protocol's TelemetryEvent [#6144](https://github.com/sourcegraph/cody/pull/6144)
- Chat: ensure ScrollDown button only takes it's width [#6143](https://github.com/sourcegraph/cody/pull/6143)
  - Chat: ensure ScrollDown button only takes it's width allowing the interaction with other elements
- Autoedits Context Improvements [#6141](https://github.com/sourcegraph/cody/pull/6141)
- Cody Web: Polish cody web Prompts [#6135](https://github.com/sourcegraph/cody/pull/6135)
- Use font size variable providd by JetBrains in webview [#6134](https://github.com/sourcegraph/cody/pull/6134)
- Better rendering for auto edits [#6132](https://github.com/sourcegraph/cody/pull/6132)
- autoedit: add speculative decoding [#6130](https://github.com/sourcegraph/cody/pull/6130)
  - autoedits: Enable speculative decoding.
- add 1.40 changelog items [#6129](https://github.com/sourcegraph/cody/pull/6129)
- Fix prompt name generation during prompts/commands migration [#6126](https://github.com/sourcegraph/cody/pull/6126)
- VS Code: Release v1.42.0 [#6122](https://github.com/sourcegraph/cody/pull/6122)
- fix rendering issue on the same line for ghost text [#6120](https://github.com/sourcegraph/cody/pull/6120)
- Cody Chat: fixed missing syntax highlighting of CSharp files and load only one copy of highlight.js in the WebView build [#6118](https://github.com/sourcegraph/cody/pull/6118)
  - Cody Chat: fixed missing syntax highlighting of CSharp files and load only one copy of highlight.js in the WebView build
- Chat: context cell improvements [#6115](https://github.com/sourcegraph/cody/pull/6115)
- chat input: '@' -> '@ Context' toolbar button [#6114](https://github.com/sourcegraph/cody/pull/6114)
- Remove old test renderer [#6113](https://github.com/sourcegraph/cody/pull/6113)
- Trigger autoedit on the cursor movements [#6112](https://github.com/sourcegraph/cody/pull/6112)
- Edit: prep for the gpt-4o-mini edit a/b test [#6110](https://github.com/sourcegraph/cody/pull/6110)
- Add a command for testing auto-edit examples [#6108](https://github.com/sourcegraph/cody/pull/6108)
- Fail hard on errors in input context bench CSV, remove unused column [#6107](https://github.com/sourcegraph/cody/pull/6107)
- fix indentation issue [#6103](https://github.com/sourcegraph/cody/pull/6103)
- Network: CA Cert loading fixes [#6101](https://github.com/sourcegraph/cody/pull/6101)
- Fix for VSCode Marketplace description getting cut-off [#6098](https://github.com/sourcegraph/cody/pull/6098)
- Edit: collect more analytics data [#6095](https://github.com/sourcegraph/cody/pull/6095)
  - Edit: added latency and document language to the analytics event metadata.
- Agent: disable the flaky edit test [#6093](https://github.com/sourcegraph/cody/pull/6093)
- Command bench modify [#6087](https://github.com/sourcegraph/cody/pull/6087)
- Fix issue with merging configs [#6084](https://github.com/sourcegraph/cody/pull/6084)
- Deep Cody: skip query rewrite for search tool [#6082](https://github.com/sourcegraph/cody/pull/6082)
- Cody Web: Add support running prompts from consumer [#6081](https://github.com/sourcegraph/cody/pull/6081)
- VS Code: point releases to `./vscode/changelog.md` [#6080](https://github.com/sourcegraph/cody/pull/6080)
- Deep Cody: remove TOOL context item after review [#6079](https://github.com/sourcegraph/cody/pull/6079)
- Add Deep Cody back to model list, revert button change [#6077](https://github.com/sourcegraph/cody/pull/6077)
- Fix configuration inspect method [#6075](https://github.com/sourcegraph/cody/pull/6075)
- Ensure CompletionBookkeepingEvent timestamps are not floating point [#6073](https://github.com/sourcegraph/cody/pull/6073)
- Autocomplete: remove the extended language pool option [#6072](https://github.com/sourcegraph/cody/pull/6072)
- fix recent edits context source [#6071](https://github.com/sourcegraph/cody/pull/6071)
- Improve Cody logging agent protocol [#6069](https://github.com/sourcegraph/cody/pull/6069)
- Autocomplete: add characters logger metadata to `accepted` events [#6068](https://github.com/sourcegraph/cody/pull/6068)
- Deep Cody: Allow toggle in UI & implement CodyChatMemory [#6066](https://github.com/sourcegraph/cody/pull/6066)
- Context: make error message more concise [#6065](https://github.com/sourcegraph/cody/pull/6065)
- VS Code: Release v1.40.2 [#6062](https://github.com/sourcegraph/cody/pull/6062)
- prevent double-adding selected context [#6059](https://github.com/sourcegraph/cody/pull/6059)
- Fix bugs in workspace::getConfiguration vscode shim [#6058](https://github.com/sourcegraph/cody/pull/6058)
- Chat: E2E tests for chat PCW events. [#6057](https://github.com/sourcegraph/cody/pull/6057)
- Run prompts migration only over local user commands [#6056](https://github.com/sourcegraph/cody/pull/6056)
- update insider cron schedule to MWF @ 1500 UTC [#6052](https://github.com/sourcegraph/cody/pull/6052)
- VS Code: Release v1.40.1 [#6051](https://github.com/sourcegraph/cody/pull/6051)
- Auth: UI conditional rendering logic [#6047](https://github.com/sourcegraph/cody/pull/6047)
- Update marketplace description [#6046](https://github.com/sourcegraph/cody/pull/6046)
- Fix OpenCtx include initial context integeration. [#6045](https://github.com/sourcegraph/cody/pull/6045)
- Autocomplete: enable completions preloading on cursor movement [#6043](https://github.com/sourcegraph/cody/pull/6043)
  - Autocomplete: Enabled completion completions preloading on cursor movement.
- Change nested configuration object handling to match VSCode behavior. [#6041](https://github.com/sourcegraph/cody/pull/6041)
- Autocomplete: deflake hot-streak tests [#6040](https://github.com/sourcegraph/cody/pull/6040)
- Autocomplete: cleanup the fast-path a/b test [#6039](https://github.com/sourcegraph/cody/pull/6039)
- Network: Fallback to CODY_NODE_TLS_REJECT_UNAUTHORIZED for cert auth [#6037](https://github.com/sourcegraph/cody/pull/6037)
- Fix Prompts welcome screen initial state [#6036](https://github.com/sourcegraph/cody/pull/6036)
- Remove repo chip from default context (feature flagged) [#6034](https://github.com/sourcegraph/cody/pull/6034)
- VS Code: Release v1.40.0 [#6032](https://github.com/sourcegraph/cody/pull/6032)
- Change tip text to reflect new key command [#6030](https://github.com/sourcegraph/cody/pull/6030)
- Fix support for merging multiple nested objects [#6029](https://github.com/sourcegraph/cody/pull/6029)
- Add new custom configuration field which supports dotted names [#6027](https://github.com/sourcegraph/cody/pull/6027)
- add code llama model for the a/b test [#6022](https://github.com/sourcegraph/cody/pull/6022)
- VS Code: add characters logger metadata to chat code-gen events [#6019](https://github.com/sourcegraph/cody/pull/6019)
- Add shortcut for recently used prompts [#6016](https://github.com/sourcegraph/cody/pull/6016)
- Don't select first prompt by default [#6015](https://github.com/sourcegraph/cody/pull/6015)
- Use simplified token counting method in case of the big files [#6014](https://github.com/sourcegraph/cody/pull/6014)
- bump openctx to incorporate HTTP provider invocation [#6010](https://github.com/sourcegraph/cody/pull/6010)
- VS Code: add characters logger stats to `fixup.apply:succeeded` events [#6009](https://github.com/sourcegraph/cody/pull/6009)
- Promisify PromptEditorRefAPI [#6006](https://github.com/sourcegraph/cody/pull/6006)
- Fix inline-edit prompts chat building [#6003](https://github.com/sourcegraph/cody/pull/6003)
- VS Code: Release v1.38.3 [#5999](https://github.com/sourcegraph/cody/pull/5999)
- Autocomplete: fix the fast-path feature flag [#5998](https://github.com/sourcegraph/cody/pull/5998)
- Agent: add window state notification [#5997](https://github.com/sourcegraph/cody/pull/5997)
- Support promoted prompts [#5996](https://github.com/sourcegraph/cody/pull/5996)
  - Add support for promoted prompts. Now the welcome area prompts section shows only out-of-the-box prompts and promoted prompts
- Remove onKeyPress on AccordionTrigger [#5993](https://github.com/sourcegraph/cody/pull/5993)
- Add more detailed results to context benchmark [#5992](https://github.com/sourcegraph/cody/pull/5992)
- Reset editor intent on new chat and empty editor value [#5991](https://github.com/sourcegraph/cody/pull/5991)
-  "Explain command" in context (existing conversation) [#5986](https://github.com/sourcegraph/cody/pull/5986)
  - When I use “explain command”, no longer opens a new chat session. Instead, it sends it to the active chat session.This is a revised version of #5698.
- fix(Blank Screen): Improve UTF-16 character handling in Typewriter class [#5982](https://github.com/sourcegraph/cody/pull/5982)
- Capitalize provider names in tool tips [#5981](https://github.com/sourcegraph/cody/pull/5981)
- VS Code: fix repo name resolution cache [#5978](https://github.com/sourcegraph/cody/pull/5978)
  - Context Filters: fixed repo name resolution cache.
- Prepare cody web 0.10.0 release [#5977](https://github.com/sourcegraph/cody/pull/5977)
- Deep Cody: update model to Claude 3.5 Sonnet Latest [#5975](https://github.com/sourcegraph/cody/pull/5975)
- Fix issues with incorrect serialization of LocalStorageDB items [#5969](https://github.com/sourcegraph/cody/pull/5969)
- Enable manually editing search context [#5965](https://github.com/sourcegraph/cody/pull/5965)
- remove empty title key in template [#5964](https://github.com/sourcegraph/cody/pull/5964)
- improve bug template [#5962](https://github.com/sourcegraph/cody/pull/5962)
- add `isCommand` to `cody.chat-question` event metadata [#5959](https://github.com/sourcegraph/cody/pull/5959)
- Implement edit/insert prompts [#5958](https://github.com/sourcegraph/cody/pull/5958)
  - Add ability to execute prompts to perform edits or insert code.
- Removing deprecated code for the delays introduced for low perf languages [#5957](https://github.com/sourcegraph/cody/pull/5957)
- Hitesh/autoedits improvements [#5956](https://github.com/sourcegraph/cody/pull/5956)
- Add prompts migration API [#5954](https://github.com/sourcegraph/cody/pull/5954)
- Chat: brought back syntax highlighting for most common languages [#5953](https://github.com/sourcegraph/cody/pull/5953)
  - Chat: brought back syntax highlighting for most common languages
- VS Code: Release v1.38.2 [#5951](https://github.com/sourcegraph/cody/pull/5951)
- DeepCody: new model UI group [#5950](https://github.com/sourcegraph/cody/pull/5950)
- fix storybook build [#5949](https://github.com/sourcegraph/cody/pull/5949)
- Temporarily remove switch account button [#5944](https://github.com/sourcegraph/cody/pull/5944)
- docs: Add a style section to ARCHITECTURE.md [#5943](https://github.com/sourcegraph/cody/pull/5943)
  - There are now some style guidelines in ARCHITECTURE.md.
- Fix VSCode CHANGELOG after merge [#5938](https://github.com/sourcegraph/cody/pull/5938)
- add repo/cody to labeler [#5937](https://github.com/sourcegraph/cody/pull/5937)
- VS Code: log more data from characters logger [#5931](https://github.com/sourcegraph/cody/pull/5931)
- Update `cody.chat-question/executed` billingMetadata [#5926](https://github.com/sourcegraph/cody/pull/5926)
- Move all feedback to community forum [#5923](https://github.com/sourcegraph/cody/pull/5923)
- remove PRD templates [#5919](https://github.com/sourcegraph/cody/pull/5919)
- Add setContext notification for cody.serverEndpoint [#5918](https://github.com/sourcegraph/cody/pull/5918)
- Networking: Fix leftover PR comments [#5916](https://github.com/sourcegraph/cody/pull/5916)
- update changelog link in release note automation [#5909](https://github.com/sourcegraph/cody/pull/5909)
- Agent: fix avatar in account tab [#5908](https://github.com/sourcegraph/cody/pull/5908)
- VS Code: Release v1.38.1 [#5906](https://github.com/sourcegraph/cody/pull/5906)
- Autocomplete: a/b test the fast-path [#5905](https://github.com/sourcegraph/cody/pull/5905)
- Deep Cody: support OpenCtx [#5903](https://github.com/sourcegraph/cody/pull/5903)
- Chat: Display 'other' model category [#5902](https://github.com/sourcegraph/cody/pull/5902)
- VS Code: Release v1.38.0 [#5899](https://github.com/sourcegraph/cody/pull/5899)
- Network: add more default HTTP headers [#5897](https://github.com/sourcegraph/cody/pull/5897)
- CLI: add `cody models list` command [#5896](https://github.com/sourcegraph/cody/pull/5896)
- Add support for generic mentions in prompt messages [#5895](https://github.com/sourcegraph/cody/pull/5895)
- different agentIDE for Cody Web vs. this repo's standalone web/ [#5890](https://github.com/sourcegraph/cody/pull/5890)
- expose agent capabilities in global clientCapabilities() [#5889](https://github.com/sourcegraph/cody/pull/5889)
- Swap out visibility-sensor for react-intersection-observer [#5888](https://github.com/sourcegraph/cody/pull/5888)
- Fix errors in cody web [#5886](https://github.com/sourcegraph/cody/pull/5886)
- allow undefined chat/edit preinstructions, read from global config [#5885](https://github.com/sourcegraph/cody/pull/5885)
- support forceHydration on PromptString [#5884](https://github.com/sourcegraph/cody/pull/5884)
- Network: More Reliable Cody Networking & Proxy Support [#5883](https://github.com/sourcegraph/cody/pull/5883)
- Update README.md and VSC Marketplace [#5882](https://github.com/sourcegraph/cody/pull/5882)
- move enterprise, improve svg [#5881](https://github.com/sourcegraph/cody/pull/5881)
- Chat: optimize rendering bot message [#5879](https://github.com/sourcegraph/cody/pull/5879)
- Corrected parsing logic for essentialContext [#5878](https://github.com/sourcegraph/cody/pull/5878)
- Improve edit task and smart apply destination file path computation [#5877](https://github.com/sourcegraph/cody/pull/5877)
- Autocomplete: remove the `experimental-openaicompatible` provider [#5872](https://github.com/sourcegraph/cody/pull/5872)
  - Autocomplete: Remove support for the deprecated `experimental-openaicompatible` provider. Use `openaicompatible` instead. [pull/5872](https://github.com/sourcegraph/cody/pull/5872)
- Autocomplete: keep the original insert range for agent `autocomplete/execute` calls [#5871](https://github.com/sourcegraph/cody/pull/5871)
  - Autocomplete: the agent no longer adjusts the insert text range in a VS Code-specific way.
- Chat: use memoized chat models in AssistantMessageCell [#5870](https://github.com/sourcegraph/cody/pull/5870)
- Chat: use memoized models props in HumanMessageEditor [#5867](https://github.com/sourcegraph/cody/pull/5867)
  - Chat: Fix performance issue with Chat webview.
- Chat: move chatModels observable creation to top level [#5866](https://github.com/sourcegraph/cody/pull/5866)
  - Chat: tbc
- Fix prompt input and browse prompts UI  [#5863](https://github.com/sourcegraph/cody/pull/5863)
- Adding more checks for absolute paths while generating new files with smart Apply [#5862](https://github.com/sourcegraph/cody/pull/5862)
- Update NativeWebview title only if the title changes [#5861](https://github.com/sourcegraph/cody/pull/5861)
- Chat: update range and source fields for priority context item [#5860](https://github.com/sourcegraph/cody/pull/5860)
  - Chat: handle duplicated priority context properly.
- Chat: fix waitlist check on model sync [#5859](https://github.com/sourcegraph/cody/pull/5859)
- Include draft prompts for viewer [#5856](https://github.com/sourcegraph/cody/pull/5856)
  - List viewer's draft prompts in the Prompts Library.
- VS Code: improve characters logger [#5855](https://github.com/sourcegraph/cody/pull/5855)
- Add context item to chat action [#5852](https://github.com/sourcegraph/cody/pull/5852)
- Fix Cody Chat UI rendering reconciliation [#5850](https://github.com/sourcegraph/cody/pull/5850)
- fix bug in cody bench [#5849](https://github.com/sourcegraph/cody/pull/5849)
- Fix last used prompts ordering [#5848](https://github.com/sourcegraph/cody/pull/5848)
- adding autoedits support [#5845](https://github.com/sourcegraph/cody/pull/5845)
- Autocomplete: improve output channel logger [#5840](https://github.com/sourcegraph/cody/pull/5840)
- Chat: update logic to select Deep Cody as default model when available [#5839](https://github.com/sourcegraph/cody/pull/5839)
- Fix chat message intent serialization [#5838](https://github.com/sourcegraph/cody/pull/5838)
- Visual Studio: update at-mention token colors [#5837](https://github.com/sourcegraph/cody/pull/5837)
- VS Code: Release 1.36.3 [#5836](https://github.com/sourcegraph/cody/pull/5836)
- Record promptText for S2 [#5835](https://github.com/sourcegraph/cody/pull/5835)
- Autocomplete: rename logger to analytics logger [#5834](https://github.com/sourcegraph/cody/pull/5834)
- Autocomplete: assert provider config and request params on S2 [#5833](https://github.com/sourcegraph/cody/pull/5833)
- Agent: remove Cody Ignore agent tests [#5832](https://github.com/sourcegraph/cody/pull/5832)
- Autocomplete: context filters autocomplete agent tests [#5831](https://github.com/sourcegraph/cody/pull/5831)
- extract ChatController.sendChat [#5829](https://github.com/sourcegraph/cody/pull/5829)
- fix agent tests model preferences state [#5828](https://github.com/sourcegraph/cody/pull/5828)
- remove unused chat/restore agent method [#5827](https://github.com/sourcegraph/cody/pull/5827)
- default vitest unit test timeout of 500ms [#5826](https://github.com/sourcegraph/cody/pull/5826)
- add ChatController tests for sending, followups, editing, and errors [#5825](https://github.com/sourcegraph/cody/pull/5825)
- do not block on getting the site version or is-cody-enabled during auth [#5823](https://github.com/sourcegraph/cody/pull/5823)
- do not block on fetching the user's Cody Pro subscription status when authing [#5822](https://github.com/sourcegraph/cody/pull/5822)
- DeepCody: Enhance error handling for disallowed shell commands [#5818](https://github.com/sourcegraph/cody/pull/5818)
- DeepCody: clean up and fix stream [#5815](https://github.com/sourcegraph/cody/pull/5815)
- use the current document to track range for persistence [#5812](https://github.com/sourcegraph/cody/pull/5812)
- Fix styling of avatar component when no avatarURL is present [#5811](https://github.com/sourcegraph/cody/pull/5811)
  - Fixes a bug where avatar's were stretching to fit the content of the alt text instead of remaining a static size.
- show notice to remind Sourcegraphers to dogfood s2 not dotcom [#5810](https://github.com/sourcegraph/cody/pull/5810)
- Chat: Fix hanging issue in repository name resolution for workspaces [#5808](https://github.com/sourcegraph/cody/pull/5808)
  - Chat: Fix an issue in repository name resolution for workspaces that caused Chat to hang.
- VS Code: Release 1.36.2 [#5807](https://github.com/sourcegraph/cody/pull/5807)
- change feature flag names [#5805](https://github.com/sourcegraph/cody/pull/5805)
- Send info if model is available together with the model [#5804](https://github.com/sourcegraph/cody/pull/5804)
- Autocomplete: fix `authStatus` mocks in provider tests [#5803](https://github.com/sourcegraph/cody/pull/5803)
- do not block on CodyLLMSiteConfiguration (configOverwrites) fetch in initial auth [#5799](https://github.com/sourcegraph/cody/pull/5799)
  - Made authentication faster and less prone to network instability by reducing the number of HTTP requests needed for authentication.
- use local cache instead of localStorage to get repo status [#5798](https://github.com/sourcegraph/cody/pull/5798)
  - Fixes the vscode slowness issue when completions is turned on.
- improve auth-related logging and abort/timeout handling [#5796](https://github.com/sourcegraph/cody/pull/5796)
- Fix exported types conflicting with agent protocol [#5794](https://github.com/sourcegraph/cody/pull/5794)
- remove ChatSubmitType user-newchat [#5792](https://github.com/sourcegraph/cody/pull/5792)
- higher default timeout than 6s [#5789](https://github.com/sourcegraph/cody/pull/5789)
- never minify agent [#5785](https://github.com/sourcegraph/cody/pull/5785)
- Autocomplete: re-enable agent tests [#5784](https://github.com/sourcegraph/cody/pull/5784)
- VS Code: Release v1.36.0 [#5781](https://github.com/sourcegraph/cody/pull/5781)
  - VS Code: Release v1.36.0
- Add browse library link to prompt popover [#5779](https://github.com/sourcegraph/cody/pull/5779)
- Reduce padding of container around search input. [#5778](https://github.com/sourcegraph/cody/pull/5778)
- Add new footer design to welcome screen [#5777](https://github.com/sourcegraph/cody/pull/5777)
- Fix prompts button layout on welcome screen [#5776](https://github.com/sourcegraph/cody/pull/5776)
- Add a CI workflow that builds the JetBrains plugin as an FYI [#5773](https://github.com/sourcegraph/cody/pull/5773)
- Update Prompts UI (enhanced with client last used action sorting) [#5772](https://github.com/sourcegraph/cody/pull/5772)
- Rename onebox telemetry metadata fields [#5770](https://github.com/sourcegraph/cody/pull/5770)
- Command: register missing commands when unifiedPrompts is enabled [#5768](https://github.com/sourcegraph/cody/pull/5768)
  - Command: Fixed an issue where some commands (`Auto-Edit` and `Cody Explain Terminal Output`) were not registered when the unified prompt feature flag is enabled.
- use the accurate docContext and persist repo visibility using local storage [#5767](https://github.com/sourcegraph/cody/pull/5767)
- Unified prompts: Return inline documentation command [#5764](https://github.com/sourcegraph/cody/pull/5764)
- Chat: show loading state during codebase context retrieval [#5761](https://github.com/sourcegraph/cody/pull/5761)
  - Chat: Display the correct loading state during codebase context retrieval instead of 0 item by default.
- add(chat): Alt+l adds current selection to chat [#5760](https://github.com/sourcegraph/cody/pull/5760)
  - "Alt-L" will add the current text selection to a continued conversation
- Pass intent scores to telemetry [#5758](https://github.com/sourcegraph/cody/pull/5758)
- Status Bar: Observable Migration [#5757](https://github.com/sourcegraph/cody/pull/5757)
- Remove automatically generated Tokens to reduce redundant tokens [#5756](https://github.com/sourcegraph/cody/pull/5756)
- Update One Box Code Snippets UI [#5753](https://github.com/sourcegraph/cody/pull/5753)
- centralize accessing the agentIDE and related values [#5750](https://github.com/sourcegraph/cody/pull/5750)
- rm unneeded ChatEnvironmentContext [#5749](https://github.com/sourcegraph/cody/pull/5749)
- consolidate sign-in forms and use standard tailwind styles [#5746](https://github.com/sourcegraph/cody/pull/5746)
- remove unused, needless transcript-errors/isTranscriptError [#5742](https://github.com/sourcegraph/cody/pull/5742)
- pass chat history to webview using webviewAPI, not old postMessage protocol [#5741](https://github.com/sourcegraph/cody/pull/5741)
- remove unused webview protocol messages [#5740](https://github.com/sourcegraph/cody/pull/5740)
- fix Cody Web issue with @-mention menu appearing behind tabs bar [#5739](https://github.com/sourcegraph/cody/pull/5739)
- E2E: fix flanky mention-repo test [#5738](https://github.com/sourcegraph/cody/pull/5738)
- Auth: Update separator label for endpoint history [#5737](https://github.com/sourcegraph/cody/pull/5737)
- improved StateDebugView [#5736](https://github.com/sourcegraph/cody/pull/5736)
- allow agent to initialize when no access token is provided [#5734](https://github.com/sourcegraph/cody/pull/5734)
- Agent: fix auth referral code mapping across client and server [#5733](https://github.com/sourcegraph/cody/pull/5733)
  - Agent: fix auth referral code mapping across client and server
- add tests to detect observable subscription leaks [#5730](https://github.com/sourcegraph/cody/pull/5730)
- Autocomplete: reuse `generateCompletions` across providers [#5729](https://github.com/sourcegraph/cody/pull/5729)
- Edit: use consistent model provider icon mapping [#5728](https://github.com/sourcegraph/cody/pull/5728)
- Autocomplete: clean up autocomplete provider tests [#5727](https://github.com/sourcegraph/cody/pull/5727)
- Autocomplete: add `fireworks` provider tests [#5726](https://github.com/sourcegraph/cody/pull/5726)
- Add matched range matches to context files [#5724](https://github.com/sourcegraph/cody/pull/5724)
- Improve chat context eval runner [#5722](https://github.com/sourcegraph/cody/pull/5722)
- remove unused code [#5721](https://github.com/sourcegraph/cody/pull/5721)
- Agent: remove deprecated unit test command [#5718](https://github.com/sourcegraph/cody/pull/5718)
- simplify repo name->ID mapping [#5717](https://github.com/sourcegraph/cody/pull/5717)
- StateDebugOverlay debug helper for seeing state values in the webview [#5716](https://github.com/sourcegraph/cody/pull/5716)
- fix explicitly selected model on new chat is not reset on account switch [#5715](https://github.com/sourcegraph/cody/pull/5715)
- Fix auth flashes [#5710](https://github.com/sourcegraph/cody/pull/5710)
- Fix switching accounts auth problem [#5709](https://github.com/sourcegraph/cody/pull/5709)
- Custom Commands: initialize in VSCode only [#5708](https://github.com/sourcegraph/cody/pull/5708)
- switch to chat tab when clicking New Chat from another tab [#5707](https://github.com/sourcegraph/cody/pull/5707)
  - Fixes an issue where the "New Chat" button would not take you to the chat tab with your new chat.
- fix storybook [#5706](https://github.com/sourcegraph/cody/pull/5706)
- do not show phantom OpenCtx editor status bar item [#5705](https://github.com/sourcegraph/cody/pull/5705)
- reset repo name->ID mapping when switching accounts [#5704](https://github.com/sourcegraph/cody/pull/5704)
- do not update ClientConfig when the editor is in the background [#5703](https://github.com/sourcegraph/cody/pull/5703)
- make clientStateBroadcaster use observables [#5702](https://github.com/sourcegraph/cody/pull/5702)
- `Cody: Refresh Settings (Debug)` helper action [#5701](https://github.com/sourcegraph/cody/pull/5701)
- Agent: update access token for integration tests [#5697](https://github.com/sourcegraph/cody/pull/5697)
- remove local embeddings for self-serve [#5696](https://github.com/sourcegraph/cody/pull/5696)
- treat ChatBuilder (nee ChatModel) as having minimal state [#5695](https://github.com/sourcegraph/cody/pull/5695)
- remove "enhanced context" concept [#5694](https://github.com/sourcegraph/cody/pull/5694)
- remove unused BFG retriever [#5692](https://github.com/sourcegraph/cody/pull/5692)
- Remove the random "0" on the UI (after the context accordion) [#5691](https://github.com/sourcegraph/cody/pull/5691)
- Add a way to update agent recordings on Windows [#5690](https://github.com/sourcegraph/cody/pull/5690)
- add auth and account switching agent tests [#5689](https://github.com/sourcegraph/cody/pull/5689)
- Deep Cody [#5687](https://github.com/sourcegraph/cody/pull/5687)
  - Internal: Deep Cody model available for internal dogfooding.
- add context logging for autoedits [#5686](https://github.com/sourcegraph/cody/pull/5686)
- Chat: add ability to execute terminal commands from chat [#5684](https://github.com/sourcegraph/cody/pull/5684)
  - Chat: add ability to execute terminal commands from chat interface.
- PLG: use server-side models [#5683](https://github.com/sourcegraph/cody/pull/5683)
  - Use server side model config
- Bump Cody Web version 0.9.0 [#5681](https://github.com/sourcegraph/cody/pull/5681)
- remove RemoteSearch [#5679](https://github.com/sourcegraph/cody/pull/5679)
- Enterprise: expand smart context window for all Claude Sonnet models [#5677](https://github.com/sourcegraph/cody/pull/5677)
  - Enterprise: Smart context window is now correctly set for all Claude Sonnet models configured on the server side. [pull/5677](https://github.com/sourcegraph/cody/pull/5677)
- watch feature flags instead of calling evaluateFeatureFlag (which is non-reactive) [#5676](https://github.com/sourcegraph/cody/pull/5676)
- Add intent telemetry [#5675](https://github.com/sourcegraph/cody/pull/5675)
- make unified prompts feature flag reactive [#5672](https://github.com/sourcegraph/cody/pull/5672)
- Autocomplete: add `anthropic` provider tests [#5671](https://github.com/sourcegraph/cody/pull/5671)
- Autocomplete: add `google` provider tests [#5670](https://github.com/sourcegraph/cody/pull/5670)
- Autocomplete: add `experimental-openaicompatible` provider tests [#5669](https://github.com/sourcegraph/cody/pull/5669)
- prettier rendering of context items [#5668](https://github.com/sourcegraph/cody/pull/5668)
- fix storybook build (`pnpm -C web dev`) [#5667](https://github.com/sourcegraph/cody/pull/5667)
- Do not show an LLM response when we trigger a code search [#5662](https://github.com/sourcegraph/cody/pull/5662)
- deflake "chat input focus" e2e test [#5660](https://github.com/sourcegraph/cody/pull/5660)
- handle no models available in CodySourceControl [#5659](https://github.com/sourcegraph/cody/pull/5659)
- remove 2 unintentional or noisy dev console logs [#5658](https://github.com/sourcegraph/cody/pull/5658)
- disable fetching Ollama models during vitest unit testing to avoid nondeterminism [#5657](https://github.com/sourcegraph/cody/pull/5657)
- move ClientConfigSingleton to separate file [#5656](https://github.com/sourcegraph/cody/pull/5656)
- single-flighting and unit test for ClientConfigSingleton [#5652](https://github.com/sourcegraph/cody/pull/5652)
- do not even instantiate LocalEmbeddingsController for non-dotcom [#5651](https://github.com/sourcegraph/cody/pull/5651)
- make readValuesFrom readonly to avoid misuse [#5649](https://github.com/sourcegraph/cody/pull/5649)
- use lodash individual imports for better tree-shaking, smaller bundles [#5648](https://github.com/sourcegraph/cody/pull/5648)
- deflake Cody Context Filters test [#5647](https://github.com/sourcegraph/cody/pull/5647)
- move ModelsService to its own file and use a plain interface for Model [#5646](https://github.com/sourcegraph/cody/pull/5646)
- bump openctx for quieter provider errors [#5644](https://github.com/sourcegraph/cody/pull/5644)
- Small improvements to cody bench context [#5641](https://github.com/sourcegraph/cody/pull/5641)
- When there are 0 items in the context, instead of saying "0 items", it should say "fetching..." [#5640](https://github.com/sourcegraph/cody/pull/5640)
- fix auth issues [#5638](https://github.com/sourcegraph/cody/pull/5638)
- skip flaky symf parallel downloads test [#5636](https://github.com/sourcegraph/cody/pull/5636)
- Refactor onebox experimental flag [#5630](https://github.com/sourcegraph/cody/pull/5630)
  - None.
- Agent: update access token for integration tests [#5629](https://github.com/sourcegraph/cody/pull/5629)
- Chat: prevent Claude 3.5 Sonnet model from apologizing constantly [#5628](https://github.com/sourcegraph/cody/pull/5628)
- Fix cody bench and add eval strategy for chat context [#5624](https://github.com/sourcegraph/cody/pull/5624)
- Simplify artificial delay logic and remove user-based latency [#5622](https://github.com/sourcegraph/cody/pull/5622)
- Cody Web: Fix cody web server endpoint configuration [#5621](https://github.com/sourcegraph/cody/pull/5621)
- Autocomplete: add request-params tests for the `openaicompatible` provider [#5616](https://github.com/sourcegraph/cody/pull/5616)
- Add prompt-like standard commands [#5615](https://github.com/sourcegraph/cody/pull/5615)
- shipment of direct routing and prompt caching to PLG users [#5608](https://github.com/sourcegraph/cody/pull/5608)
- Use `ps` for PromptString literals. [#5607](https://github.com/sourcegraph/cody/pull/5607)
- Autocomplete: expose and test request params [#5604](https://github.com/sourcegraph/cody/pull/5604)
- Autocomplete: use prefetched flag in the jaccard-similarity retriever [2] [#5603](https://github.com/sourcegraph/cody/pull/5603)
- Autocomplete: use prefetched flag in the jaccard-similarity retriever [#5602](https://github.com/sourcegraph/cody/pull/5602)
- Autocomplete: `unstable-openai` provider `legacyModel` conditions [#5595](https://github.com/sourcegraph/cody/pull/5595)
- make ExternalServices and autocomplete more reactive [#5594](https://github.com/sourcegraph/cody/pull/5594)
- Autocomplete: add openai model helper for the `unstable-openai` provider [#5593](https://github.com/sourcegraph/cody/pull/5593)
- Autocomplete: extract shared logic into a separate folder [#5592](https://github.com/sourcegraph/cody/pull/5592)
- remove little-used multi-model autocomplete feature [#5591](https://github.com/sourcegraph/cody/pull/5591)
- Autocomplete: fix test labels [#5590](https://github.com/sourcegraph/cody/pull/5590)
- Autocomplete: clean up line-number-dependent request params logic [#5589](https://github.com/sourcegraph/cody/pull/5589)
- Autocomplete: clean up settings [#5588](https://github.com/sourcegraph/cody/pull/5588)
  - Autocomplete: removed the `cody.autocomplete.advanced.model` setting and updated supported values for `cody.autocomplete.advanced.provider`.
- make graphqlClient observe global config/auth [#5587](https://github.com/sourcegraph/cody/pull/5587)
- user visible error when context retrieval or computation fails [#5586](https://github.com/sourcegraph/cody/pull/5586)
- completion client: observe config [#5585](https://github.com/sourcegraph/cody/pull/5585)
- VS Code: Release 1.34.3 [#5584](https://github.com/sourcegraph/cody/pull/5584)
- More changes to improve observing config and authStatus [#5583](https://github.com/sourcegraph/cody/pull/5583)
- write e2e test output channel log to file [#5579](https://github.com/sourcegraph/cody/pull/5579)
- expose ModelsService.changes and listen to that in ChatController [#5578](https://github.com/sourcegraph/cody/pull/5578)
- Chat: show context excluded reason in UI [#5577](https://github.com/sourcegraph/cody/pull/5577)
  - Chat: display a warning in UI when at-mention items were excluded.
- fix the diff for recent edits by replacing psDedent with ps [#5574](https://github.com/sourcegraph/cody/pull/5574)
- Cody Web 0.8.2 release [#5570](https://github.com/sourcegraph/cody/pull/5570)
- reduce background network access [#5566](https://github.com/sourcegraph/cody/pull/5566)
  - Suppressed Cody's background process for monitoring latency to the Sourcegraph endpoint, which was used to calculate autocomplete latency for performance tracking purposes. For users with OS firewalls that notify on background network access, this will reduce notification annoyance.
- Chat: rename the 'OpenAI o1' model to 'OpenAI o1-preview [#5563](https://github.com/sourcegraph/cody/pull/5563)
  - Rename the 'OpenAI o1' model to 'OpenAI o1-preview'
- Cody Web: Fix code snippets leaking styles [#5562](https://github.com/sourcegraph/cody/pull/5562)
- Remove mentions for intent detection query [#5561](https://github.com/sourcegraph/cody/pull/5561)Removed the mentioned chips from the query sent for intent detection.
- Autocomplete: add unit tests for server-side models config [#5559](https://github.com/sourcegraph/cody/pull/5559)
- Telemetry: At Mentions [#5558](https://github.com/sourcegraph/cody/pull/5558)
- Clean up README - clean up links, add an up-to-date demo video, and clean up typos [#5556](https://github.com/sourcegraph/cody/pull/5556)
- Update Remote Directory label [#5555](https://github.com/sourcegraph/cody/pull/5555)
  - Update Remote Directory label.
- Chat Telemetry: Restores `prompt` and `response` text recording [#5553](https://github.com/sourcegraph/cody/pull/5553)
- Prepare one box UI for Cody Web usage [#5552](https://github.com/sourcegraph/cody/pull/5552)
- Autocomplete: use new `authStatus` helpers for provider creation [#5551](https://github.com/sourcegraph/cody/pull/5551)
- make some services more reactive to config [#5550](https://github.com/sourcegraph/cody/pull/5550)
- make authProvider a simple singleton, expose currentAuthStatus() sync [#5549](https://github.com/sourcegraph/cody/pull/5549)
- Edit: display authentication and network errors with code lenses [#5545](https://github.com/sourcegraph/cody/pull/5545)
  - Edit: display authentication and network errors with code lenses
- added(logout): Set view to chat after logout (CODY-3606) [#5544](https://github.com/sourcegraph/cody/pull/5544)
- VS Code: Release 1.34.2 [#5542](https://github.com/sourcegraph/cody/pull/5542)
- Cody Ignore: deprecated [#5537](https://github.com/sourcegraph/cody/pull/5537)
  - Deprecate Cody Ignore.
- Chat: update chat history export button [#5535](https://github.com/sourcegraph/cody/pull/5535)
- Codegen: Improve Formatter for better field name handling [#5534](https://github.com/sourcegraph/cody/pull/5534)
- One box: Add search like code snippets [#5533](https://github.com/sourcegraph/cody/pull/5533)
- Chat: add unique identifiers to CollapsiblePanel components [#5532](https://github.com/sourcegraph/cody/pull/5532)
- Move updateCodeLenses logic to AgentFixupControls  [#5531](https://github.com/sourcegraph/cody/pull/5531)
- Fix initial context [#5530](https://github.com/sourcegraph/cody/pull/5530)
  - Fix OpenCtx initial context integration.
- Increase default LocalStorage size from 5MB to 256MB (#5504) [#5528](https://github.com/sourcegraph/cody/pull/5528)
- Fix how smart apply handles various absolute paths and spaces in paths [#5527](https://github.com/sourcegraph/cody/pull/5527)
- Add 'Upgrade' button to Accounts panel for free users [#5526](https://github.com/sourcegraph/cody/pull/5526)
- Fix crash on account switching [#5525](https://github.com/sourcegraph/cody/pull/5525)
- Fixes Light theme list colors [#5523](https://github.com/sourcegraph/cody/pull/5523)
- Pass title for a dialog [#5522](https://github.com/sourcegraph/cody/pull/5522)
- VS Code: disable logger in unit tests [#5520](https://github.com/sourcegraph/cody/pull/5520)
- Chat: shorten remote repository titles in mention menu [#5518](https://github.com/sourcegraph/cody/pull/5518)
  - Enterprise: Remote Repository items in the mention menu now display only the org/repo part of the title, omitting the code host name to prevent repository names from being truncated in the UI.
- added(git): Parse more exotic git URLs (CODY-3132) [#5512](https://github.com/sourcegraph/cody/pull/5512)
  - Adds support for Git repositories with subgroups, ports, or no owner.
- CLI: fix `--context-repo` [#5511](https://github.com/sourcegraph/cody/pull/5511)
- Chat: waitlist for OpenAI-o1 & OpenAI-o1 mini [#5508](https://github.com/sourcegraph/cody/pull/5508)
  - feat(chat): add support for preview models `Gemini 1.5 Pro Latest` & `Gemini 1.5 Flash Latest`
feat(chat): Added ability to duplicate chat sessions
- fix context logging payload and add identifier field in context snippets [#5507](https://github.com/sourcegraph/cody/pull/5507)
- fix linux "cannot find local issuer certificate" auth error [#5503](https://github.com/sourcegraph/cody/pull/5503)
- improve config-watching and singletons [#5502](https://github.com/sourcegraph/cody/pull/5502)
- rm unused RepoPicker [#5499](https://github.com/sourcegraph/cody/pull/5499)
- rm needless DUMMY_AUTH_STATUS fixture [#5498](https://github.com/sourcegraph/cody/pull/5498)
- Context: add three new experimental retriever strategies [#5494](https://github.com/sourcegraph/cody/pull/5494)
- telemetry: add billing categorization to cody events 1 [#5493](https://github.com/sourcegraph/cody/pull/5493)
- VS Code: Release v1.34.1 [#5491](https://github.com/sourcegraph/cody/pull/5491)
- fix(Generate Commit Message): handle file paths in git diff on Windows [#5483](https://github.com/sourcegraph/cody/pull/5483)
  - Command: Fixed the `Generate Commit Message` command on Windows caused by file path. [pull/5483](https://github.com/sourcegraph/cody/pull/5483) ?
- Add option to disable ctx providers [#5481](https://github.com/sourcegraph/cody/pull/5481)
- Testing the Removal of Artificial Latency behind a feature flag [#5480](https://github.com/sourcegraph/cody/pull/5480)
- react to config/feature-flag changes using Observables in autocomplete [#5478](https://github.com/sourcegraph/cody/pull/5478)
- Auth: use getCodyAuthReferralCode [#5475](https://github.com/sourcegraph/cody/pull/5475)
- Cody Ignore: handle notebook cell URIs [#5473](https://github.com/sourcegraph/cody/pull/5473)
- VS Code: Release v1.34.0 [#5471](https://github.com/sourcegraph/cody/pull/5471)
- update blog to new changelog URL [#5470](https://github.com/sourcegraph/cody/pull/5470)
- Chat: show correct model icons and deduplicate local models [#5469](https://github.com/sourcegraph/cody/pull/5469)
  -
- update changelog [#5468](https://github.com/sourcegraph/cody/pull/5468)
- Dev: add support for configurable model options [#5467](https://github.com/sourcegraph/cody/pull/5467)
  - `cody.dev.models` now supports "options" parameter.
- Update Remote Directory Labels [#5465](https://github.com/sourcegraph/cody/pull/5465)
  - Update Remote Directory labels.
- Use new BFG version - ensure old embedding indexes are deleted [#5461](https://github.com/sourcegraph/cody/pull/5461)
  - Old embedding indexes are now deleted regularly.
- Performance: fix memory leak [#5460](https://github.com/sourcegraph/cody/pull/5460)
  - Fixed a memory leak where Cody would sometimes use several GB of memory after long use.
- Improve directory mentions [#5456](https://github.com/sourcegraph/cody/pull/5456)
  - Removes "Directories" mention, keeping only "Remote Directories".
  - Adds "Experimental" label for "Remote Directories" and adds
- Agent: clean-up assertion of telemetry events within integration tests [#5455](https://github.com/sourcegraph/cody/pull/5455)
- added(chat): improve context item display in client state broadcaster [#5454](https://github.com/sourcegraph/cody/pull/5454)
- add suggestions diff tracker for online context and nes dataset [#5453](https://github.com/sourcegraph/cody/pull/5453)
- prevent invalid ranges from borking context [#5452](https://github.com/sourcegraph/cody/pull/5452)
- Fix Cody Web remote context for mentions [#5451](https://github.com/sourcegraph/cody/pull/5451)
- Telemetry: Update naming for smart-apply [#5448](https://github.com/sourcegraph/cody/pull/5448)
- API: move to api-version=2 for faster streaming LLM responses [#5446](https://github.com/sourcegraph/cody/pull/5446)
  - Cody now uses a new LLM API that offers faster performance, especially for long chat responses. This improvement is only enabled for Claude models at this point.
- Chat: make "insert code at cursor" replace selection [#5444](https://github.com/sourcegraph/cody/pull/5444)
  - The "Insert code at cursor" action now replaces the selected text instead of adding it to the start of the selection. The behavior is unchanged when there is a cursor (no text selection).
- CLI: use client name "cody-cli" instead of "jetbrains" [#5443](https://github.com/sourcegraph/cody/pull/5443)
- make ClientConfiguration readonly to prevent mistakes [#5442](https://github.com/sourcegraph/cody/pull/5442)
- strongly typed {Authenticated,Unauthenticated}AuthState [#5441](https://github.com/sourcegraph/cody/pull/5441)
- on empty chat streaming response, log span and trace id [#5439](https://github.com/sourcegraph/cody/pull/5439)
- simplify the "authed but Cody is not enabled" state [#5437](https://github.com/sourcegraph/cody/pull/5437)
- Adjust mistral model context window [#5434](https://github.com/sourcegraph/cody/pull/5434)
- Include initial context from OpenCtx providers.  [#5433](https://github.com/sourcegraph/cody/pull/5433)
  - Include initial context from OpenCtx providers.
- Improve tabs UI for different consumers [#5432](https://github.com/sourcegraph/cody/pull/5432)
- Agent: fix bug in server managed global storage [#5431](https://github.com/sourcegraph/cody/pull/5431)
- Agent: bump to version 5.5.14 [#5429](https://github.com/sourcegraph/cody/pull/5429)
- CLI: fix error handling for invalid access tokens [#5427](https://github.com/sourcegraph/cody/pull/5427)
  - Cody CLI now reports a helpful error message when authenticating with an invalid access token
- Cody Web: Fix mention selection in Safari [#5424](https://github.com/sourcegraph/cody/pull/5424)
- clean up AuthStatus and AuthProvider [#5420](https://github.com/sourcegraph/cody/pull/5420)
- remove unused VS Code chat history sidebar code [#5419](https://github.com/sourcegraph/cody/pull/5419)
- experimental recent edits retriever for autocomplete [#5417](https://github.com/sourcegraph/cody/pull/5417)
- use higher-level API for chat models in webview [#5412](https://github.com/sourcegraph/cody/pull/5412)
- rm unused local embeddings onChange [#5411](https://github.com/sourcegraph/cody/pull/5411)
- rm unused SyncObservable helpers [#5410](https://github.com/sourcegraph/cody/pull/5410)
- added(changelog): updated version bump to build experimental changelog [#5408](https://github.com/sourcegraph/cody/pull/5408)
  - Adds automatic changelog generation to the release script.
- fixed(chat): Added a migration to local storage to update chat history (CODY-3538) [#5407](https://github.com/sourcegraph/cody/pull/5407)
  - Fixed a bug in continuing conversations from JB in the webview that caused them to be displayed as NaN weeks ago
- Fix floating ui elements (tooltips and popovers) [#5400](https://github.com/sourcegraph/cody/pull/5400)
- Autocomplete: simplify provider creation [#5399](https://github.com/sourcegraph/cody/pull/5399)
- Use singletons for most services [#5398](https://github.com/sourcegraph/cody/pull/5398)
- add direct route for experimental models [#5394](https://github.com/sourcegraph/cody/pull/5394)
- Fix workspace uri [#5391](https://github.com/sourcegraph/cody/pull/5391)
  - make sure workspace uri is file schemed
- Add zero state for history tab [#5390](https://github.com/sourcegraph/cody/pull/5390)
- Cody Web: Fix Cody Web wrapper in dev mode [#5389](https://github.com/sourcegraph/cody/pull/5389)
- bump version and add changelog [#5388](https://github.com/sourcegraph/cody/pull/5388)
- Focus textbox after we submit a follow-up message [#5386](https://github.com/sourcegraph/cody/pull/5386)
- remove unused code with knip [#5382](https://github.com/sourcegraph/cody/pull/5382)
- Autocomplete: fix Anthropic model for PLG users [#5380](https://github.com/sourcegraph/cody/pull/5380)
- kill RemoteSearch, unify context fetching paths [#5379](https://github.com/sourcegraph/cody/pull/5379)
- repro the hotstreak issue [#5378](https://github.com/sourcegraph/cody/pull/5378)
- Make textbox partially sticky to the bottom [#5371](https://github.com/sourcegraph/cody/pull/5371)
- Bring badge UI a bit closer to the new shadcn UI [#5370](https://github.com/sourcegraph/cody/pull/5370)
- Always set initial context when you create new chat for Cody Web [#5369](https://github.com/sourcegraph/cody/pull/5369)
- Improve Tabs UI layout for mid-size and small container width [#5367](https://github.com/sourcegraph/cody/pull/5367)
- add simple unit test for getOpenCtxProviders [#5366](https://github.com/sourcegraph/cody/pull/5366)
- Adds Scroll to login screen [#5365](https://github.com/sourcegraph/cody/pull/5365)
- Chat: fix bug where the "new chat" could crash the agent [#5363](https://github.com/sourcegraph/cody/pull/5363)
- Add 'Switch account' option to webview panel [#5362](https://github.com/sourcegraph/cody/pull/5362)
- Chat: flip order of initial context chips [#5359](https://github.com/sourcegraph/cody/pull/5359)
  - Chat: the order of the initial repo and file/selection context items has been flipped making it easier to remove repo context while keeping file/selection context.
- fix storybook CSS [#5357](https://github.com/sourcegraph/cody/pull/5357)
- Autocomplete: split `createProvider` into multiple files [#5356](https://github.com/sourcegraph/cody/pull/5356)
- Autocomplete: remove unused `fim-prompt-utils` [#5355](https://github.com/sourcegraph/cody/pull/5355)
- bump version and add changelog [#5353](https://github.com/sourcegraph/cody/pull/5353)
- Adding trigger delay to the code [#5350](https://github.com/sourcegraph/cody/pull/5350)
- Agent: add new `secrets` capability to implement secret storage [#5348](https://github.com/sourcegraph/cody/pull/5348)
- Guardrails: fix DDoS bug [#5346](https://github.com/sourcegraph/cody/pull/5346)
  - Fixed a bug where the guardrails icon was spinning on every editor selection event
- Smart Apply: support writing to empty files [#5345](https://github.com/sourcegraph/cody/pull/5345)
  - Fixed a bug when smart apply would not work with empty files
- Autocomplete: use model helpers in `openaicompatible` provider [#5343](https://github.com/sourcegraph/cody/pull/5343)
- Add support for web-like modal UI in Cody Web [#5342](https://github.com/sourcegraph/cody/pull/5342)
- Commands ux improvements [#5341](https://github.com/sourcegraph/cody/pull/5341)
- Autocomplete: enable smart-throttle and hot-streak by default [#5339](https://github.com/sourcegraph/cody/pull/5339)
- agent: add internal context command [#5336](https://github.com/sourcegraph/cody/pull/5336)
- Refactor Cody Web Chat wrapper [#5335](https://github.com/sourcegraph/cody/pull/5335)
- misc refactors to help make config more reactive [#5330](https://github.com/sourcegraph/cody/pull/5330)
- rename Configuration => ClientConfiguration [#5328](https://github.com/sourcegraph/cody/pull/5328)
- Agent: authentication capability - enable url handler and auth redirections [#5325](https://github.com/sourcegraph/cody/pull/5325)
- fix bug where chat hangs if no changes since last symf index [#5319](https://github.com/sourcegraph/cody/pull/5319)
- Chat: update JetBrains theme colors for command menu [#5317](https://github.com/sourcegraph/cody/pull/5317)
- VS Code: Release 1.32.1 [#5315](https://github.com/sourcegraph/cody/pull/5315)
- Chat: don't add selection to chat on option+l shortcut [#5310](https://github.com/sourcegraph/cody/pull/5310)
  - Fix bug where continuously triggering alt+l (option+l for macOS) would add duplicate context items to the chat input. Use the alt+/ shortcut to explicitly add the selection to the chat input.
- Autocomplete: refactor the Fireworks provider [#5307](https://github.com/sourcegraph/cody/pull/5307)
- added(agent): `chat/import` to import historical chats [#5304](https://github.com/sourcegraph/cody/pull/5304)
  - Added ability to import historical chats through the agent.
- Chat: Improve Cody Web initialization and view handling [#5299](https://github.com/sourcegraph/cody/pull/5299)
- Cody Web: Support directory as initial context [#5297](https://github.com/sourcegraph/cody/pull/5297)
- Fix context file selection ranges & remote file links [#5294](https://github.com/sourcegraph/cody/pull/5294)
- Cody Web: Fix cody web file/symbol mention search [#5293](https://github.com/sourcegraph/cody/pull/5293)
- PLG: simplify model selection [#5292](https://github.com/sourcegraph/cody/pull/5292)
  - Updated model selection for Pro/Free users to only have two groups: "Most powerful models" and "Faster models". The "Balanced" group has been removed.
  - Removed Mixtral 8x22B for Pro/Free users, use Mixtral 8x7B or Sonnet 3.5 instead.
- Fix getCodyContext fetching [#5291](https://github.com/sourcegraph/cody/pull/5291)
- Smart Apply: Use system prompt to encourage code blocks being created [#5290](https://github.com/sourcegraph/cody/pull/5290)
- Edit: Support multiple models on enterprise [#5289](https://github.com/sourcegraph/cody/pull/5289)
- remove unused models [#5286](https://github.com/sourcegraph/cody/pull/5286)
- Autocomplete: extract the fast-path client [#5284](https://github.com/sourcegraph/cody/pull/5284)
- Autocomplete: remove starcoder2 [#5283](https://github.com/sourcegraph/cody/pull/5283)
- Autocomplete: reduce `createProviderConfig` duplication [#5282](https://github.com/sourcegraph/cody/pull/5282)
- Codegen: add C# support for Agent bindings [#5281](https://github.com/sourcegraph/cody/pull/5281)
- Telemetry: Update `cody.promptList/query` event to fire less [#5280](https://github.com/sourcegraph/cody/pull/5280)
- VS Code: Release v1.32.0 [#5279](https://github.com/sourcegraph/cody/pull/5279)
- E2Ev2 [#5278](https://github.com/sourcegraph/cody/pull/5278)
- Improve repository mention search [#5277](https://github.com/sourcegraph/cody/pull/5277)
- added(telemetry): separate field for IDE name and server identification [#5276](https://github.com/sourcegraph/cody/pull/5276)
  - Allows identifying as Eclipse (or other previously unrecognized IDEs) in telemetry events.
- Chat: remove unused variables for Visual Studio [#5275](https://github.com/sourcegraph/cody/pull/5275)
- Smart Apply: Hash the ID used for the FixupTask [#5273](https://github.com/sourcegraph/cody/pull/5273)
- Fix model name mapping for "fireworks/deepseek-coder-v2-lite-base" [#5272](https://github.com/sourcegraph/cody/pull/5272)
- Edit: Fix single line edits [#5271](https://github.com/sourcegraph/cody/pull/5271)
- Edit: Compute decorations for hidden files [#5270](https://github.com/sourcegraph/cody/pull/5270)
- Smart Apply: Notify WebView of failure when erred from selection request [#5269](https://github.com/sourcegraph/cody/pull/5269)
- Autocomplete: remove Anthropic fallback [#5268](https://github.com/sourcegraph/cody/pull/5268)
- Model Provider: rename `model.model` to `model.id` [#5267](https://github.com/sourcegraph/cody/pull/5267)
  - No functional changes
- Chat: Improve JetBrains and Visual Studio themes [#5265](https://github.com/sourcegraph/cody/pull/5265)
- update `mockServerTelemetryExporter` to send `anonymousUserId` [#5263](https://github.com/sourcegraph/cody/pull/5263)
- Webview: conditionally render tabs based on multipleWebviewsEnabled [#5262](https://github.com/sourcegraph/cody/pull/5262)
-  Chat UI: update FileLink to work across  Agent clients [#5260](https://github.com/sourcegraph/cody/pull/5260)
- Smart Apply: Route new file logic through edit command [#5256](https://github.com/sourcegraph/cody/pull/5256)
- Cody Web: Fixes regressions since 0.4.0 (the last published version) [#5255](https://github.com/sourcegraph/cody/pull/5255)
- Chat: enable RPC message logging with CODY_LOG_WEBVIEW_RPC_MESSAGES [#5254](https://github.com/sourcegraph/cody/pull/5254)
  - only enable rpc logging in vs code during test or dev mode.
- Add SaveDialogOptionsParams [#5251](https://github.com/sourcegraph/cody/pull/5251)
- Smart Apply: Enable by default [#5250](https://github.com/sourcegraph/cody/pull/5250)
- cleaning up models and names [#5249](https://github.com/sourcegraph/cody/pull/5249)
- recommend only Claude 3.5 Sonnet for now [#5248](https://github.com/sourcegraph/cody/pull/5248)
- fix squished "new chat" and user avatar icons [#5247](https://github.com/sourcegraph/cody/pull/5247)
- adding deepseek direct route and prompt caching experiment [#5246](https://github.com/sourcegraph/cody/pull/5246)
- docs: update twitter handle label from un-capitalized sourcegraph to capitalized Sourcegraph [#5245](https://github.com/sourcegraph/cody/pull/5245)
- Agent: fix issue with clearing chat history [#5244](https://github.com/sourcegraph/cody/pull/5244)
- Remove CodebaseStatusProvider [#5243](https://github.com/sourcegraph/cody/pull/5243)
- add additional `otherCodeCompletionProviders` [#5240](https://github.com/sourcegraph/cody/pull/5240)
- Fix Cody Web Agent inlined web-worker [#5239](https://github.com/sourcegraph/cody/pull/5239)
- Add missing method stub in vscode shim [#5238](https://github.com/sourcegraph/cody/pull/5238)
- use the full width of the Cody chat viewport [#5237](https://github.com/sourcegraph/cody/pull/5237)
  - The chat UI now uses the full width of its viewport, which is helpful when using chat in a narrow editor sidebar.
- more bundle size fixes + removing RxJS transitive deps [#5235](https://github.com/sourcegraph/cody/pull/5235)
- remove unused @lexical/code [#5234](https://github.com/sourcegraph/cody/pull/5234)
- bundle size improvements [#5232](https://github.com/sourcegraph/cody/pull/5232)
- lazily import js-tiktoken to cut ~6mb from initial bundle size [#5231](https://github.com/sourcegraph/cody/pull/5231)
- replace usage of AsyncGenerators with Observables [#5230](https://github.com/sourcegraph/cody/pull/5230)
- Build: minor tweaks [#5228](https://github.com/sourcegraph/cody/pull/5228)
- make ModelsService a singleton instance, not static [#5226](https://github.com/sourcegraph/cody/pull/5226)
- many various code cleanups and removals [#5225](https://github.com/sourcegraph/cody/pull/5225)
- fix more @-mention menu glitchiness by fixing height [#5224](https://github.com/sourcegraph/cody/pull/5224)
  - Fixed glitches in the positioning of the @-mention menu.
- rm handling of long-removed App URLs [#5223](https://github.com/sourcegraph/cody/pull/5223)
- remove long-deprecated chatModel field and migration code [#5222](https://github.com/sourcegraph/cody/pull/5222)
- observe config changes in AuthProvider [#5221](https://github.com/sourcegraph/cody/pull/5221)
- fix Cody Web dev build [#5220](https://github.com/sourcegraph/cody/pull/5220)
- Chat: make export chat history available to all clients [#5219](https://github.com/sourcegraph/cody/pull/5219)
  - Agent Webview: Makes the `Export Chat` button available to all clients.
- Test: fix e2e test run step for Windows [#5217](https://github.com/sourcegraph/cody/pull/5217)
- combine mentionProviders and contextItems API into mentionMenuData [#5216](https://github.com/sourcegraph/cody/pull/5216)
- Add `otherCompletionProviders` to metadata  [#5215](https://github.com/sourcegraph/cody/pull/5215)
- fix a bug where the current file would not show up when searching for @-file mentions [#5214](https://github.com/sourcegraph/cody/pull/5214)
  - Fixed a bug in chat where the current file would not show up when @-mentioning a file and searching for it by name.
- added(build): commands for building only webviews [#5213](https://github.com/sourcegraph/cody/pull/5213)
- Agent: support multi-root workspace on workspace change events [#5211](https://github.com/sourcegraph/cody/pull/5211)
  - Agent: Update workspace folder changes handling to support multi-root workspace
  - Agent: Handle clients with a single webview
- Add Directory Mention provider for Cody [#5210](https://github.com/sourcegraph/cody/pull/5210)
  - Add @-mention directories & remote directories provider for enterprise Cody users.
- Smart Apply: Enable in other clients based on client capabilities [#5208](https://github.com/sourcegraph/cody/pull/5208)
- Commands: filter commands based on client capabilities [#5205](https://github.com/sourcegraph/cody/pull/5205)
- fix many chat UI glitches [#5201](https://github.com/sourcegraph/cody/pull/5201)
  - Fix and stabilize positioning of the @-mention menu in various screen configurations.
  - Fix the "scroll down" arrow that appears when a chat response has filled up the screen and the user can scroll to see more.
-  One Box V0 [#5199](https://github.com/sourcegraph/cody/pull/5199)
  - .
- Agent: Fix setContext command args value always undefined [#5198](https://github.com/sourcegraph/cody/pull/5198)
  - NA
- Debug: make debug commands available outside of test [#5197](https://github.com/sourcegraph/cody/pull/5197)
  - Fixed issues where debug commands are not available in production.
- fix errors in new context retrieval code [#5196](https://github.com/sourcegraph/cody/pull/5196)
- fixed(web): removed `fs-extra` [#5194](https://github.com/sourcegraph/cody/pull/5194)
- Chat: update signout button command in account tab [#5193](https://github.com/sourcegraph/cody/pull/5193)
- Agent: add new sidebar panel agent protocol & webview sign-in form [#5192](https://github.com/sourcegraph/cody/pull/5192)
- Chat: update stylesheet for visual studio [#5189](https://github.com/sourcegraph/cody/pull/5189)
  - Chat: remove scrollbar from showing when not needed.
- Smart Apply: Add basic UI to support other IDEs [#5188](https://github.com/sourcegraph/cody/pull/5188)
- Smart Apply: Open the correct document when in a different view column [#5186](https://github.com/sourcegraph/cody/pull/5186)
- Edit/Smart Apply: Correctly handle `add` insertion ranges [#5185](https://github.com/sourcegraph/cody/pull/5185)
- Add window/showSaveDialog to the protocol [#5184](https://github.com/sourcegraph/cody/pull/5184)
- Edit: Correctly guard against duplicate in-progress edits [#5183](https://github.com/sourcegraph/cody/pull/5183)
- Smart Apply: Update model choice and UI to support enterprise [#5182](https://github.com/sourcegraph/cody/pull/5182)
- Chat: update webview content security policy template [#5174](https://github.com/sourcegraph/cody/pull/5174)
- Smart Apply: Disable retry lens [#5173](https://github.com/sourcegraph/cody/pull/5173)
- Agent: minor fixes for 'agentic' chat [#5172](https://github.com/sourcegraph/cody/pull/5172)
  - Make default webview `agentic` so that webviews for other IDEs can be bundled in the extension install.
- VS Code: Release 1.30.3 [#5171](https://github.com/sourcegraph/cody/pull/5171)
- Chat: fix chat input focus issues [#5170](https://github.com/sourcegraph/cody/pull/5170)
- Chat: Color theme for Visual Studio [#5168](https://github.com/sourcegraph/cody/pull/5168)
  - Adds color theme stylesheet for Visual Studio.
- Agent: update webview build script [#5167](https://github.com/sourcegraph/cody/pull/5167)
  - NA
- ensure "New Chat" in sidebar opens in sidebar, not editor [#5164](https://github.com/sourcegraph/cody/pull/5164)
  - Fixed: The "New Chat" button in the sidebar now always opens the new chat in the sidebar, never the editor panel. Previously, a bug was introduced where the behavior was "sticky" as to which option the user last selected.
- bump version and add changelog [#5163](https://github.com/sourcegraph/cody/pull/5163)
  - Autocomplete: Experiment flag for deepseek context increase experiment. [pull/5159](https://github.com/sourcegraph/cody/pull/5159)
- Ensure normalized URI is used [#5162](https://github.com/sourcegraph/cody/pull/5162)
- experiment DS with different context window [#5159](https://github.com/sourcegraph/cody/pull/5159)
- Agent: Changes required for running webview in clients [#5157](https://github.com/sourcegraph/cody/pull/5157)
- Smart Apply: Add click events for telemetry [#5156](https://github.com/sourcegraph/cody/pull/5156)
- Smart Apply: Add title tooltip with full file path [#5154](https://github.com/sourcegraph/cody/pull/5154)
- Add metadata to context items [#5153](https://github.com/sourcegraph/cody/pull/5153)
- symf improvements [#5151](https://github.com/sourcegraph/cody/pull/5151)
  - Improves keyword context matches ("foobar" now matches "FooBar" with higher relevance) and results returned from local keyword search are also truncated so that they are definitely included in the context, even when very large.
- VS Code: Release 1.30.1 [#5150](https://github.com/sourcegraph/cody/pull/5150)
  - Autocomplete: Add a feature flag for DeepSeek-coder-v2 lite base model. [pull/5151](https://github.com/sourcegraph/cody/pull/5079)
- Chore: Enable TS 5.5 [#5149](https://github.com/sourcegraph/cody/pull/5149)
- Smart Apply: Handle request errors [#5144](https://github.com/sourcegraph/cody/pull/5144)
- Code Lenses: disable "Edit & Retry" for non-user prompts [#5143](https://github.com/sourcegraph/cody/pull/5143)
- Reindex embeddings if they are stale [#5141](https://github.com/sourcegraph/cody/pull/5141)
  - Embeddings index is periodically rebuilt if it is stale.
- Context: disable local embeddings by default [#5140](https://github.com/sourcegraph/cody/pull/5140)
  - Local embeddings are now disabled by default. To enable local embeddings, add the user setting `"cody.experimental.localEmbeddings.enabled": true`.
- Remove query rewrite experiment [#5139](https://github.com/sourcegraph/cody/pull/5139)
- Smart Apply: Implement stateful UI [#5138](https://github.com/sourcegraph/cody/pull/5138)
- symf: regenerate index more frequently [#5135](https://github.com/sourcegraph/cody/pull/5135)
- VS Code: Release v1.30.0 [#5134](https://github.com/sourcegraph/cody/pull/5134)
- added/agent: persistent global state for agent [#5133](https://github.com/sourcegraph/cody/pull/5133)
  - Added ability to persist state from the agent
- Agent: add protocol for workspaceFolder/didChange [#5131](https://github.com/sourcegraph/cody/pull/5131)
  - New "workspaceFolder/didChange" Agent protocol for updating workspace changes in Agent.
- Chat context: disable symf for enterprise accounts [#5130](https://github.com/sourcegraph/cody/pull/5130)
  - Cody no longer runs local codebase indexing unless you are authenticated with a non-enterprise account. For enteprise accounts, this means that Cody will no longer send a network request to github.com to download a `symf` binary.
- misc. Cody Web usability improvements [#5129](https://github.com/sourcegraph/cody/pull/5129)
- Agent: Revert breaking protocol change [#5128](https://github.com/sourcegraph/cody/pull/5128)
- Agent: move enterprise integration tests to separate files [#5127](https://github.com/sourcegraph/cody/pull/5127)
- export os.exec in child_process shim to fix web build [#5126](https://github.com/sourcegraph/cody/pull/5126)
- show tab labels on wide screens [#5124](https://github.com/sourcegraph/cody/pull/5124)
- load CommandsProvider in web [#5123](https://github.com/sourcegraph/cody/pull/5123)
- persist open/closed state of CollapsiblePanel [#5122](https://github.com/sourcegraph/cody/pull/5122)
- do not clobber other @-mentions when initial context changes [#5121](https://github.com/sourcegraph/cody/pull/5121)
  - Fix a chat issue where manually entered @-mentions would be clobbered if you changed your selection or active file in the editor.
- add isDotCom check for ML modeling experiments [#5119](https://github.com/sourcegraph/cody/pull/5119)
  - Adding isDotCom check for ML modeling experiments.
- Agent: add vscode-shim support for open commands [#5118](https://github.com/sourcegraph/cody/pull/5118)
- Disable embeddings A/B test, enable auto indexing [#5117](https://github.com/sourcegraph/cody/pull/5117)
  - Enables automatic indexing for embeddings.
- suppress ÷ on alt-/ in the chat input [#5116](https://github.com/sourcegraph/cody/pull/5116)
- chat: add ability to remove individual chats from history [#5114](https://github.com/sourcegraph/cody/pull/5114)
  - Chat: Added ability to remove individual chats from chat history in the sidebar.
- Remove noodle flag set to true for Cody Web [#5113](https://github.com/sourcegraph/cody/pull/5113)
- TS Build: add project reference on lib/shared from prompt-editor [#5112](https://github.com/sourcegraph/cody/pull/5112)
- fixed/dropdown: enterprise users can use any model available [#5110](https://github.com/sourcegraph/cody/pull/5110)
  - Fix bug where enterprise users were stopped from using enabled, server-sent models.
- Fall back to symf when remote indexed context is not available [#5108](https://github.com/sourcegraph/cody/pull/5108)
- Fix unimplemented range contains check [#5107](https://github.com/sourcegraph/cody/pull/5107)
- Chat: Cody chat buttons are visible in Cody views only [#5106](https://github.com/sourcegraph/cody/pull/5106)
  - Fixed an issue where buttons to start a new Cody chat and show Chat History were visible in non-Cody views.
- show commands & Prompt Library together [#5105](https://github.com/sourcegraph/cody/pull/5105)
  - Adds support for the Prompt Library, which lets you share and reuse prompts for Cody chat. You can use prompts from the Prompt Library in Cody chat by using the Prompts dropdown menu in the chat message field or by selecting a prompt in the Prompts & Commands section. To create, edit, and manage prompts in the Prompt Library, press the Manage button from Cody chat or visit Tools > Prompt Library on Sourcegraph in your web browser.
- fix web/demo New Chat and Clear History actions [#5104](https://github.com/sourcegraph/cody/pull/5104)
- use CodyPanel to show tabs & history panel in Cody Web [#5102](https://github.com/sourcegraph/cody/pull/5102)
- refactor context-fetching [#5100](https://github.com/sourcegraph/cody/pull/5100)
- findWorkspaceFiles return value is reused and should not be mutated [#5099](https://github.com/sourcegraph/cody/pull/5099)
- pass AbortSignals in more places [#5098](https://github.com/sourcegraph/cody/pull/5098)
- remove unused local context ranker [#5097](https://github.com/sourcegraph/cody/pull/5097)
- Cody Web: Add contributing.md to cody web package [#5096](https://github.com/sourcegraph/cody/pull/5096)
- Cody Web: Remove implicit context in cody web [#5095](https://github.com/sourcegraph/cody/pull/5095)
- do not ignore mock-server.ts in biome [#5093](https://github.com/sourcegraph/cody/pull/5093)
- Chat UI: Tab bar available to all users [#5092](https://github.com/sourcegraph/cody/pull/5092)
- Cody Web: Expose internal create chat API from Cody Web root component [#5091](https://github.com/sourcegraph/cody/pull/5091)
- fix focus and dupe command name [#5090](https://github.com/sourcegraph/cody/pull/5090)
- Rerank local and remote context, display alt context in UI [#5089](https://github.com/sourcegraph/cody/pull/5089)
- Agent: stop generating Kotlin bindings for the webview protocol [#5088](https://github.com/sourcegraph/cody/pull/5088)
- Use server proxy for web mentions in Cody Web [#5085](https://github.com/sourcegraph/cody/pull/5085)
- faster kotlin bindings regeneration [#5084](https://github.com/sourcegraph/cody/pull/5084)
- use streaming RPC API exthost<->webview using AsyncGenerator [#5083](https://github.com/sourcegraph/cody/pull/5083)
- make @-mention menu feel more stable [#5081](https://github.com/sourcegraph/cody/pull/5081)
- Get settings schema endpoint [#5080](https://github.com/sourcegraph/cody/pull/5080)
- Shipment of deepseek-v2-lite-base on autocomplete for PLG users [#5079](https://github.com/sourcegraph/cody/pull/5079)
  - Shipping `deepseek-coder-v2-lite-base` as the default autocomplete model for PLG users.
  - Add `anonymousUserId` in the CG payload to leverage fireworks prompt caching.
- openctx: merge in "openctx.providers" from Sourcegraph instance [#5078](https://github.com/sourcegraph/cody/pull/5078)
- Cody Web: Add range support for remote file mentions [#5077](https://github.com/sourcegraph/cody/pull/5077)
- Disable Ollama local models in Cody Web [#5076](https://github.com/sourcegraph/cody/pull/5076)
- change default keybinding for creating chat in editor to Shift+Alt+L [#5075](https://github.com/sourcegraph/cody/pull/5075)
- VS Code: Release v1.28.1 [#5074](https://github.com/sourcegraph/cody/pull/5074)
- Cody Web: Fix mention provider fetching when user is switching between chats [#5073](https://github.com/sourcegraph/cody/pull/5073)
- openctx: call disposable when replacing openctx controller [#5071](https://github.com/sourcegraph/cody/pull/5071)
- Edit: Strip trailing CR characters when computing diff [#5069](https://github.com/sourcegraph/cody/pull/5069)
- Chat: boost `@-file` mentions for open documents [#5068](https://github.com/sourcegraph/cody/pull/5068)
  - When using `@-file` mention in Chat, open documents are now ranked at the top of the fuzzy matcher list.
- Experimental: fetch context from both remote and locally modified source files [#5067](https://github.com/sourcegraph/cody/pull/5067)
- Fetch ranker relevance scores from GraphQL [#5066](https://github.com/sourcegraph/cody/pull/5066)
- bump lib versions for publishing [#5065](https://github.com/sourcegraph/cody/pull/5065)
- Cody Web: Improve debouncing mechanism for context items [#5064](https://github.com/sourcegraph/cody/pull/5064)
- Agent: get `index.test.ts` passing locally [#5062](https://github.com/sourcegraph/cody/pull/5062)
- Make the Agent debugging launch configuration work on Windows. [#5061](https://github.com/sourcegraph/cody/pull/5061)
- don't implicitly or duplicatively add user selection in chat context [#5060](https://github.com/sourcegraph/cody/pull/5060)
- update Chat Help [#5059](https://github.com/sourcegraph/cody/pull/5059)
- collapse chat empty state Chat Help and Commands by default [#5058](https://github.com/sourcegraph/cody/pull/5058)
- don't show file 2x in mention menu [#5057](https://github.com/sourcegraph/cody/pull/5057)
  - Fixes a bug where the same file was sometimes shown twice in the @-mention menu, causing a glitch in arrow-key navigation.
- noodle: remove generate unit test button [#5056](https://github.com/sourcegraph/cody/pull/5056)
- rm accidental console.log [#5055](https://github.com/sourcegraph/cody/pull/5055)
- Add 300ms debounce for at-mention query input [#5053](https://github.com/sourcegraph/cody/pull/5053)
  - Added a 300ms debounce for at-mention query input.
- Cody Web: Fixes config features event [#5050](https://github.com/sourcegraph/cody/pull/5050)
- changed(models): removed enterprise-model options link for enterprise users [#5049](https://github.com/sourcegraph/cody/pull/5049)
  - Removed "Enterprise Model Options" link in the LLM dropdown for enterprise clients
- CLI: skip permanently failing test case on Windows [#5047](https://github.com/sourcegraph/cody/pull/5047)
- remove update notice [#5046](https://github.com/sourcegraph/cody/pull/5046)
- fix h-scrolling in @-mention menu on narrow screens [#5045](https://github.com/sourcegraph/cody/pull/5045)
- Make cody-bench chat work again after ModelsService changes + upgrade LLM judge model [#5042](https://github.com/sourcegraph/cody/pull/5042)
- Consume context from OpenCtx for chat message based on selectors [#5041](https://github.com/sourcegraph/cody/pull/5041)
  - Cody will now bring in context from OpenCtx providers for a chat message on submission.
- Autocomplete: ignore leading empty leading lines [#5040](https://github.com/sourcegraph/cody/pull/5040)
- Chat: Default to sidebar chat and remove tree views registrations. [#5039](https://github.com/sourcegraph/cody/pull/5039)
  - Default to sidebar chat for both Enterprise and non-Enterprise users.
- Chat/Edit: Smart Apply [#5038](https://github.com/sourcegraph/cody/pull/5038)
- guardrails: remove unused function summariseAttribution [#5037](https://github.com/sourcegraph/cody/pull/5037)
- Cody Web: Add high-level memoization for chat/transcript UI [#5036](https://github.com/sourcegraph/cody/pull/5036)
- export some more useful things from @sourcegraph/prompt-editor [#5035](https://github.com/sourcegraph/cody/pull/5035)
- @-mention git unmerged changes vs. main or uncommitted changes [#5034](https://github.com/sourcegraph/cody/pull/5034)
- Chat UI: add button for Move to Editor [#5033](https://github.com/sourcegraph/cody/pull/5033)
- extract PromptEditor to @sourcegraph/prompt-editor internal lib [#5031](https://github.com/sourcegraph/cody/pull/5031)
- fix lack of type import that broke storybooks [#5030](https://github.com/sourcegraph/cody/pull/5030)
- Pass custom headers to rest API client [#5023](https://github.com/sourcegraph/cody/pull/5023)
- guardrails: experimental configuration of timeouts [#5020](https://github.com/sourcegraph/cody/pull/5020)
- Add lenses and edit retry support to agent [#5019](https://github.com/sourcegraph/cody/pull/5019)
- VSCode: Handle improperly aborted bfg/symf download [#5018](https://github.com/sourcegraph/cody/pull/5018)
- Guardrails: update webview on auth change [#5017](https://github.com/sourcegraph/cody/pull/5017)
- pass along forwardRef's ref arg [#5016](https://github.com/sourcegraph/cody/pull/5016)
- extract React context/wrapper components [#5015](https://github.com/sourcegraph/cody/pull/5015)
- Autocomplete: add analytics event agent tests [#5012](https://github.com/sourcegraph/cody/pull/5012)
- fix react warning on prop name stop-color (--> stopColor) [#5010](https://github.com/sourcegraph/cody/pull/5010)
- helper for webview to call extension (ChatController) API and get a result [#5006](https://github.com/sourcegraph/cody/pull/5006)
- use shadcn badge component [#5005](https://github.com/sourcegraph/cody/pull/5005)
- update readme to mention Claude 3.5 Sonnet [#5004](https://github.com/sourcegraph/cody/pull/5004)
- VS Code: Release v1.28.0 [#5002](https://github.com/sourcegraph/cody/pull/5002)
- Autocomplete: Fix typo in setting [#5001](https://github.com/sourcegraph/cody/pull/5001)
- Command: add requires setting for auto-edit command [#4998](https://github.com/sourcegraph/cody/pull/4998)
- chat: factor out helpers over SerializedLexicalNode  [#4996](https://github.com/sourcegraph/cody/pull/4996)
- Autocomplete: Merge the `smart-throttle` and `hot-streak` experiments [#4995](https://github.com/sourcegraph/cody/pull/4995)
- Autocomplete: Improve inline completions tests [#4994](https://github.com/sourcegraph/cody/pull/4994)
- noodle: new lines in the generate unit test prompt template [#4991](https://github.com/sourcegraph/cody/pull/4991)
- Clarify experimental Generate Unit Test command [#4990](https://github.com/sourcegraph/cody/pull/4990)
  - N/A — internal only
- VS Code: Reload window on first activation event  [#4989](https://github.com/sourcegraph/cody/pull/4989)
- Webview: update tab behavior by IDE [#4987](https://github.com/sourcegraph/cody/pull/4987)
- Introduce server-side context behind feature flag [#4986](https://github.com/sourcegraph/cody/pull/4986)
- vscode: contributing tip around using mitmproxy [#4985](https://github.com/sourcegraph/cody/pull/4985)
- Autocomplete: Check completions are _still_ visible before logging them as suggested and `read` [#4984](https://github.com/sourcegraph/cody/pull/4984)
- Autocomplete: set the default anthropic model only for certain cases [#4982](https://github.com/sourcegraph/cody/pull/4982)
- Inline Completions: Add comprehensive tests for in-flight request logic [#4981](https://github.com/sourcegraph/cody/pull/4981)
- chat: pass in editor to TemplateInputNode [#4978](https://github.com/sourcegraph/cody/pull/4978)
- Edit: Show Accept/Reject codelenses at diff block levels [#4976](https://github.com/sourcegraph/cody/pull/4976)
- Chat UI: (fix) do not display menu border on hide [#4972](https://github.com/sourcegraph/cody/pull/4972)
- Cody Web: Allow to set custom telemetry client name [#4970](https://github.com/sourcegraph/cody/pull/4970)
- Chat: fix overflow property for pre elements in chat messages [#4969](https://github.com/sourcegraph/cody/pull/4969)
- Update PR template with optional changelog entry [#4966](https://github.com/sourcegraph/cody/pull/4966)
- VS Code: Release v1.26.7 [#4965](https://github.com/sourcegraph/cody/pull/4965)
- guardrails: set timeout for graphql request [#4964](https://github.com/sourcegraph/cody/pull/4964)
- Fix Cody Web demo after UI tabs update [#4963](https://github.com/sourcegraph/cody/pull/4963)
- Autocomplete: always resolve something on document open calls [#4961](https://github.com/sourcegraph/cody/pull/4961)
- graphql: use ETIMEDOUT for request timeouts [#4960](https://github.com/sourcegraph/cody/pull/4960)
- Chat UI polish [#4959](https://github.com/sourcegraph/cody/pull/4959)
- Fix open diff [#4957](https://github.com/sourcegraph/cody/pull/4957)
- Fix context files urls [#4955](https://github.com/sourcegraph/cody/pull/4955)
- fixed(models): allow per-site preferences to be configured for ModelsService [#4953](https://github.com/sourcegraph/cody/pull/4953)
- Chat UI: add webview type to webview configuration [#4951](https://github.com/sourcegraph/cody/pull/4951)
- VS Code: Release v1.26.6 [#4949](https://github.com/sourcegraph/cody/pull/4949)
- Chat UI: add custom commands list [#4948](https://github.com/sourcegraph/cody/pull/4948)
- backtick [#4944](https://github.com/sourcegraph/cody/pull/4944)
- Update glob in agent (sourcegraph/cody CLI) [#4940](https://github.com/sourcegraph/cody/pull/4940)
- VS Code: Release v1.26.5 [#4938](https://github.com/sourcegraph/cody/pull/4938)
- Remove context chips from context retriever queries [#4936](https://github.com/sourcegraph/cody/pull/4936)
- Agent: fix name of workspace root [#4934](https://github.com/sourcegraph/cody/pull/4934)
- CLI: fix bug in `--show-context` [#4933](https://github.com/sourcegraph/cody/pull/4933)
- CLI: link to new documentation [#4932](https://github.com/sourcegraph/cody/pull/4932)
- Make Context Filters fail closed if the repository is not found [#4931](https://github.com/sourcegraph/cody/pull/4931)
- When substituting the config.codebase for a git remote name, make it look like one [#4930](https://github.com/sourcegraph/cody/pull/4930)
- Lowercase the version flag of Cody CLI [#4929](https://github.com/sourcegraph/cody/pull/4929)
- changed(chat): use open sidebar if available [#4927](https://github.com/sourcegraph/cody/pull/4927)
- chat: styling for experimental generate unit tests button [#4925](https://github.com/sourcegraph/cody/pull/4925)
- Retry Cody Context Filters policy fetch more aggressively in case of failure [#4924](https://github.com/sourcegraph/cody/pull/4924)
- Agent: update integration tests to assert exported telemetry events [#4923](https://github.com/sourcegraph/cody/pull/4923)
- Pass timeoutMs value in the request headers [#4921](https://github.com/sourcegraph/cody/pull/4921)
- CLI: fail fast if `--context-repo` does not have a matching name [#4919](https://github.com/sourcegraph/cody/pull/4919)
- CLI: disable autocomplete and clean up logs [#4917](https://github.com/sourcegraph/cody/pull/4917)
- Autocomplete: Update experiment documentation [#4916](https://github.com/sourcegraph/cody/pull/4916)
- Agent: prepare kotlin bindings for JetBrains adoption [#4915](https://github.com/sourcegraph/cody/pull/4915)
- VS Code: Release v1.26.4 [#4914](https://github.com/sourcegraph/cody/pull/4914)
- Self hosted models [#4913](https://github.com/sourcegraph/cody/pull/4913)
- Chat: use Context Preamble by default [#4912](https://github.com/sourcegraph/cody/pull/4912)
- Auth: fix AuthStatus update handling [#4911](https://github.com/sourcegraph/cody/pull/4911)
- agent: skip squirrel test on windows [#4905](https://github.com/sourcegraph/cody/pull/4905)
- support using a different endpoint in the Cody Web demo [#4904](https://github.com/sourcegraph/cody/pull/4904)
- "Prompt" chat toolbar item to add a prompt from Prompt Library [#4903](https://github.com/sourcegraph/cody/pull/4903)
- Autocomplete: fix prefix computation in cache keys [#4902](https://github.com/sourcegraph/cody/pull/4902)
- Autocomplete: preload completions on cursor movement [#4901](https://github.com/sourcegraph/cody/pull/4901)
- Chat UI: add tabs to sidebar chat and set editor chat by default for enterprise users [#4900](https://github.com/sourcegraph/cody/pull/4900)
- Cody Web: Fix client-config request for Cody Web in production [#4898](https://github.com/sourcegraph/cody/pull/4898)
- CLI: release v5.5.9 [#4895](https://github.com/sourcegraph/cody/pull/4895)
- CLI: fix enhanced context [#4894](https://github.com/sourcegraph/cody/pull/4894)
- VS Code: Release 1.26.3 [#4891](https://github.com/sourcegraph/cody/pull/4891)
- CLI: fix --endpoint and --access-token options [#4890](https://github.com/sourcegraph/cody/pull/4890)
- Autocomplete: Add telemetry tests for recycled completion requests [#4889](https://github.com/sourcegraph/cody/pull/4889)
- CLI: add more flexible message construction for `chat` command [#4888](https://github.com/sourcegraph/cody/pull/4888)
- CLI: only support --context-repo on dotcom accounts [#4887](https://github.com/sourcegraph/cody/pull/4887)
- make alt+l toggle chat, rather than create a new chat [#4884](https://github.com/sourcegraph/cody/pull/4884)
- Autocomplete: changelog [#4883](https://github.com/sourcegraph/cody/pull/4883)
- fixed(models): removed enterprise tag from legacy enterprise models [#4882](https://github.com/sourcegraph/cody/pull/4882)
- factor out very long telemetry event [#4880](https://github.com/sourcegraph/cody/pull/4880)
- Fix cody web telemetry and multiple llm checks [#4877](https://github.com/sourcegraph/cody/pull/4877)
- Agent: add support for Visual Studio IDE in AgentWorkspaceConfiguration [#4875](https://github.com/sourcegraph/cody/pull/4875)
- added(tests): Unit tests for model usage [#4874](https://github.com/sourcegraph/cody/pull/4874)
- Chat: remove isFreeUser model check and simplify model selection [#4873](https://github.com/sourcegraph/cody/pull/4873)
- Web: update chat model handling [#4872](https://github.com/sourcegraph/cody/pull/4872)
- Autocomplete: minor refactor markers in Gemini model [#4871](https://github.com/sourcegraph/cody/pull/4871)
- Autocomplete: Extract Agent tests [#4870](https://github.com/sourcegraph/cody/pull/4870)
- Autocomplete: Refactor tests to use getInlineCompletions helper [#4868](https://github.com/sourcegraph/cody/pull/4868)
- CLI: revert changes in docs that mention new npm package [#4867](https://github.com/sourcegraph/cody/pull/4867)
- Autocomplete: Reuse logId for recycled requests via `CacheAfterRequestStart` [#4866](https://github.com/sourcegraph/cody/pull/4866)
- Autocomplete: chars logger account for multiline deletions [#4865](https://github.com/sourcegraph/cody/pull/4865)
- chat: template chips for prompts [#4864](https://github.com/sourcegraph/cody/pull/4864)
- Command : remove "Ask Cody to Explain" from command palette [#4860](https://github.com/sourcegraph/cody/pull/4860)
- Refactor `register` and move auth/config propagation into controllers [#4859](https://github.com/sourcegraph/cody/pull/4859)
- VS Code: Update release documentation and version bump script [#4858](https://github.com/sourcegraph/cody/pull/4858)
- VS Code: Release 1.26.2 [#4856](https://github.com/sourcegraph/cody/pull/4856)
- Chore: Update changelog [#4853](https://github.com/sourcegraph/cody/pull/4853)
- Autocomplete: Add extended version of smart throttle [#4852](https://github.com/sourcegraph/cody/pull/4852)
- Autocomplete: add `stageTimings` to analytics events [#4850](https://github.com/sourcegraph/cody/pull/4850)
- Refactor: simplify chat controller logic [#4848](https://github.com/sourcegraph/cody/pull/4848)
- edit: quick pick option for full file for range [#4845](https://github.com/sourcegraph/cody/pull/4845)
- Chat: update chat model selection and default model on auth sync [#4844](https://github.com/sourcegraph/cody/pull/4844)
- VS Code: Release 1.26.1 [#4843](https://github.com/sourcegraph/cody/pull/4843)
- report to user when Experimental Generate Unit test fails [#4842](https://github.com/sourcegraph/cody/pull/4842)
- Allow clients to redefine untitled files protocol during their creation [#4841](https://github.com/sourcegraph/cody/pull/4841)
- Integrate VSCode Cody with server-side Context API [#4840](https://github.com/sourcegraph/cody/pull/4840)
- rename SimpleChatPanelProvider to ChatController and SimpleChatModel to ChatModel [#4838](https://github.com/sourcegraph/cody/pull/4838)
- check:manifest uses committed schema cache [#4836](https://github.com/sourcegraph/cody/pull/4836)
- skip check:manifest if OFFLINE is set [#4835](https://github.com/sourcegraph/cody/pull/4835)
- Autocomplete: fuzzy cache matches [#4834](https://github.com/sourcegraph/cody/pull/4834)
- Command: experimental auto-edit command [#4833](https://github.com/sourcegraph/cody/pull/4833)
- Update changelog: Re-enable chat in sidebar by default [#4832](https://github.com/sourcegraph/cody/pull/4832)
- VS Code: Release v1.26.0 [#4831](https://github.com/sourcegraph/cody/pull/4831)
- Sidebar: use release blog post URL for release notes [#4828](https://github.com/sourcegraph/cody/pull/4828)
- Autocomplete: Fix overeagerness in returning in-flight completions [#4827](https://github.com/sourcegraph/cody/pull/4827)
- Cody Web: Use deep links only in vscode extension [#4826](https://github.com/sourcegraph/cody/pull/4826)
- Agent: Simplify chat model restoration logic [#4825](https://github.com/sourcegraph/cody/pull/4825)
- Model: Claude 3.5 Sonnet as the default model for chat and commands [#4822](https://github.com/sourcegraph/cody/pull/4822)
- adding deepseek-v2 and deepseek fine-tuned model for A/B test [#4821](https://github.com/sourcegraph/cody/pull/4821)
- Autocomplete: an extra abort call for API request [#4818](https://github.com/sourcegraph/cody/pull/4818)
- Autocomplete: fix hot-streak cache keys for long documents [#4817](https://github.com/sourcegraph/cody/pull/4817)
- Cody Web: fix cody web context ignore and file resolution [#4816](https://github.com/sourcegraph/cody/pull/4816)
- Autocomplete: changelog [#4815](https://github.com/sourcegraph/cody/pull/4815)
- Autocomplete: add char count to `yield` span events [#4814](https://github.com/sourcegraph/cody/pull/4814)
- Autocomplete: decrease requests timeout [#4813](https://github.com/sourcegraph/cody/pull/4813)
- Chat UI: update loading dots color to adapt to theme [#4812](https://github.com/sourcegraph/cody/pull/4812)
- use ClientConfig.modelsAPIEnabled [#4811](https://github.com/sourcegraph/cody/pull/4811)
- Cody Web: fix cody web remote files link uri [#4809](https://github.com/sourcegraph/cody/pull/4809)
- Webview: adjust LoadingPage layout to fill the full viewport height [#4808](https://github.com/sourcegraph/cody/pull/4808)
- Ollama: Upgrade Ollama autocompletions client to use SDK [#4807](https://github.com/sourcegraph/cody/pull/4807)
- Autocomplete: add `speculation-matched-tokens` info to analytics events [#4804](https://github.com/sourcegraph/cody/pull/4804)
- Add default Anthropic autocomplete model [#4803](https://github.com/sourcegraph/cody/pull/4803)
- E2E: ensure input boxes are visible before filling in auth [#4798](https://github.com/sourcegraph/cody/pull/4798)
- Chat: update welcome message to be IDE based [#4797](https://github.com/sourcegraph/cody/pull/4797)
- Fix @openctx/vscode-lib initialization for Cody Web [#4796](https://github.com/sourcegraph/cody/pull/4796)
- e2e2: support windows for extension installation [#4793](https://github.com/sourcegraph/cody/pull/4793)
- CLI: restructure commands (breaking change!) [#4792](https://github.com/sourcegraph/cody/pull/4792)
- E2E V2: Basic authenticated flow [#4791](https://github.com/sourcegraph/cody/pull/4791)
- Fix cursor position after submitting mention items [#4789](https://github.com/sourcegraph/cody/pull/4789)
- Generate Unit Test Experiment [#4787](https://github.com/sourcegraph/cody/pull/4787)
- Agent: fix Java bindings bug [#4786](https://github.com/sourcegraph/cody/pull/4786)
- VS Code: Release v1.24.2 [#4785](https://github.com/sourcegraph/cody/pull/4785)
- Edit: Remove unused scheduling code [#4784](https://github.com/sourcegraph/cody/pull/4784)
- Edit: Add changelog for #4720 [#4783](https://github.com/sourcegraph/cody/pull/4783)
-  make Cody use new /.api/client-config endpoint when available [#4782](https://github.com/sourcegraph/cody/pull/4782)
- Edit: Collapse selections to cursor position after prompt [#4781](https://github.com/sourcegraph/cody/pull/4781)
- Autocomplete: feature flags for parallel latency A/B tests [#4779](https://github.com/sourcegraph/cody/pull/4779)
- Autocomplete: increase autocomplete request manager cache size [#4778](https://github.com/sourcegraph/cody/pull/4778)
- [Cody Web]: Support `openctx` providers [#4777](https://github.com/sourcegraph/cody/pull/4777)
- Remove v1 telemetry from Cody [#4776](https://github.com/sourcegraph/cody/pull/4776)
- Edit: set Cody logo as fallback provider icon [#4774](https://github.com/sourcegraph/cody/pull/4774)
- Fix ScrollDown button for cody web case [#4773](https://github.com/sourcegraph/cody/pull/4773)
- [Cody Web]: Prepare cody web package for publishing [#4771](https://github.com/sourcegraph/cody/pull/4771)
- CLI: add VHS script to record demo video [#4770](https://github.com/sourcegraph/cody/pull/4770)
- Interleave chat context items from different sources [#4769](https://github.com/sourcegraph/cody/pull/4769)
- Bump pnpm-setup action [#4768](https://github.com/sourcegraph/cody/pull/4768)
- VS Code: Release v1.24.1 [#4767](https://github.com/sourcegraph/cody/pull/4767)
- Fix telemetry event cody.auth.login:firstEver firing too often in agent [#4766](https://github.com/sourcegraph/cody/pull/4766)
- Set up enhanced context A/B test [#4765](https://github.com/sourcegraph/cody/pull/4765)
- Agent: switch rate-limited client account [#4763](https://github.com/sourcegraph/cody/pull/4763)
- clearer test that Cody doesn't crash but also doesn't support VS Code multi-root workspaces [#4762](https://github.com/sourcegraph/cody/pull/4762)
- update hedges prevention preamble in prompt-mixin [#4759](https://github.com/sourcegraph/cody/pull/4759)
- Re-enable chat in sidebar by default [#4758](https://github.com/sourcegraph/cody/pull/4758)
- Cody Web: fix cody web UI flashes problem [#4757](https://github.com/sourcegraph/cody/pull/4757)
- [Cody Web]: Allow agent auth running without access token [#4756](https://github.com/sourcegraph/cody/pull/4756)
- CLI: replace keytar with custom solution [#4750](https://github.com/sourcegraph/cody/pull/4750)
- CLI: Fix npm release [#4749](https://github.com/sourcegraph/cody/pull/4749)
- Cody-bench: add chat context [#4748](https://github.com/sourcegraph/cody/pull/4748)
- Remove OpenAI embedding model support [#4747](https://github.com/sourcegraph/cody/pull/4747)
- Chat: Simplify the Enterprise docs in the model selector [#4745](https://github.com/sourcegraph/cody/pull/4745)
- Agent: add stylesheet for jetbrains [#4744](https://github.com/sourcegraph/cody/pull/4744)
- autocomplete: Gemini 1.5 Flash via unstable-gemini provider [#4743](https://github.com/sourcegraph/cody/pull/4743)
- Chat: Update context preamble to minimize hedgings [#4742](https://github.com/sourcegraph/cody/pull/4742)
- Update Cody Web package [#4741](https://github.com/sourcegraph/cody/pull/4741)
- [Agent] Add delete chat method to json rpc [#4740](https://github.com/sourcegraph/cody/pull/4740)
- biome: use git ignore file [#4738](https://github.com/sourcegraph/cody/pull/4738)
- Autocomplete: limit the number of hot-streak lines [#4737](https://github.com/sourcegraph/cody/pull/4737)
- Autocomplete: Re-implement `SmartThrottle` [#4735](https://github.com/sourcegraph/cody/pull/4735)
- Cody Context Filters: disable logs in tests [#4732](https://github.com/sourcegraph/cody/pull/4732)
- Cody Web: Add remote context support [#4731](https://github.com/sourcegraph/cody/pull/4731)
- Enable moving the chat from editor back into the sidebar [#4730](https://github.com/sourcegraph/cody/pull/4730)
- Chat: enable sidebar refresh and moving from sidebar to editor [#4729](https://github.com/sourcegraph/cody/pull/4729)
- CLI: fix release job [#4728](https://github.com/sourcegraph/cody/pull/4728)
- CLI: bump package version to v0.1.0 [#4726](https://github.com/sourcegraph/cody/pull/4726)
- CLI: add `auth` subcommand [#4724](https://github.com/sourcegraph/cody/pull/4724)
- Add `chat/web/new` method to rpc JSON API [#4723](https://github.com/sourcegraph/cody/pull/4723)
- Extend `chat/export` rpc API (add fullHistory option) [#4722](https://github.com/sourcegraph/cody/pull/4722)
- Send history change notification to the client [#4721](https://github.com/sourcegraph/cody/pull/4721)
- Edit: Support opening a separate diff and improve diff editing [#4720](https://github.com/sourcegraph/cody/pull/4720)
- Add sync index-db-based storage to cody web package [#4719](https://github.com/sourcegraph/cody/pull/4719)
- VS Code: update Kotlin bindings [#4718](https://github.com/sourcegraph/cody/pull/4718)
- Autocomplete: keep the last candidate in cache if it is not applicable [#4717](https://github.com/sourcegraph/cody/pull/4717)
- Agent: Add custom commands list API [#4715](https://github.com/sourcegraph/cody/pull/4715)
- CLI: interactively stream reply [#4713](https://github.com/sourcegraph/cody/pull/4713)
- Auth: update Ollama offline mode UI [#4712](https://github.com/sourcegraph/cody/pull/4712)
- add recommended label for the Launch VS Code Extension launch task [#4711](https://github.com/sourcegraph/cody/pull/4711)
- Bench: add class for chat questions [#4707](https://github.com/sourcegraph/cody/pull/4707)
- Playwright V2 E2E Framework [#4706](https://github.com/sourcegraph/cody/pull/4706)
- Stevey/fallback to default chat model [#4705](https://github.com/sourcegraph/cody/pull/4705)
- Edit: Fix incorrect indentation for undetected files [#4704](https://github.com/sourcegraph/cody/pull/4704)
- Chat context observability improvements [#4702](https://github.com/sourcegraph/cody/pull/4702)
- vscode: upgrade @openctx/vscode-lib to 0.0.13 [#4701](https://github.com/sourcegraph/cody/pull/4701)
- Autocomplete: add `providerModel` to stage counter logger [#4699](https://github.com/sourcegraph/cody/pull/4699)
- Agent: handle missing chat model for unauthenticated users [#4697](https://github.com/sourcegraph/cody/pull/4697)
- Cody CLI: improve `chat` subcommand [#4695](https://github.com/sourcegraph/cody/pull/4695)
- Bench: add hedging and conciseness scores for Chat [#4693](https://github.com/sourcegraph/cody/pull/4693)
- VS Code: Release v1.24.0 [#4692](https://github.com/sourcegraph/cody/pull/4692)
- Auth: add offline mode support for Ollama models [#4691](https://github.com/sourcegraph/cody/pull/4691)
- update events to have enum numerical values for telemetry recording on `metadata` [#4690](https://github.com/sourcegraph/cody/pull/4690)
- Edit: Make e2e test less flaky [#4686](https://github.com/sourcegraph/cody/pull/4686)
- Edit: Allow editing the inline diff [#4684](https://github.com/sourcegraph/cody/pull/4684)
- rm unused webview code [#4682](https://github.com/sourcegraph/cody/pull/4682)
- misc. webview<->exthost code cleanup [#4681](https://github.com/sourcegraph/cody/pull/4681)
- add copyFileSync web shim to fix perma 'Loading...' in web [#4680](https://github.com/sourcegraph/cody/pull/4680)
- Add troubleshooting tip to README.md [#4679](https://github.com/sourcegraph/cody/pull/4679)
- Bench: add LLM judge for response scoring to chat strategy [#4678](https://github.com/sourcegraph/cody/pull/4678)
- Remove redundant loggings [#4677](https://github.com/sourcegraph/cody/pull/4677)
- Bench: Add chat question to EvaluationDocument and strategy-chat [#4676](https://github.com/sourcegraph/cody/pull/4676)
- Bench: allow files to be optional in ChatTask interface [#4675](https://github.com/sourcegraph/cody/pull/4675)
- Chat: handle transcript length exceeding context window [#4674](https://github.com/sourcegraph/cody/pull/4674)
- Edit: Fix JetBrains issue with range expansion [#4673](https://github.com/sourcegraph/cody/pull/4673)
- Enable completion persistence loging in agent [#4672](https://github.com/sourcegraph/cody/pull/4672)
- Edit: Fix race condition on save (intended deletions vs formatter) [#4670](https://github.com/sourcegraph/cody/pull/4670)
- VS Code: enable Fireworks tracing for Sourcegraph teammates [#4668](https://github.com/sourcegraph/cody/pull/4668)
- Chat: adapt context preamble for Sonnet 3.5 [#4666](https://github.com/sourcegraph/cody/pull/4666)
- allow more models for Cody Free users [#4665](https://github.com/sourcegraph/cody/pull/4665)
- remove /post-sign-up needless redirect [#4664](https://github.com/sourcegraph/cody/pull/4664)
- Chat: add infrastructure to run chat evals [#4661](https://github.com/sourcegraph/cody/pull/4661)
- Leaderboard: add autocomplete benchmarks [#4659](https://github.com/sourcegraph/cody/pull/4659)
- chat: always use range if there is an active selection [#4658](https://github.com/sourcegraph/cody/pull/4658)
- cli: pnpm lock file changes since move into agent [#4657](https://github.com/sourcegraph/cody/pull/4657)
- cody-bench: exit the process after finishing [#4656](https://github.com/sourcegraph/cody/pull/4656)
- mentions: onMentionClick focusses if input already has @ [#4655](https://github.com/sourcegraph/cody/pull/4655)
- mentions: update text node rather than replace [#4654](https://github.com/sourcegraph/cody/pull/4654)
- CLI: move implementation to the agent project [#4653](https://github.com/sourcegraph/cody/pull/4653)
- CLI: print to stdout instead of stderr [#4652](https://github.com/sourcegraph/cody/pull/4652)
- workflows: update pr-auditor workflow [#4650](https://github.com/sourcegraph/cody/pull/4650)
- fixing recordsPrivateMetadata field when the private context is empty [#4649](https://github.com/sourcegraph/cody/pull/4649)
- Chat: handle aborted responses in assistant message cell UI [#4648](https://github.com/sourcegraph/cody/pull/4648)
- vscode: use NetworkError in nodeClient [#4646](https://github.com/sourcegraph/cody/pull/4646)
- fix loading of linux certs for agent [#4644](https://github.com/sourcegraph/cody/pull/4644)
- Provide a template for local e2e tests for local development purposes.  [#4643](https://github.com/sourcegraph/cody/pull/4643)
- Use shared telemetry recorder in agent [#4642](https://github.com/sourcegraph/cody/pull/4642)
- Autocomplete: log resolved model for cached results [#4641](https://github.com/sourcegraph/cody/pull/4641)
- Agent: fix Kotlin bindings script [#4640](https://github.com/sourcegraph/cody/pull/4640)
- mentions: remote file search regex escapes and anchors inputs [#4638](https://github.com/sourcegraph/cody/pull/4638)
- Chat: Refactor update notices to be IDE-specific [#4637](https://github.com/sourcegraph/cody/pull/4637)
- Update prompt template for openctx context items [#4634](https://github.com/sourcegraph/cody/pull/4634)
- VS Code: Patch Release 1.22.4 [#4633](https://github.com/sourcegraph/cody/pull/4633)
- PLG: Claude 3.5 Sonnet model [#4631](https://github.com/sourcegraph/cody/pull/4631)
- Make mention chips open links [#4630](https://github.com/sourcegraph/cody/pull/4630)
- editor: support all uri schemes for getTextEditorContentForFile [#4629](https://github.com/sourcegraph/cody/pull/4629)
- debounce selection determination to reduce CPU load [#4627](https://github.com/sourcegraph/cody/pull/4627)
- Cleanup mention label [#4626](https://github.com/sourcegraph/cody/pull/4626)
- bump time to first completion up to 3.5 seconds to allow for more syntactically complete code completions [#4625](https://github.com/sourcegraph/cody/pull/4625)
- mentions: add stories for no query and openctx [#4624](https://github.com/sourcegraph/cody/pull/4624)
- Rewrite queries based on chat history and mentioned context items for better enhanced context fetching [#4623](https://github.com/sourcegraph/cody/pull/4623)
- Agent: fix bug related to `extends`/`implements` [#4622](https://github.com/sourcegraph/cody/pull/4622)
- mentions: display queryLabel if no results and no query yet [#4621](https://github.com/sourcegraph/cody/pull/4621)
- fix lang identifier for language specific mixtral model [#4619](https://github.com/sourcegraph/cody/pull/4619)
- Windows: make win-ca also work with the agent [#4618](https://github.com/sourcegraph/cody/pull/4618)
- Agent: add automatically generated bindings for Java [#4617](https://github.com/sourcegraph/cody/pull/4617)
- upgrade lexical to 0.16.0 [#4615](https://github.com/sourcegraph/cody/pull/4615)
- VS Code: Release v1.22.2 [#4613](https://github.com/sourcegraph/cody/pull/4613)
- fix typo: "all FEATURE" -> "all of your FEATURE" [#4611](https://github.com/sourcegraph/cody/pull/4611)
- Chat: Anthropic chat client for cody.dev.models [#4610](https://github.com/sourcegraph/cody/pull/4610)
- VS Code: changelog update [#4609](https://github.com/sourcegraph/cody/pull/4609)
- Chat: Assign ModelUIGroup for Enterprise model [#4607](https://github.com/sourcegraph/cody/pull/4607)
- Adding completions to google vertex provider only for anthropic based models [#4606](https://github.com/sourcegraph/cody/pull/4606)
- openctx: set query label if provided [#4604](https://github.com/sourcegraph/cody/pull/4604)
- openctx: set preloadDelay to 5 seconds [#4603](https://github.com/sourcegraph/cody/pull/4603)
- Chat: fix abort message loading state [#4601](https://github.com/sourcegraph/cody/pull/4601)
- Update README files for Cody messaing [#4599](https://github.com/sourcegraph/cody/pull/4599)
- Windows Certificates: bundle roots.exe [#4598](https://github.com/sourcegraph/cody/pull/4598)
- Skip flaky tests [#4596](https://github.com/sourcegraph/cody/pull/4596)
- Autocomplete: implement stage counter logger [#4595](https://github.com/sourcegraph/cody/pull/4595)
- Reenable some core chat tests [#4593](https://github.com/sourcegraph/cody/pull/4593)
- CI: disable symf in agent integration tests [#4591](https://github.com/sourcegraph/cody/pull/4591)
- Chat: update file source display text [#4590](https://github.com/sourcegraph/cody/pull/4590)
- CI: refine workflow triggers [#4587](https://github.com/sourcegraph/cody/pull/4587)
- Add ide version and proper Cody extension version to the telemetry [#4585](https://github.com/sourcegraph/cody/pull/4585)
- Chat: don't show context CTAs on transcript error [#4584](https://github.com/sourcegraph/cody/pull/4584)
- Agent: add support for clients to receive webview messages as strings [#4583](https://github.com/sourcegraph/cody/pull/4583)
- Chat: Add a stop button and tooltips w/ keyboard shortcuts, and reduce vertical space [#4580](https://github.com/sourcegraph/cody/pull/4580)
- fix flaky test [#4579](https://github.com/sourcegraph/cody/pull/4579)
- minion: remove unused checkpoint [#4578](https://github.com/sourcegraph/cody/pull/4578)
- adding completions experiment variants [#4577](https://github.com/sourcegraph/cody/pull/4577)
- fix symf instanceof CancellationError test flake [#4574](https://github.com/sourcegraph/cody/pull/4574)
- Refine preamble for general coding questions [#4573](https://github.com/sourcegraph/cody/pull/4573)
- VS Code: Release v1.22.1 [#4572](https://github.com/sourcegraph/cody/pull/4572)
- Autocomplete: add `x-cody-resolved-model` to completion events [#4565](https://github.com/sourcegraph/cody/pull/4565)
- Ollama: Fix Ollama models not connected to correct client [#4564](https://github.com/sourcegraph/cody/pull/4564)
- Enterprise: add support for expanded context window to Gemini 1.5 models [#4563](https://github.com/sourcegraph/cody/pull/4563)
- Custom Command: refactor cody.json file handling [#4561](https://github.com/sourcegraph/cody/pull/4561)
- vscode: show "Add File to Cody Chat" for remote files [#4557](https://github.com/sourcegraph/cody/pull/4557)
- ci: use latest setup-gcloud, checkout and pnpm/action-setup [#4556](https://github.com/sourcegraph/cody/pull/4556)
- vscode: remove warning for vite CJS deprecation in builds [#4555](https://github.com/sourcegraph/cody/pull/4555)
- Chat: Fix hover tooltips on overflowed paths in the @-mention file picker [#4553](https://github.com/sourcegraph/cody/pull/4553)
- Chat: Update OpenCtx icons [#4552](https://github.com/sourcegraph/cody/pull/4552)
- DX: fix dev-desktop watch mode [#4551](https://github.com/sourcegraph/cody/pull/4551)
- Avoid addEnhancedContext in chat quality tests [#4548](https://github.com/sourcegraph/cody/pull/4548)
- Adding a temporary fix to the win-ca package to remove the patched inject method that fails with Vscode's insiders build [#4547](https://github.com/sourcegraph/cody/pull/4547)
- VS Code: Release v1.22.0 [#4546](https://github.com/sourcegraph/cody/pull/4546)
- Minor: remove unused repoName param [#4543](https://github.com/sourcegraph/cody/pull/4543)
- Show @-mentions as chips, not text [#4539](https://github.com/sourcegraph/cody/pull/4539)
- Chat: Update large file tooltip text [#4537](https://github.com/sourcegraph/cody/pull/4537)
- cstorybook: human message cell with initial large file [#4536](https://github.com/sourcegraph/cody/pull/4536)
- Chat in sidebar [#4535](https://github.com/sourcegraph/cody/pull/4535)
- Chat: update token styles for initial @-file that are too large [#4534](https://github.com/sourcegraph/cody/pull/4534)
- Finetuned model shipment for tsx, jsx and py [#4533](https://github.com/sourcegraph/cody/pull/4533)
- Chat: Fix aborted requests [#4532](https://github.com/sourcegraph/cody/pull/4532)
- openctx: update to directly use controller [#4531](https://github.com/sourcegraph/cody/pull/4531)
- minor: do not export openCtxMentionProviders [#4529](https://github.com/sourcegraph/cody/pull/4529)
- fix minion [#4528](https://github.com/sourcegraph/cody/pull/4528)
- Chat: Remove @ from selection context template [#4527](https://github.com/sourcegraph/cody/pull/4527)
- Remote File @-mention  improvements [#4526](https://github.com/sourcegraph/cody/pull/4526)
- Edit: Inline Diff [#4525](https://github.com/sourcegraph/cody/pull/4525)
- Fix empty state for @-mentions [#4524](https://github.com/sourcegraph/cody/pull/4524)
- Make sure to show scrollbar in the @ menu if needed [#4523](https://github.com/sourcegraph/cody/pull/4523)
- add more telemetry for ModelSelectField and HumanMessageEditor [#4522](https://github.com/sourcegraph/cody/pull/4522)
- send cody.modelSelect telemetry when using keyboard [#4521](https://github.com/sourcegraph/cody/pull/4521)
- Solidify context sorting for tests [#4519](https://github.com/sourcegraph/cody/pull/4519)
- Chat quality: apply PromptMixin to last human message with context [#4516](https://github.com/sourcegraph/cody/pull/4516)
- added some support for client-side integration tests [#4512](https://github.com/sourcegraph/cody/pull/4512)
- workaround for createSecureContext error blocking ext activation in VS Code Insiders [#4511](https://github.com/sourcegraph/cody/pull/4511)
- rm unused VS Code context key cody.hasNewChatOpened [#4510](https://github.com/sourcegraph/cody/pull/4510)
- Add ConfigWatcher class to simplify config change handling [#4508](https://github.com/sourcegraph/cody/pull/4508)
- remove unused code [#4507](https://github.com/sourcegraph/cody/pull/4507)
- remove separate natural-language search quickpick, prefer using it via chat instead [#4506](https://github.com/sourcegraph/cody/pull/4506)
- remove obsolete chat notice after 1st autocomplete [#4505](https://github.com/sourcegraph/cody/pull/4505)
- remove unused/duplicate VS Code commands [#4504](https://github.com/sourcegraph/cody/pull/4504)
- Enable fetching LLM model data from the backend [#4503](https://github.com/sourcegraph/cody/pull/4503)
- adding additional logging for autocomplete feature [#4501](https://github.com/sourcegraph/cody/pull/4501)
- openctx: do not call exposeOpenCtxClient on config change [#4500](https://github.com/sourcegraph/cody/pull/4500)
- openctx: warn if sourcegraph.openctx ext is enabled [#4499](https://github.com/sourcegraph/cody/pull/4499)
- cody.experimental.autocomplete.firstCompletionTimeout setting [#4498](https://github.com/sourcegraph/cody/pull/4498)
- Fix symf rewrite failures [#4497](https://github.com/sourcegraph/cody/pull/4497)
- openctx: refactor exposeOpenCtxClient to async function [#4496](https://github.com/sourcegraph/cody/pull/4496)
- vscode: specify untrusted configuration "openctx.providers" [#4495](https://github.com/sourcegraph/cody/pull/4495)
- Update symf and simplify query rewrite [#4494](https://github.com/sourcegraph/cody/pull/4494)
- enterprise model options link in model selector [#4492](https://github.com/sourcegraph/cody/pull/4492)
- Cody-bench: emit CSV output from Fix benchmark [#4489](https://github.com/sourcegraph/cody/pull/4489)
- Prefer new enhanced context over historical context [#4487](https://github.com/sourcegraph/cody/pull/4487)
- Fix context loading in response quality test [#4486](https://github.com/sourcegraph/cody/pull/4486)
- minion: auto-update the changelog [#4485](https://github.com/sourcegraph/cody/pull/4485)
- remove cody label from labeler [#4481](https://github.com/sourcegraph/cody/pull/4481)
- show version-updated toast above (relative not floating) [#4480](https://github.com/sourcegraph/cody/pull/4480)
- indicate context used for followup messages [#4479](https://github.com/sourcegraph/cody/pull/4479)
- Make it possible to get back @<repo> and @<currentfile> in the mention menu [#4478](https://github.com/sourcegraph/cody/pull/4478)
- fix chat line-height and font-size [#4477](https://github.com/sourcegraph/cody/pull/4477)
- suppress embeddings error notifications [#4476](https://github.com/sourcegraph/cody/pull/4476)
- Fix an issue where opening the @-mention menu in a followup input would scroll the window to the top [#4475](https://github.com/sourcegraph/cody/pull/4475)
- run biome on vite(st) files [#4473](https://github.com/sourcegraph/cody/pull/4473)
- fix inability to copy text in streaming chat response [#4472](https://github.com/sourcegraph/cody/pull/4472)
- Improve 'needs README' context detection [#4471](https://github.com/sourcegraph/cody/pull/4471)
- VS Code: 1.20.3 release [#4470](https://github.com/sourcegraph/cody/pull/4470)
- disable copy event logging on code blocks to fix event log spam [#4469](https://github.com/sourcegraph/cody/pull/4469)
- Autocomplete: Break camelCase, snake_case, and kebab-case in similiarity tokenizer [#4467](https://github.com/sourcegraph/cody/pull/4467)
- Correct error message when the chat/new request fails to authenticate to the Sourcegraph API [#4464](https://github.com/sourcegraph/cody/pull/4464)
- VS Code: Release 1.20.2 [#4462](https://github.com/sourcegraph/cody/pull/4462)
- skip flaky test `Generate Unit Test > editCommands/test 1` [#4460](https://github.com/sourcegraph/cody/pull/4460)
- fix memory leak in syntax highlighting (causing gray webviews) [#4459](https://github.com/sourcegraph/cody/pull/4459)
- Improve Chat response quality test [#4458](https://github.com/sourcegraph/cody/pull/4458)
- DX: Add type/build checks for common hard-to-notice pitfalls [#4456](https://github.com/sourcegraph/cody/pull/4456)
- Autocomplete: Remove multi-tenant llama code [#4454](https://github.com/sourcegraph/cody/pull/4454)
- Autocomplete: Remove smart throttle [#4453](https://github.com/sourcegraph/cody/pull/4453)
- Autocomplete: Remove section history retriever [#4452](https://github.com/sourcegraph/cody/pull/4452)
- Refactor `ModelProvider` into `Model` and `ModelsService` [#4449](https://github.com/sourcegraph/cody/pull/4449)
- Fix: Use withPlatformSlashes helper to format file path in unit test [#4448](https://github.com/sourcegraph/cody/pull/4448)
- Jaccard Retriever: Reduce performance overhead [#4446](https://github.com/sourcegraph/cody/pull/4446)
- VS Code: Add version bump scripts (#4442) [#4445](https://github.com/sourcegraph/cody/pull/4445)
- Autocomplete: Add feature flag to extend context language pool [#4444](https://github.com/sourcegraph/cody/pull/4444)
- commands: getContextFileFromUri treats empty ranges as full file [#4443](https://github.com/sourcegraph/cody/pull/4443)
- Fix incorrect JSX SVG attrs [#4442](https://github.com/sourcegraph/cody/pull/4442)
- CI: increase timeout for Fix integration test [#4441](https://github.com/sourcegraph/cody/pull/4441)
- bfg: include process.env when spawning cody-engine [#4440](https://github.com/sourcegraph/cody/pull/4440)
- Chat: Don't append @ when "Add context" is pressed multiple times [#4439](https://github.com/sourcegraph/cody/pull/4439)
- VS Code: Release 1.20.1 [#4438](https://github.com/sourcegraph/cody/pull/4438)
- VS Code: changelog update [#4437](https://github.com/sourcegraph/cody/pull/4437)
- Chat: Fix contrast and colors of send button [#4436](https://github.com/sourcegraph/cody/pull/4436)
- Agent: fix out of bounds document offsets [#4435](https://github.com/sourcegraph/cody/pull/4435)
- only run guardrails when message is finished loading [#4433](https://github.com/sourcegraph/cody/pull/4433)
- Edit: preserve intent context [#4432](https://github.com/sourcegraph/cody/pull/4432)
- Exclude repos based on Context filters from default mention items [#4427](https://github.com/sourcegraph/cody/pull/4427)
- CI: make tests more stable on Windows [#4426](https://github.com/sourcegraph/cody/pull/4426)
- make explain e2e test slightly less flaky [#4425](https://github.com/sourcegraph/cody/pull/4425)
- improve how commands are displayed in chat [#4424](https://github.com/sourcegraph/cody/pull/4424)
- link "Cody updated to v..." notice to blog post [#4423](https://github.com/sourcegraph/cody/pull/4423)
- fix copy/insert/save code buttons in chat [#4422](https://github.com/sourcegraph/cody/pull/4422)
- VS Code: Release 1.20.0 [#4417](https://github.com/sourcegraph/cody/pull/4417)
- Add experimental "Minion" panel [#4416](https://github.com/sourcegraph/cody/pull/4416)
- Document Code: improve tree-sitter query for c++ [#4415](https://github.com/sourcegraph/cody/pull/4415)
- Implement feature flag for embeddings - metadata generation [#4414](https://github.com/sourcegraph/cody/pull/4414)
- vscode: remove Rename Chat functionality [#4413](https://github.com/sourcegraph/cody/pull/4413)
- vscode: do not show "Rename Chat" in command pallette [#4412](https://github.com/sourcegraph/cody/pull/4412)
- Add forgotten change log entry for #4404 [#4409](https://github.com/sourcegraph/cody/pull/4409)
- Unify Opt+L and Opt+K hotkeys, fix Opt+L inserting a char instead of opening chat [#4407](https://github.com/sourcegraph/cody/pull/4407)
- fix ScrollDown arrow becoming transparent on hover [#4406](https://github.com/sourcegraph/cody/pull/4406)
- remove old configs [#4405](https://github.com/sourcegraph/cody/pull/4405)
- Autocomplete: Allow suffix to change/Fix for auto-inserted semi mode [#4404](https://github.com/sourcegraph/cody/pull/4404)
- Claude 3 Sonnet is recommended, not just default [#4402](https://github.com/sourcegraph/cody/pull/4402)
- shorter e2e timeouts when running locally [#4401](https://github.com/sourcegraph/cody/pull/4401)
- only run event logging assertions if test passed [#4400](https://github.com/sourcegraph/cody/pull/4400)
- remove unneccessary windows check in ContextItemMentionNode test [#4399](https://github.com/sourcegraph/cody/pull/4399)
- do not store lexical editor HTML output [#4396](https://github.com/sourcegraph/cody/pull/4396)
- fix windows paths in ContextItemMentionNode tests [#4393](https://github.com/sourcegraph/cody/pull/4393)
- Document code: Add tree-sitter query for CPP [#4392](https://github.com/sourcegraph/cody/pull/4392)
- Document code: Add tree-sitter query for C [#4391](https://github.com/sourcegraph/cody/pull/4391)
- remove old context providers [#4390](https://github.com/sourcegraph/cody/pull/4390)
- vscode: Fix item count [#4389](https://github.com/sourcegraph/cody/pull/4389)
- Chat: keep the editor query prefix on the @-mention provider selection [#4388](https://github.com/sourcegraph/cody/pull/4388)
- Unit Test Detection: Improve language specific cases [#4387](https://github.com/sourcegraph/cody/pull/4387)
- Visual tweaks for context focus bar [#4386](https://github.com/sourcegraph/cody/pull/4386)
- Add Icons to Mention chips and update chip labels [#4385](https://github.com/sourcegraph/cody/pull/4385)
- Cody Bench: add infrastructure for LLM Judge [#4384](https://github.com/sourcegraph/cody/pull/4384)
- vscode: Relax provider search matching [#4383](https://github.com/sourcegraph/cody/pull/4383)
- Cody Bench: add strategy for Fix command against manual examples [#4382](https://github.com/sourcegraph/cody/pull/4382)
- Cody Bench: rename `evaluate-autocomplete` to `cody-bench` [#4380](https://github.com/sourcegraph/cody/pull/4380)
- better logging and experimental support for [Cortex](https://jan.ai/cortex) [#4377](https://github.com/sourcegraph/cody/pull/4377)
- Agent: get tests green again [#4375](https://github.com/sourcegraph/cody/pull/4375)
- allow groq and openaicompatible chat models on Cody Free [#4372](https://github.com/sourcegraph/cody/pull/4372)
- Storybook: set vscode theme classes on `body` [#4371](https://github.com/sourcegraph/cody/pull/4371)
- Import OpenCtx Web provider and remove the old ones [#4370](https://github.com/sourcegraph/cody/pull/4370)
- vscode: Make keybinding for new chat separate keycaps [#4369](https://github.com/sourcegraph/cody/pull/4369)
- vscode: Rename context files to context items [#4368](https://github.com/sourcegraph/cody/pull/4368)
- Apply context filters to Sourcegraph Repositories @-mention context p… [#4367](https://github.com/sourcegraph/cody/pull/4367)
- vscode: Fixup empty section in command menu [#4365](https://github.com/sourcegraph/cody/pull/4365)
- "Initial context" @-mentions in chat input [#4364](https://github.com/sourcegraph/cody/pull/4364)
- Edit: fix @-mentions in the quick-pick menu [#4363](https://github.com/sourcegraph/cody/pull/4363)
- Edit: Fix indentation handling for text insertions [#4362](https://github.com/sourcegraph/cody/pull/4362)
- vscode: Fixup empty input detection [#4361](https://github.com/sourcegraph/cody/pull/4361)
- Cody PLG: Add Gemini 1.5 Pro and Gemini 1.5 Flash models [#4360](https://github.com/sourcegraph/cody/pull/4360)
- Document code: Add tree-sitter query for PHP [#4359](https://github.com/sourcegraph/cody/pull/4359)
- Document code: Add tree-sitter query for Rust [#4358](https://github.com/sourcegraph/cody/pull/4358)
- Document Code: Exclude local variables from getDocumentableNode in Java [#4357](https://github.com/sourcegraph/cody/pull/4357)
- Edit: Add Java support for expanding to the nearest enclosing function [#4356](https://github.com/sourcegraph/cody/pull/4356)
- Document code: Add tree-sitter query for Kotlin [#4355](https://github.com/sourcegraph/cody/pull/4355)
- Agent: add support for code actions and "Ask Cody to Fix" command [#4354](https://github.com/sourcegraph/cody/pull/4354)
- Document code: Add tree-sitter query for Java [#4353](https://github.com/sourcegraph/cody/pull/4353)
- Agent: remove redundant logs [#4352](https://github.com/sourcegraph/cody/pull/4352)
- Edit: Fix incorrect prompt used for enterprise chat models [#4350](https://github.com/sourcegraph/cody/pull/4350)
- Agent: return more details in JSON-RPC error responses [#4349](https://github.com/sourcegraph/cody/pull/4349)
- Clean up message input styles [#4347](https://github.com/sourcegraph/cody/pull/4347)
- fix "Try again with different context:" failure due to telemetryRecorder misuse [#4346](https://github.com/sourcegraph/cody/pull/4346)
- Fix Sourcegraph Repositories Search Context Provider for enterprise [#4345](https://github.com/sourcegraph/cody/pull/4345)
- Upgrade to Openctx client @ 0.0.15 [#4344](https://github.com/sourcegraph/cody/pull/4344)
- Add Sourcegraph File Context for Enterprise [#4343](https://github.com/sourcegraph/cody/pull/4343)
- Add initial test suite for Chat response quality [#4342](https://github.com/sourcegraph/cody/pull/4342)
- Print only a prefix of very long selections in the debug logs [#4340](https://github.com/sourcegraph/cody/pull/4340)
- Rename smartContext to smartContextWindow [#4339](https://github.com/sourcegraph/cody/pull/4339)
- Update BFG version [#4338](https://github.com/sourcegraph/cody/pull/4338)
- Update "Repositories" to "Sourcegraph Repositories" [#4337](https://github.com/sourcegraph/cody/pull/4337)
- Add @-mention provider icons [#4336](https://github.com/sourcegraph/cody/pull/4336)
- Fix selection range for empty files [#4335](https://github.com/sourcegraph/cody/pull/4335)
- Generate Unit Test: move integration test to separate file [#4332](https://github.com/sourcegraph/cody/pull/4332)
- Agent: improve local development workflows [#4331](https://github.com/sourcegraph/cody/pull/4331)
- Agent: implement more parts of the VS Code shim [#4330](https://github.com/sourcegraph/cody/pull/4330)
- Refactor: move `CommandResult` out of `vscode/src/main.ts` [#4329](https://github.com/sourcegraph/cody/pull/4329)
- Polly: fix bug where `'fs'` persister didn't pick up config [#4328](https://github.com/sourcegraph/cody/pull/4328)
- Agent: document pitfall in the agent readme [#4327](https://github.com/sourcegraph/cody/pull/4327)
- Custom Commands: move agent integration tests to separate file [#4326](https://github.com/sourcegraph/cody/pull/4326)
- Document Code: Always expand to the start of a line as a fallback [#4325](https://github.com/sourcegraph/cody/pull/4325)
- Document Code: move tests to separate workspace [#4324](https://github.com/sourcegraph/cody/pull/4324)
- Document Code: move integration tests to dedicated file [#4322](https://github.com/sourcegraph/cody/pull/4322)
- Add commands for local openctx dev [#4320](https://github.com/sourcegraph/cody/pull/4320)
- support pasting @-mentions in chat input [#4319](https://github.com/sourcegraph/cody/pull/4319)
- "Try again with different context" in assistant messages [#4317](https://github.com/sourcegraph/cody/pull/4317)
- Update changelog [#4316](https://github.com/sourcegraph/cody/pull/4316)
- OpenCtx: use `mention.description` if available [#4315](https://github.com/sourcegraph/cody/pull/4315)
- Agent: send notification about document sync issue to client instead of panicking [#4314](https://github.com/sourcegraph/cody/pull/4314)
- fix bug preventing vertically scrolling of long messages in the input [#4313](https://github.com/sourcegraph/cody/pull/4313)
- Agent: update access token HTTP recordings [#4312](https://github.com/sourcegraph/cody/pull/4312)
- Implement @-mention multi-repo OpenCtx context provider for enterprise [#4311](https://github.com/sourcegraph/cody/pull/4311)
- Agent: close P0 memory leak on `textDocument/didChange` [#4310](https://github.com/sourcegraph/cody/pull/4310)
- remove "(by OpenCtx)" in @-mention menu [#4309](https://github.com/sourcegraph/cody/pull/4309)
- OpenCtx: allow spaces in mentions [#4307](https://github.com/sourcegraph/cody/pull/4307)
- fix chat input colors on light themes [#4306](https://github.com/sourcegraph/cody/pull/4306)
- focus followup input after sending chat message [#4305](https://github.com/sourcegraph/cody/pull/4305)
- Test Command: error on empty selection [#4304](https://github.com/sourcegraph/cody/pull/4304)
- New chat welcome view [#4303](https://github.com/sourcegraph/cody/pull/4303)
- misc improvements to chat storybooks and removing unused chat-related code/styles [#4302](https://github.com/sourcegraph/cody/pull/4302)
- rm unnecessary e2e test [#4301](https://github.com/sourcegraph/cody/pull/4301)
- Agent: add `mode` parameter to editCommands/code [#4298](https://github.com/sourcegraph/cody/pull/4298)
- Makes "undefined" check more resillient [#4297](https://github.com/sourcegraph/cody/pull/4297)
- Reseting document content properties is happening too late in the code [#4296](https://github.com/sourcegraph/cody/pull/4296)
- fix styling for bullet lists [#4294](https://github.com/sourcegraph/cody/pull/4294)
- Chat: Include editor selection in chat context by default [#4292](https://github.com/sourcegraph/cody/pull/4292)
- Agent: soften panic assertions [#4291](https://github.com/sourcegraph/cody/pull/4291)
- Rewrite query for remote context [#4290](https://github.com/sourcegraph/cody/pull/4290)
- Agent: disable panic check for visibility ranges [#4288](https://github.com/sourcegraph/cody/pull/4288)
- Agent: add mode to panic when server/client go out of sync [#4287](https://github.com/sourcegraph/cody/pull/4287)
- Agent: handle `null` values where we previously only handled `undefined` [#4286](https://github.com/sourcegraph/cody/pull/4286)
- Include access token when exporting traces for enterprise [#4285](https://github.com/sourcegraph/cody/pull/4285)
- Cody Context Filters: update labels [#4284](https://github.com/sourcegraph/cody/pull/4284)
- Agent: make AgentWorkspaceDocuments more robust [#4279](https://github.com/sourcegraph/cody/pull/4279)
- Fix contentChanges emptines check [#4278](https://github.com/sourcegraph/cody/pull/4278)
- Improve incremental document update [#4277](https://github.com/sourcegraph/cody/pull/4277)
- added a much-needed run config for spawning the Agent [#4276](https://github.com/sourcegraph/cody/pull/4276)
- VS Code: Release 1.18.2 [#4275](https://github.com/sourcegraph/cody/pull/4275)
- VS Code: Release 1.18.1 [#4274](https://github.com/sourcegraph/cody/pull/4274)
- Move inline edit tests to separate file [#4272](https://github.com/sourcegraph/cody/pull/4272)
- LSP context: deterministic test snapshots [#4271](https://github.com/sourcegraph/cody/pull/4271)
- Instrument embedding startup and load in VSCode [#4269](https://github.com/sourcegraph/cody/pull/4269)
- allow copy-to-clipboard of chat response while still streaming [#4268](https://github.com/sourcegraph/cody/pull/4268)
- fix jumpy scroll when submitting followup [#4265](https://github.com/sourcegraph/cody/pull/4265)
- Edit: do not inject responsePrefix on typewriter.update() [#4264](https://github.com/sourcegraph/cody/pull/4264)
- Remove unused RemoteSearch methods [#4263](https://github.com/sourcegraph/cody/pull/4263)
- Test Command: Fix issue with inserting test file name with unit test [#4262](https://github.com/sourcegraph/cody/pull/4262)
- Move auto-accept logic from Agent to client for now, workaround for Issue 315 for GA [#4261](https://github.com/sourcegraph/cody/pull/4261)
- E2E: remove isMacOS check for Alt+L keybind test [#4260](https://github.com/sourcegraph/cody/pull/4260)
- bugfix/ci: Split `test:e2e` to remove bash script [#4259](https://github.com/sourcegraph/cody/pull/4259)
- Unit Test Command: insert  language name to prompt [#4258](https://github.com/sourcegraph/cody/pull/4258)
- Fix the range calculation issues & add more tests on tacked range and changes [#4256](https://github.com/sourcegraph/cody/pull/4256)
- Keybind: Alt + L for starting new chat with @-selection [#4255](https://github.com/sourcegraph/cody/pull/4255)
- Chat model selector cleanups [#4254](https://github.com/sourcegraph/cody/pull/4254)
- message editor toolbar improvements to send buttons and auto code context [#4252](https://github.com/sourcegraph/cody/pull/4252)
- fix web css to use new vscode themes [#4251](https://github.com/sourcegraph/cody/pull/4251)
- fix alt/opt+enter (should submit w/o enhanced context) [#4250](https://github.com/sourcegraph/cody/pull/4250)
- do not open enhanced context popover by default on new installs [#4248](https://github.com/sourcegraph/cody/pull/4248)
- openctx: store mention specific fields separately [#4247](https://github.com/sourcegraph/cody/pull/4247)
- adding FIM finetuned model hosted on fireworks [#4245](https://github.com/sourcegraph/cody/pull/4245)
- Update description and messaging [#4244](https://github.com/sourcegraph/cody/pull/4244)
- Fix: Graphql Fetching blockage when Cody tries to load a cached proxy that can only be loaded behind a proxy [#4243](https://github.com/sourcegraph/cody/pull/4243)
- Fix "Add Selection to Cody Chat" context menu item enablement issue [#4242](https://github.com/sourcegraph/cody/pull/4242)
- Context observability - more metrics [#4240](https://github.com/sourcegraph/cody/pull/4240)
- Update completion provider extension list [#4239](https://github.com/sourcegraph/cody/pull/4239)
- Replace provider id with OpenCtx for at-mention event names [#4238](https://github.com/sourcegraph/cody/pull/4238)
- Enterprise: add support for smart context in enterprise LLM configura… [#4236](https://github.com/sourcegraph/cody/pull/4236)
- Fix: Reload auth status when proxy settings is invalid [#4233](https://github.com/sourcegraph/cody/pull/4233)
- Update: add missing changelog entry for pr4229 [#4231](https://github.com/sourcegraph/cody/pull/4231)
- Chat: prioritize user-added context items [#4229](https://github.com/sourcegraph/cody/pull/4229)
- openctx: use the exact mention.uri for items [#4228](https://github.com/sourcegraph/cody/pull/4228)
- Add support for providing visible range by clients [#4226](https://github.com/sourcegraph/cody/pull/4226)
- use same fonts in storybooks and web [#4218](https://github.com/sourcegraph/cody/pull/4218)
- remove needless shadcn component animations [#4217](https://github.com/sourcegraph/cody/pull/4217)
- if no @-mention query, don't try to run query [#4216](https://github.com/sourcegraph/cody/pull/4216)
- remove needless ComboBox abstraction [#4214](https://github.com/sourcegraph/cody/pull/4214)
- factor out transcript message cells into {Human,Assistant}MessageCell [#4213](https://github.com/sourcegraph/cody/pull/4213)
- fix incorrect PR link in changelog entry [#4212](https://github.com/sourcegraph/cody/pull/4212)
- add cli subproject to root tsconfig [#4211](https://github.com/sourcegraph/cody/pull/4211)
- show LLM avatar in chat transcript while message is loading [#4210](https://github.com/sourcegraph/cody/pull/4210)
- new transcript/message "stream" UI [#4209](https://github.com/sourcegraph/cody/pull/4209)
- remove unused EnhancedContextSettings prop isNewInstall [#4208](https://github.com/sourcegraph/cody/pull/4208)
- sort directory context files for determinism [#4206](https://github.com/sourcegraph/cody/pull/4206)
- bump @openctx/vscode-lib to 0.0.3 [#4205](https://github.com/sourcegraph/cody/pull/4205)
- Increase the output window tokens for known-good enterprise models [#4203](https://github.com/sourcegraph/cody/pull/4203)
- add v2 telemetry for `...usageLimitCta...` events [#4202](https://github.com/sourcegraph/cody/pull/4202)
- Present at-mention context providers from OpenCtx [#4201](https://github.com/sourcegraph/cody/pull/4201)
- use simpler way of loading OpenCtx (for mentions/context) [#4200](https://github.com/sourcegraph/cody/pull/4200)
- Switch to lucide icon set (from heroicons) [#4198](https://github.com/sourcegraph/cody/pull/4198)
- Simplify upstream latency collector and measure gateway latency [#4193](https://github.com/sourcegraph/cody/pull/4193)
- Add feature flag to reduce debounce time [#4191](https://github.com/sourcegraph/cody/pull/4191)
- support changing chat model after chat session has begun [#4189](https://github.com/sourcegraph/cody/pull/4189)
- show types of context in @-mention menu [#4188](https://github.com/sourcegraph/cody/pull/4188)
- VS Code: Release 1.18.0 [#4185](https://github.com/sourcegraph/cody/pull/4185)
- Bump BFG version [#4183](https://github.com/sourcegraph/cody/pull/4183)
- Increase GPT4o context size budget [#4180](https://github.com/sourcegraph/cody/pull/4180)
- VS Code: remove extension dependencies [#4179](https://github.com/sourcegraph/cody/pull/4179)
- log errors from Google Gemini API [#4176](https://github.com/sourcegraph/cody/pull/4176)
- update google gemini 1.5 pro support (experimental model) [#4174](https://github.com/sourcegraph/cody/pull/4174)
- update `cody.chatResponse`'s `metadata` to include `lineCount` & `charCount` [#4173](https://github.com/sourcegraph/cody/pull/4173)
- Edit: Process streamed insertions in queue and fix range expansion [#4172](https://github.com/sourcegraph/cody/pull/4172)
- Cody Ignore: Default to allowing files for dotcom until the policy is fetched [#4168](https://github.com/sourcegraph/cody/pull/4168)
- Provide contrast for loading dots and context item links in high-contrast-light theme [#4167](https://github.com/sourcegraph/cody/pull/4167)
- Cody PLG: Add GPT-4o to model list [#4164](https://github.com/sourcegraph/cody/pull/4164)
- Clear rate limit error after reset timeout [#4161](https://github.com/sourcegraph/cody/pull/4161)
- Implement tail sampling on the client [#4160](https://github.com/sourcegraph/cody/pull/4160)
- Fix release changelog script [#4159](https://github.com/sourcegraph/cody/pull/4159)
- VS Code: use `enablement` for Cody commands [#4155](https://github.com/sourcegraph/cody/pull/4155)
- space key no longer triggers commit of selected mention item [#4154](https://github.com/sourcegraph/cody/pull/4154)
- Add back socket reuse test [#4148](https://github.com/sourcegraph/cody/pull/4148)
- Use SRC_ACCESS_TOKEN in scip-typescript uploads [#4146](https://github.com/sourcegraph/cody/pull/4146)
- Measure upstream health and attach median to autocomplete events [#4145](https://github.com/sourcegraph/cody/pull/4145)
- Explain the warning icon in repo picker [#4143](https://github.com/sourcegraph/cody/pull/4143)
- Do not send uuid-named temp files to the client [#4142](https://github.com/sourcegraph/cody/pull/4142)
- Remove insertion logger from v1 telemetry [#4141](https://github.com/sourcegraph/cody/pull/4141)
- dev: Add Storybook VS Code theme switcher [#4134](https://github.com/sourcegraph/cody/pull/4134)
- Update chat model category labels [#4133](https://github.com/sourcegraph/cody/pull/4133)
- Cody Ignore: remove git CLI repo-name resolver [#4132](https://github.com/sourcegraph/cody/pull/4132)
- fix needs-cody-pro model selector bugs [#4131](https://github.com/sourcegraph/cody/pull/4131)
- Command: new experimental command for generating commit messages [#4130](https://github.com/sourcegraph/cody/pull/4130)
- slightly clearer message in context popover for git repo subdirs [#4128](https://github.com/sourcegraph/cody/pull/4128)
- allow scrolling with mouse of chat message editor [#4127](https://github.com/sourcegraph/cody/pull/4127)
- keep quickpicks (esp for edit) open if focus is lost [#4126](https://github.com/sourcegraph/cody/pull/4126)
- Context: Update code template for selection [#4123](https://github.com/sourcegraph/cody/pull/4123)
- VS Code: Release 1.16.7 [#4122](https://github.com/sourcegraph/cody/pull/4122)
- Remove illegal characters from V2 telemetry naming [#4118](https://github.com/sourcegraph/cody/pull/4118)
- VS Code: Release 1.16.6 [#4117](https://github.com/sourcegraph/cody/pull/4117)
- Show latest pr & issues automatically in options list [#4116](https://github.com/sourcegraph/cody/pull/4116)
- Cody Ignore: remove the Git extension shim [#4115](https://github.com/sourcegraph/cody/pull/4115)
- Cody Ignore: git extension changelog entry [#4114](https://github.com/sourcegraph/cody/pull/4114)
- Edit: Add maximum timeout to formatter logic [#4113](https://github.com/sourcegraph/cody/pull/4113)
- Tutorial: Remove partial code from tutorial [#4112](https://github.com/sourcegraph/cody/pull/4112)
- Edit: Fix incorrect formatting with certain formatters [#4111](https://github.com/sourcegraph/cody/pull/4111)
- Cody Ignore: activate the `vscode.git` before Cody extension via `ensionDependencies` [#4110](https://github.com/sourcegraph/cody/pull/4110)
- VS Code: Release 1.16.5 [#4109](https://github.com/sourcegraph/cody/pull/4109)
- Tutorial: Handle auth __after__ we sync [#4108](https://github.com/sourcegraph/cody/pull/4108)
- Cody Ignore: upgrade test dataset package [#4106](https://github.com/sourcegraph/cody/pull/4106)
- Cody Ignore: integrate shared testing dataset [#4105](https://github.com/sourcegraph/cody/pull/4105)
- Ollama: buffer incomplete response chunks [#4103](https://github.com/sourcegraph/cody/pull/4103)
- fix typos and simplify keyboard shortcut mention [#4100](https://github.com/sourcegraph/cody/pull/4100)
- VS Code: Release 1.16.4 [#4099](https://github.com/sourcegraph/cody/pull/4099)
- Edit: Improve Rejection Tracker. Handle file deletions and formatters [#4097](https://github.com/sourcegraph/cody/pull/4097)
- VS Code: Release 1.16.3 [#4096](https://github.com/sourcegraph/cody/pull/4096)
- TSC Graph Context: fix performance [#4095](https://github.com/sourcegraph/cody/pull/4095)
- Chat UI: Adjust user avatar height to fit content [#4094](https://github.com/sourcegraph/cody/pull/4094)
- Automatically start Embeddings indexing [#4091](https://github.com/sourcegraph/cody/pull/4091)
- Enterprise Cody Ignore: E2E test [#4090](https://github.com/sourcegraph/cody/pull/4090)
- Fix undefined files handling for non-vsc editors [#4088](https://github.com/sourcegraph/cody/pull/4088)
- TreeViewProvider: Do not refresh on init [#4087](https://github.com/sourcegraph/cody/pull/4087)
- Edit: Strip HTML entities before applying response [#4085](https://github.com/sourcegraph/cody/pull/4085)
- Chat: exclude history items from UI [#4083](https://github.com/sourcegraph/cody/pull/4083)
- Search: Add refresh buttons to Search Code menu [#4081](https://github.com/sourcegraph/cody/pull/4081)
- update: use toRangeData utility for range conversion [#4080](https://github.com/sourcegraph/cody/pull/4080)
- VSCode: Update extension metadata [#4079](https://github.com/sourcegraph/cody/pull/4079)
- Skip logging empty context status [#4078](https://github.com/sourcegraph/cody/pull/4078)
- [Bug Fix] Naming of v2 telemetry events and update `writeCompletionEvent` helper function [Easy Review] [#4077](https://github.com/sourcegraph/cody/pull/4077)
- TSC Graph Context: revamp snippet collection [#4076](https://github.com/sourcegraph/cody/pull/4076)
- Add more unit tests for PromptBuilder [#4075](https://github.com/sourcegraph/cody/pull/4075)
- Agent - adding support for proxies(Repeat PR) [#4073](https://github.com/sourcegraph/cody/pull/4073)
- git repo name logs for public repos [#4072](https://github.com/sourcegraph/cody/pull/4072)
- Edit Input: Trigger doc and test commands in 1 click [#4071](https://github.com/sourcegraph/cody/pull/4071)
- Cody Ignore: sample repo-name-resolver spans [#4069](https://github.com/sourcegraph/cody/pull/4069)
- Interactive Tutorial: Add telemetry, improve command, and adjust flag logic [#4068](https://github.com/sourcegraph/cody/pull/4068)
- Agent: clean up HTTP recording tech debt [#4067](https://github.com/sourcegraph/cody/pull/4067)
- Ollama: handle incomplete response chunks [#4066](https://github.com/sourcegraph/cody/pull/4066)
- VS Code: Release 1.16.2 [#4064](https://github.com/sourcegraph/cody/pull/4064)
- do not log e2e telemetry in release actions [#4063](https://github.com/sourcegraph/cody/pull/4063)
- swallow hidePopover exception [#4062](https://github.com/sourcegraph/cody/pull/4062)
- Fix various small bugs related to inline edits [#4061](https://github.com/sourcegraph/cody/pull/4061)
- Hide ignored files that come back from the remote-search endpoint [#4060](https://github.com/sourcegraph/cody/pull/4060)
- Enterprise Cody Ignore: Highlight ignored repos in the repo picker [#4059](https://github.com/sourcegraph/cody/pull/4059)
- Agent: add incremental document syncing and fire content changes [#4058](https://github.com/sourcegraph/cody/pull/4058)
- Make graph-context tests faster and less flaky [#4057](https://github.com/sourcegraph/cody/pull/4057)
- Use unit test for starcoder-hybrid trigger kind logic [#4056](https://github.com/sourcegraph/cody/pull/4056)
- only run ubuntu e2e tests on PR push, run all on main [#4055](https://github.com/sourcegraph/cody/pull/4055)
- handle mention ranges in the parser more cleanly [#4053](https://github.com/sourcegraph/cody/pull/4053)
- use cmdk for existing @-mention UI [#4051](https://github.com/sourcegraph/cody/pull/4051)
- use clsx instead of classnames [#4050](https://github.com/sourcegraph/cody/pull/4050)
- add experimental vscode command to get completions from multiple models [#4048](https://github.com/sourcegraph/cody/pull/4048)
- Cody standalone web app prototype and dev helper [#4047](https://github.com/sourcegraph/cody/pull/4047)
- Chat: Fix editor selection retrieval from context menu [#4046](https://github.com/sourcegraph/cody/pull/4046)
- promptEditor: ensure exhaustive handling of ContextItem.type [#4044](https://github.com/sourcegraph/cody/pull/4044)
- Enterprise Cody Ignore: Show Ignored Repo in Context List [#4042](https://github.com/sourcegraph/cody/pull/4042)
- Followup to bad merge [#4041](https://github.com/sourcegraph/cody/pull/4041)
- Add Google Authentication for `vscode-insiders-release.yml` [#4040](https://github.com/sourcegraph/cody/pull/4040)
- Autocomplete: force 17b on explicit autocomplete with starcoder-hybrid [#4039](https://github.com/sourcegraph/cody/pull/4039)
- Edit: Fix persistence intent tracking data [#4037](https://github.com/sourcegraph/cody/pull/4037)
- Add command to debug context filters [#4035](https://github.com/sourcegraph/cody/pull/4035)
- rename {C => c}omponents dir [#4034](https://github.com/sourcegraph/cody/pull/4034)
- partially implement new model selector design [#4033](https://github.com/sourcegraph/cody/pull/4033)
- Cody Ignore: Show Ignored file status in @-mentions [#4032](https://github.com/sourcegraph/cody/pull/4032)
- Edit: Support trimming active selections to a tree-sitter node [#4031](https://github.com/sourcegraph/cody/pull/4031)
- Edit: Disable streaming for 'Add' insertions in Agent [#4030](https://github.com/sourcegraph/cody/pull/4030)
- TSC Graph Context: remove `typescript` from bundle [#4029](https://github.com/sourcegraph/cody/pull/4029)
- VS Code: Release 1.16.1 [#4028](https://github.com/sourcegraph/cody/pull/4028)
- remove drop shadow on model selector experimental label [#4026](https://github.com/sourcegraph/cody/pull/4026)
- Check for version number before contextFilter request [#4025](https://github.com/sourcegraph/cody/pull/4025)
- Cody Ignore: Treat unterminated JSON responses as an outdated API error message [#4024](https://github.com/sourcegraph/cody/pull/4024)
- Remove caching and unnecessery code from didFocus [#4023](https://github.com/sourcegraph/cody/pull/4023)
- TSC Graph Context: handle property access [#4022](https://github.com/sourcegraph/cody/pull/4022)
- PromptString: Fix linter spam by only commenting on the PR once [#4019](https://github.com/sourcegraph/cody/pull/4019)
- Send client-name, client-version query string parameters to completions [#4018](https://github.com/sourcegraph/cody/pull/4018)
- Fix CODY-1327 - get Kotlin bindings working again [#4017](https://github.com/sourcegraph/cody/pull/4017)
- Agent: Create dir if not exists when writeFile is called [#4016](https://github.com/sourcegraph/cody/pull/4016)
- Disable noRedeclare to prevent Biome crash [#4015](https://github.com/sourcegraph/cody/pull/4015)
- Ensure Biome never crashes by checking the CI for a bad phrase [#4013](https://github.com/sourcegraph/cody/pull/4013)
- Agent: fix `pnpm generate-agent-kotlin-bindings` [#4012](https://github.com/sourcegraph/cody/pull/4012)
- Finished up Edit/Retry, including showing prompt for Document Code [#4010](https://github.com/sourcegraph/cody/pull/4010)
- VS Code: Release 1.16.0 [#4006](https://github.com/sourcegraph/cody/pull/4006)
- Cody Agent: make HTTP recording file smaller [#4004](https://github.com/sourcegraph/cody/pull/4004)
- Interactive Tutorial: Add telemetry and improve unhappy paths [#4003](https://github.com/sourcegraph/cody/pull/4003)
- Inline Edit: add minimized test case for bug report [#4001](https://github.com/sourcegraph/cody/pull/4001)
- Chat: add commands to send file and selection context from editor [#4000](https://github.com/sourcegraph/cody/pull/4000)
- fix 'incorrect casing' warning in tests for Transcript [#3999](https://github.com/sourcegraph/cody/pull/3999)
- use title (if present) as label for @-mentions [#3998](https://github.com/sourcegraph/cody/pull/3998)
- add OpenCtx context mention provider [#3997](https://github.com/sourcegraph/cody/pull/3997)
- Alt/Opt+Enter submits a chat message without enhanced context [#3996](https://github.com/sourcegraph/cody/pull/3996)
- Cheapen CI workflow by running macOS for main commits only [#3994](https://github.com/sourcegraph/cody/pull/3994)
- Add Github as at-mention context source for issues & pull requests [#3992](https://github.com/sourcegraph/cody/pull/3992)
- Search: Move Natural Language Search (Beta) to QuickPick [#3991](https://github.com/sourcegraph/cody/pull/3991)
- telemetry-v2: add Biome lint rule and update telemetry architecture docs [#3990](https://github.com/sourcegraph/cody/pull/3990)
- remove hover.ts [#3987](https://github.com/sourcegraph/cody/pull/3987)
- noodle: Explain Code History command [#3985](https://github.com/sourcegraph/cody/pull/3985)
- Fix termination code for the 'undo' of edit action [#3984](https://github.com/sourcegraph/cody/pull/3984)
- TSC Graph Context: add more non-snapshot assertions [#3982](https://github.com/sourcegraph/cody/pull/3982)
- TSC Graph Context: add JS/TSX tests [#3981](https://github.com/sourcegraph/cody/pull/3981)
- Fix sourcegraph search import paths [#3979](https://github.com/sourcegraph/cody/pull/3979)
- Chat: Fix chat title that starts with new line [#3977](https://github.com/sourcegraph/cody/pull/3977)
- Cody PLG: Reload auth on window focus change [#3976](https://github.com/sourcegraph/cody/pull/3976)
- adding finetuned model for code completions [#3975](https://github.com/sourcegraph/cody/pull/3975)
- Implement V2 telemetry validation in E2E Tests [#3974](https://github.com/sourcegraph/cody/pull/3974)
- Upgrade users from Claude 2 to Claude 3 and remove Claude 2 [#3971](https://github.com/sourcegraph/cody/pull/3971)
- Fix CodyTaskState serialization/deserialization issues [#3968](https://github.com/sourcegraph/cody/pull/3968)
- Use new version of symf with expanded query param [#3967](https://github.com/sourcegraph/cody/pull/3967)
- new popover impl for model dropdown [#3965](https://github.com/sourcegraph/cody/pull/3965)
- Custom Command: update context options [#3962](https://github.com/sourcegraph/cody/pull/3962)
- Disable telemetry in all agent tests [#3960](https://github.com/sourcegraph/cody/pull/3960)
- noodle: sourcegraph search also uses ? as a trigger prefix [#3958](https://github.com/sourcegraph/cody/pull/3958)
- noodle: include patternType in search URL [#3957](https://github.com/sourcegraph/cody/pull/3957)
- Cody PLG: increase token budget for Claude 3 models w/o feature flag [#3953](https://github.com/sourcegraph/cody/pull/3953)
- Record embedding provider on embedding span [#3949](https://github.com/sourcegraph/cody/pull/3949)
- Remove double-bundling of some lib/shared files [#3947](https://github.com/sourcegraph/cody/pull/3947)
- Cody Ignore: Tidy up context filter overrides [#3946](https://github.com/sourcegraph/cody/pull/3946)
- ContextFilters: Return block reason and expose current state for logging purposes [#3944](https://github.com/sourcegraph/cody/pull/3944)
- Move TelemetryRecorder singleton into lib/shared [#3943](https://github.com/sourcegraph/cody/pull/3943)
- PromptString: Log blocked references [#3942](https://github.com/sourcegraph/cody/pull/3942)
- Chat: remove capitalization from model names [#3940](https://github.com/sourcegraph/cody/pull/3940)
- "Usage Examples" Cody command [#3939](https://github.com/sourcegraph/cody/pull/3939)
- Cody Ignore: agent integration [#3937](https://github.com/sourcegraph/cody/pull/3937)
- remove needless escapes of `/` in regexp patterns [#3936](https://github.com/sourcegraph/cody/pull/3936)
- use pure-JS RE2 impl instead of re2-wasm [#3935](https://github.com/sourcegraph/cody/pull/3935)
- Cody Ignore: Do not block context with http/s URIs [#3934](https://github.com/sourcegraph/cody/pull/3934)
- Remove Commands on Hover [#3933](https://github.com/sourcegraph/cody/pull/3933)
- Walkthrough: local Ollama models [#3932](https://github.com/sourcegraph/cody/pull/3932)
- Trace local embedding search error [#3930](https://github.com/sourcegraph/cody/pull/3930)
- Chat: deduplicate chat context [#3929](https://github.com/sourcegraph/cody/pull/3929)
- shim re2-wasm to fix storybook [#3927](https://github.com/sourcegraph/cody/pull/3927)
- noodle: introduce sourcegraph literal search mentions provider [#3925](https://github.com/sourcegraph/cody/pull/3925)
- Cody Ignore: windows unit test debug [#3924](https://github.com/sourcegraph/cody/pull/3924)
- Cody Ignore: context filters change notification [#3923](https://github.com/sourcegraph/cody/pull/3923)
- Cody Ignore: do not use locally resolved repo names [#3922](https://github.com/sourcegraph/cody/pull/3922)
- Add missing generated Kotlin stubs for `ignore/test` [#3921](https://github.com/sourcegraph/cody/pull/3921)
- Enable Ollama Chat by default [#3914](https://github.com/sourcegraph/cody/pull/3914)
- Enterprise Cody Ignore UI  [#3911](https://github.com/sourcegraph/cody/pull/3911)
- Fix repo name resolver [#3910](https://github.com/sourcegraph/cody/pull/3910)
- Telemetry: chat responses without code [#3909](https://github.com/sourcegraph/cody/pull/3909)
- shared: port markdown tests for renderCodyMarkdown [#3908](https://github.com/sourcegraph/cody/pull/3908)
- test and support node 18 (no longer node 16) [#3907](https://github.com/sourcegraph/cody/pull/3907)
- fix "Updating Cody search index for" message [#3903](https://github.com/sourcegraph/cody/pull/3903)
- Turn on aggressive sampling for Sentry [#3900](https://github.com/sourcegraph/cody/pull/3900)
- Supercompletions: Implement context filter [#3899](https://github.com/sourcegraph/cody/pull/3899)
- Invert ContextFiltersProvider.prototype.isUriAllowed logic [#3898](https://github.com/sourcegraph/cody/pull/3898)
- Autocomplete: Implement context filter [#3897](https://github.com/sourcegraph/cody/pull/3897)
- Cody Ignore: support multiple remote URLs [#3895](https://github.com/sourcegraph/cody/pull/3895)
- VS Code: clarify ignore/exclude everything constants [#3892](https://github.com/sourcegraph/cody/pull/3892)
- make our shim URI more like VS Code's URI [#3890](https://github.com/sourcegraph/cody/pull/3890)
- import instead of require for web-tree-sitter [#3889](https://github.com/sourcegraph/cody/pull/3889)
- fix nested react hook usage and only have 1 editor mutation listener [#3887](https://github.com/sourcegraph/cody/pull/3887)
- do not show the context file line count in chat context [#3886](https://github.com/sourcegraph/cody/pull/3886)
- remove misleading `| undefined` return for editor file content [#3885](https://github.com/sourcegraph/cody/pull/3885)
- add back URL mention e2e test [#3884](https://github.com/sourcegraph/cody/pull/3884)
- introduce ContextMentionProvider API for mentionable context sources [#3883](https://github.com/sourcegraph/cody/pull/3883)
- adding context snippets and the repo name in the context summary [#3882](https://github.com/sourcegraph/cody/pull/3882)
- Chat: refactor Ollama chat client [#3881](https://github.com/sourcegraph/cody/pull/3881)
- Chat: minor clean up [#3878](https://github.com/sourcegraph/cody/pull/3878)
- Upgrade vitest, vite, and some types [#3876](https://github.com/sourcegraph/cody/pull/3876)
- Agent: add `server` subcommand to expose agent protocol via websockets [#3875](https://github.com/sourcegraph/cody/pull/3875)
- Agent: don't error on empty HAR log entries [#3874](https://github.com/sourcegraph/cody/pull/3874)
- Remove debug.enable flag [#3873](https://github.com/sourcegraph/cody/pull/3873)
- Edit: Fix respins not restarting a edit [#3872](https://github.com/sourcegraph/cody/pull/3872)
- Remove startcoder2-hybrid from settings [#3871](https://github.com/sourcegraph/cody/pull/3871)
- VS Code: remote repo name resolution [#3870](https://github.com/sourcegraph/cody/pull/3870)
- Move Account to top of sidebar, add username param [#3868](https://github.com/sourcegraph/cody/pull/3868)
- Implement @-mention package context [#3866](https://github.com/sourcegraph/cody/pull/3866)
- Fix: text-wrapping and code scrolling in chat views [#3865](https://github.com/sourcegraph/cody/pull/3865)
- Chat History: Fix 'N months ago' [#3864](https://github.com/sourcegraph/cody/pull/3864)
- Custom Command: add mode to command-creation [#3862](https://github.com/sourcegraph/cody/pull/3862)
- models: show default LLM first in dropdown [#3859](https://github.com/sourcegraph/cody/pull/3859)
- Elaborate the agent protocol for Cody Ignore [#3858](https://github.com/sourcegraph/cody/pull/3858)
- Update other completion providers list [#3857](https://github.com/sourcegraph/cody/pull/3857)
- Cody Ignore: Check reference violations at I/O boundaries [#3856](https://github.com/sourcegraph/cody/pull/3856)
- Reenable tests for editCommand/test [#3855](https://github.com/sourcegraph/cody/pull/3855)
- Run currentUser query in parallel [#3854](https://github.com/sourcegraph/cody/pull/3854)
- Bump BFG  [#3853](https://github.com/sourcegraph/cody/pull/3853)
- Add simple test for editCommands/code [#3852](https://github.com/sourcegraph/cody/pull/3852)
- Convert editCommands/code to a proper PromptString [#3851](https://github.com/sourcegraph/cody/pull/3851)
- Introduce a feature JSON tracking system [#3846](https://github.com/sourcegraph/cody/pull/3846)
- VS Code: Release 1.14.0 [#3845](https://github.com/sourcegraph/cody/pull/3845)
- Graph context: add tsc-mixed strategy [#3843](https://github.com/sourcegraph/cody/pull/3843)
- Chat: display line range for @-mentions [#3842](https://github.com/sourcegraph/cody/pull/3842)
- improve contrast of context links and at-mention colors in various VS Code themes [#3841](https://github.com/sourcegraph/cody/pull/3841)
- Log first ever authentication event [#3836](https://github.com/sourcegraph/cody/pull/3836)
- Move cursor to the right place when focusing on empty range from agent [#3833](https://github.com/sourcegraph/cody/pull/3833)
- Add a hover title to the LLM chat avatars [#3832](https://github.com/sourcegraph/cody/pull/3832)
- Code Actions: Improve labels to be more descriptive [#3831](https://github.com/sourcegraph/cody/pull/3831)
- Log chat properties with first-token span [#3830](https://github.com/sourcegraph/cody/pull/3830)
- Chat: Add chat model with more events [#3829](https://github.com/sourcegraph/cody/pull/3829)
- DX: do not error on `ENOENT` in safe prompt CI check [#3828](https://github.com/sourcegraph/cody/pull/3828)
- Telemetry: log context stats and update response log to use new limit [#3823](https://github.com/sourcegraph/cody/pull/3823)
- Chat: skip encoding of file links in webviews [#3818](https://github.com/sourcegraph/cody/pull/3818)
- Chat: render spacings for human messages [#3817](https://github.com/sourcegraph/cody/pull/3817)
- PromptString: Fix new chat from cody command pallete [#3811](https://github.com/sourcegraph/cody/pull/3811)
- PromptString linter: Only error when the reported violation is within one of the changed range [#3810](https://github.com/sourcegraph/cody/pull/3810)
- use vscode-jsonrpc library for JSON-RPC implementation [#3807](https://github.com/sourcegraph/cody/pull/3807)
- Custom Command: Fix new custom command not working on sidebar click [#3804](https://github.com/sourcegraph/cody/pull/3804)
- Support Sidebar: update Support link and Discord icon [#3803](https://github.com/sourcegraph/cody/pull/3803)
- Sidebar: add copy extension version command [#3802](https://github.com/sourcegraph/cody/pull/3802)
- E2E: add click interaction for index.html in command-custom test [#3801](https://github.com/sourcegraph/cody/pull/3801)
- Telemetry: add sessionID to properties for Chat events [#3800](https://github.com/sourcegraph/cody/pull/3800)
- Chat: Remove fusion experiment and run context fetching in parallel [#3798](https://github.com/sourcegraph/cody/pull/3798)
- Chat/Commands: Increase output token limit for PLG [#3797](https://github.com/sourcegraph/cody/pull/3797)
- Doc:  update QA dev guide [#3794](https://github.com/sourcegraph/cody/pull/3794)
- Fix undo/accept/cancel command calls [#3791](https://github.com/sourcegraph/cody/pull/3791)
- Enable GPT4 Turbo [#3790](https://github.com/sourcegraph/cody/pull/3790)
- Fix agent folding ranges API to use getEditSmartSelection [#3787](https://github.com/sourcegraph/cody/pull/3787)
- Chat: reveal hidden chat panel on @-selection [#3782](https://github.com/sourcegraph/cody/pull/3782)
- Chat: default Cody as model icon [#3776](https://github.com/sourcegraph/cody/pull/3776)
- Agent protocol and implementation for searching, listing, testing remote repository names [#3775](https://github.com/sourcegraph/cody/pull/3775)
- Chat: add chat client for Groq [#3774](https://github.com/sourcegraph/cody/pull/3774)
- Chat: Add Pop out CTA [#3773](https://github.com/sourcegraph/cody/pull/3773)
- VS Code: implement `ContextFiltersProvider.isUriAllowed` [#3771](https://github.com/sourcegraph/cody/pull/3771)
- update labeler to auto add bug labels [#3770](https://github.com/sourcegraph/cody/pull/3770)
- Agent - add support for proxies  [#3769](https://github.com/sourcegraph/cody/pull/3769)
- PLG: new Mixtral 8x22B Instruct model for chat [#3768](https://github.com/sourcegraph/cody/pull/3768)
- Edit: display warning for large @-mentions [#3767](https://github.com/sourcegraph/cody/pull/3767)
- Font: add Gemini icon [#3765](https://github.com/sourcegraph/cody/pull/3765)
- Ollama: update default context window [#3764](https://github.com/sourcegraph/cody/pull/3764)
- Generate Unit Tests: Add code action and smart range expansion [#3763](https://github.com/sourcegraph/cody/pull/3763)
- Chat: update token limit on model changes [#3762](https://github.com/sourcegraph/cody/pull/3762)
- Increase agent heap  memory [#3761](https://github.com/sourcegraph/cody/pull/3761)
- Remove unused token constants and increase Haiku limit [#3760](https://github.com/sourcegraph/cody/pull/3760)
- Edit (Test): Fix incorrect selection context [#3759](https://github.com/sourcegraph/cody/pull/3759)
- Chat: internal support for Google Gemini [#3758](https://github.com/sourcegraph/cody/pull/3758)
- Autocomplete: add file name and repeat_penalty for CodeGemma. [#3757](https://github.com/sourcegraph/cody/pull/3757)
- Autocomplete: Add Codegemma prompt to Ollama provider [#3754](https://github.com/sourcegraph/cody/pull/3754)
- Agent add support for Windows and Linux self signed certs.  [#3752](https://github.com/sourcegraph/cody/pull/3752)
- Add ldid as part of release action [#3751](https://github.com/sourcegraph/cody/pull/3751)
- Troubleshoot: Show auth connection issues [#3750](https://github.com/sourcegraph/cody/pull/3750)
- Fix compilation error [#3748](https://github.com/sourcegraph/cody/pull/3748)
- VS Code: add remote context filters provider [#3747](https://github.com/sourcegraph/cody/pull/3747)
- Chat: refactor context window + new FeatureFlag for User context [#3742](https://github.com/sourcegraph/cody/pull/3742)
- Remove unnecessary quote character from context templates [#3740](https://github.com/sourcegraph/cody/pull/3740)
- E2E Test: Add e2e test for the "Cody Chat: Add context" command [#3739](https://github.com/sourcegraph/cody/pull/3739)
- Add PromptString [#3734](https://github.com/sourcegraph/cody/pull/3734)
- Sidebar: fix custom commands on click [#3733](https://github.com/sourcegraph/cody/pull/3733)
- Chat: "Ask Cody" command on hover [#3732](https://github.com/sourcegraph/cody/pull/3732)
- Persistence Tracker: Treat removed events as `difference: 100` [#3731](https://github.com/sourcegraph/cody/pull/3731)
- Characters logger: Increase log interval and change v2 event name [#3730](https://github.com/sourcegraph/cody/pull/3730)
- Edit: Accurately track chars and lines added based on the diff [#3727](https://github.com/sourcegraph/cody/pull/3727)
- more retries for windows e2e tests [#3719](https://github.com/sourcegraph/cody/pull/3719)
- pass chatModels and onCurrentChatModelChange through React context [#3717](https://github.com/sourcegraph/cody/pull/3717)
- set noop acquireVsCodeApi in storybooks to avoid ugly console errors [#3716](https://github.com/sourcegraph/cody/pull/3716)
- more idiomatic use of VSCodeDropdown [#3715](https://github.com/sourcegraph/cody/pull/3715)
- Chat: add ability to send editor selection to chat as @-mention [#3713](https://github.com/sourcegraph/cody/pull/3713)
- Sidebar: sidebar command click [#3708](https://github.com/sourcegraph/cody/pull/3708)
- Edit: Add keybinding to sidebar for document [#3707](https://github.com/sourcegraph/cody/pull/3707)
- Onboarding: Add interactive walkthrough [#3705](https://github.com/sourcegraph/cody/pull/3705)
- fix path names for agent-release action [#3704](https://github.com/sourcegraph/cody/pull/3704)
- bump agent version to test release CI [#3703](https://github.com/sourcegraph/cody/pull/3703)
- longer e2e test timeout [#3701](https://github.com/sourcegraph/cody/pull/3701)
- Commands: Fix telemetry source usage [#3700](https://github.com/sourcegraph/cody/pull/3700)
- fix typo in agent release CI action [#3699](https://github.com/sourcegraph/cody/pull/3699)
- fix 'chat input focus' e2e test on VS Code 1.88.0+ [#3698](https://github.com/sourcegraph/cody/pull/3698)
- import from @sourcegraph/cody-shared not `/{src,dist}/...` subpath [#3697](https://github.com/sourcegraph/cody/pull/3697)
- Edit: Track events per diagnostic [#3692](https://github.com/sourcegraph/cody/pull/3692)
- Edit: Track rejection rate [#3691](https://github.com/sourcegraph/cody/pull/3691)
- E2E: Fix helper function for file opening [#3685](https://github.com/sourcegraph/cody/pull/3685)
- VS Code: Release 1.12.0 [#3684](https://github.com/sourcegraph/cody/pull/3684)
- Remove incorrect field for Issue Reporter [#3683](https://github.com/sourcegraph/cody/pull/3683)
- Command: Fix log format [#3678](https://github.com/sourcegraph/cody/pull/3678)
- Menu: hide disabled feature flag item [#3677](https://github.com/sourcegraph/cody/pull/3677)
- Add missing changelog entry [#3676](https://github.com/sourcegraph/cody/pull/3676)
- Telemetry: update menu clicks [#3675](https://github.com/sourcegraph/cody/pull/3675)
- Edit: Remove enrollment events for document ghost text [#3672](https://github.com/sourcegraph/cody/pull/3672)
- build and release cody-agent in CI [#3671](https://github.com/sourcegraph/cody/pull/3671)
- upgrade to storybook 8 [#3670](https://github.com/sourcegraph/cody/pull/3670)
- rm needless PromptEditor container [#3668](https://github.com/sourcegraph/cody/pull/3668)
- fix vscode theme CSS import regexp [#3667](https://github.com/sourcegraph/cody/pull/3667)
- use same font-family as @vscode/webview-ui-toolkit/react in storybooks for consistency [#3666](https://github.com/sourcegraph/cody/pull/3666)
- remove opacity from optionlist [#3665](https://github.com/sourcegraph/cody/pull/3665)
- Edit: Get models from model provider [#3659](https://github.com/sourcegraph/cody/pull/3659)
- Build v2 telemetry recorder for VSCode webviews [#3654](https://github.com/sourcegraph/cody/pull/3654)
- Add a document for capturing architecture guidance [#3653](https://github.com/sourcegraph/cody/pull/3653)
- VS Code: Release 1.10.2 [#3652](https://github.com/sourcegraph/cody/pull/3652)
- Chat: sync models at activation [#3650](https://github.com/sourcegraph/cody/pull/3650)
- Chat: Fix enhance context settings bug [#3647](https://github.com/sourcegraph/cody/pull/3647)
- Semgrep: improved Semgrep scan params, upgraded GH action version [#3644](https://github.com/sourcegraph/cody/pull/3644)
- factor out chat context e2e helpers [#3640](https://github.com/sourcegraph/cody/pull/3640)
- chat UI design improvements ("Cody Tomorrow") [#3639](https://github.com/sourcegraph/cody/pull/3639)
- rm unused styles in Chat and TranscriptItem [#3638](https://github.com/sourcegraph/cody/pull/3638)
- move TranscriptItem content styles to ChatMessageContent [#3635](https://github.com/sourcegraph/cody/pull/3635)
- mv FileLinkProps to FileLink [#3634](https://github.com/sourcegraph/cody/pull/3634)
- display storybooks with vscode-dark theme style variation [#3633](https://github.com/sourcegraph/cody/pull/3633)
- remove needless indirection of TranscriptItemClassNames [#3632](https://github.com/sourcegraph/cody/pull/3632)
- rename misnomer CodeBlocks -> ChatMessageContent [#3631](https://github.com/sourcegraph/cody/pull/3631)
- isNewInstall defaults to unknown (undefined) not true [#3630](https://github.com/sourcegraph/cody/pull/3630)
- fix name for CurrentSiteCodyLlmProvider GraphQL query [#3629](https://github.com/sourcegraph/cody/pull/3629)
- remove indirection in vscode webview React components [#3628](https://github.com/sourcegraph/cody/pull/3628)
- remove needless React.memo wrapper [#3627](https://github.com/sourcegraph/cody/pull/3627)
- fix always opening EnhancedContextSettings on first chat [#3626](https://github.com/sourcegraph/cody/pull/3626)
- clean up VS Code storybooks, make them use the default VS Code dark theme colors [#3625](https://github.com/sourcegraph/cody/pull/3625)
- Tree-sitter: capture docstring for documentable nodes [#3622](https://github.com/sourcegraph/cody/pull/3622)
- E2E Test: fix flaky custom command test [#3621](https://github.com/sourcegraph/cody/pull/3621)
- Chat: allow large file with range in @-mentions [#3619](https://github.com/sourcegraph/cody/pull/3619)
- remove LocalEnv unused fields & LocalAppDetector [#3617](https://github.com/sourcegraph/cody/pull/3617)
- Docs: remove Inline chat section from README [#3615](https://github.com/sourcegraph/cody/pull/3615)
- Chat: improve @mentions on input [#3606](https://github.com/sourcegraph/cody/pull/3606)
- Doc: patch release instructions [#3598](https://github.com/sourcegraph/cody/pull/3598)
- Symf: Add preamble [#3596](https://github.com/sourcegraph/cody/pull/3596)
- Edit: Log diagnostic code and source for fix commands [#3595](https://github.com/sourcegraph/cody/pull/3595)
- VS Code: release v1.10.1 [#3594](https://github.com/sourcegraph/cody/pull/3594)
- biome useNodejsImportProtocol (import `node:...` for nodejs builtins) [#3592](https://github.com/sourcegraph/cody/pull/3592)
- Edit: Remove old shortcut [#3591](https://github.com/sourcegraph/cody/pull/3591)
- Make `chat/models` request `chatID`-agnostic [#3588](https://github.com/sourcegraph/cody/pull/3588)
- Add logo to status bar sign in CTA [#3587](https://github.com/sourcegraph/cody/pull/3587)
- Feature Flag: Hover Commands [#3585](https://github.com/sourcegraph/cody/pull/3585)
- Log context clicks [#3581](https://github.com/sourcegraph/cody/pull/3581)
- E2E Test: Detect detached state instead of hidden [#3580](https://github.com/sourcegraph/cody/pull/3580)
- Edit: Use system prompt format [#3579](https://github.com/sourcegraph/cody/pull/3579)
- Enhanced Context: fix input button toggler [#3577](https://github.com/sourcegraph/cody/pull/3577)
- Remove Cody Pro JetBrains flag [#3576](https://github.com/sourcegraph/cody/pull/3576)
- Change PLG Chat default to Sonnet [#3575](https://github.com/sourcegraph/cody/pull/3575)
- Ship remove auth steps [#3574](https://github.com/sourcegraph/cody/pull/3574)
- Edit: Simplify mode by removing `add` [#3573](https://github.com/sourcegraph/cody/pull/3573)
- Edit: Default `doc` to Claude Haiku [#3572](https://github.com/sourcegraph/cody/pull/3572)
- rm now-invalid storybook option [#3570](https://github.com/sourcegraph/cody/pull/3570)
- Chat: Fix message input placeholder overflow [#3568](https://github.com/sourcegraph/cody/pull/3568)
- Chat: show enhanced context settings on first chat [#3567](https://github.com/sourcegraph/cody/pull/3567)
- Custom Commands: Show context command errors in the notification message for easier debugging [#3565](https://github.com/sourcegraph/cody/pull/3565)
- E2E Test: improve flaky tests [#3558](https://github.com/sourcegraph/cody/pull/3558)
- Add size limit when logging chat transcripts [#3557](https://github.com/sourcegraph/cody/pull/3557)
- Chat: hide language extensions warning for @-symbol query with 3chars+ [#3556](https://github.com/sourcegraph/cody/pull/3556)
- Edit: Default `fix` to Claude sonnet [#3555](https://github.com/sourcegraph/cody/pull/3555)
- Chat: Handle empty chat message input [#3554](https://github.com/sourcegraph/cody/pull/3554)
- Edit: Add more telemetry specifics [#3552](https://github.com/sourcegraph/cody/pull/3552)
- Add support for Cody API v1 [#3551](https://github.com/sourcegraph/cody/pull/3551)
- Edit: Track persistence of edits and insertions [#3550](https://github.com/sourcegraph/cody/pull/3550)
- Autocomplete: add singleline stop sequences [#3549](https://github.com/sourcegraph/cody/pull/3549)
- Chat: update @-input token background [#3548](https://github.com/sourcegraph/cody/pull/3548)
- Chat: Display Enhanced Context settings on first chat [#3547](https://github.com/sourcegraph/cody/pull/3547)
- Edit: include pre-instruction to Edit commands [#3542](https://github.com/sourcegraph/cody/pull/3542)
- Sentry: More aggressive filtering on errors [#3540](https://github.com/sourcegraph/cody/pull/3540)
- Autocomplete: Add Claude 3 Haiku A/B test [#3538](https://github.com/sourcegraph/cody/pull/3538)
- Edit: Remove show diff CTA for insertions [#3537](https://github.com/sourcegraph/cody/pull/3537)
- Chat: fix at symbol title [#3531](https://github.com/sourcegraph/cody/pull/3531)
- Chat: display excluded @-files in UI [#3528](https://github.com/sourcegraph/cody/pull/3528)
- add tracking issue template [#3527](https://github.com/sourcegraph/cody/pull/3527)
- Chat: fix at-mention token size [#3526](https://github.com/sourcegraph/cody/pull/3526)
- Chat: Disable adding large-file via @-mention [#3523](https://github.com/sourcegraph/cody/pull/3523)
- Add tier status to event logger [#3508](https://github.com/sourcegraph/cody/pull/3508)
- Edit/Chat: Always expand to the nearest enclosing function, if available, before folding ranges [#3507](https://github.com/sourcegraph/cody/pull/3507)
- Edit: Log telemetry events for `fix` separately [#3506](https://github.com/sourcegraph/cody/pull/3506)
- Chat: skip invalid at-mention request [#3503](https://github.com/sourcegraph/cody/pull/3503)
- VS Code: upgrade sentry [#3502](https://github.com/sourcegraph/cody/pull/3502)
- Chat: update at-mention input token color [#3501](https://github.com/sourcegraph/cody/pull/3501)
- VS Code: Release 1.10.0 [#3499](https://github.com/sourcegraph/cody/pull/3499)
- Test: fix flaky e2e tests related to count [#3497](https://github.com/sourcegraph/cody/pull/3497)
- Edit: Show warning on files that are too large [#3494](https://github.com/sourcegraph/cody/pull/3494)
- [LSP Context]: Add `lsp-light` graph context retriever [#3493](https://github.com/sourcegraph/cody/pull/3493)
- Edit: Remove ghost hint feature flag [#3492](https://github.com/sourcegraph/cody/pull/3492)
- Cherry-pick code review feedback missing from #3445 [#3491](https://github.com/sourcegraph/cody/pull/3491)
- do not cancel throttled findWorkspaceFiles call [#3489](https://github.com/sourcegraph/cody/pull/3489)
- Add chatExport endpoint & tests [#3487](https://github.com/sourcegraph/cody/pull/3487)
- Chat: sync token limit at model import time [#3486](https://github.com/sourcegraph/cody/pull/3486)
- remove @-mention URL e2e test (experimental feature) [#3485](https://github.com/sourcegraph/cody/pull/3485)
- do not strip intentional newlines in chat transcript items [#3484](https://github.com/sourcegraph/cody/pull/3484)
- Error when receing an SSE response that does not contain any SSE event [#3479](https://github.com/sourcegraph/cody/pull/3479)
- Chat: clarify tooltip for remote search context [#3478](https://github.com/sourcegraph/cody/pull/3478)
- Autocomplete: use `parser.safeParse()` [#3477](https://github.com/sourcegraph/cody/pull/3477)
- Autocomplete: upgrade tree-sitter grammars and add dart support [#3476](https://github.com/sourcegraph/cody/pull/3476)
- Auto-add 'cody' label to issues for filtering in Linear [#3474](https://github.com/sourcegraph/cody/pull/3474)
- Upgrade GPT 4 Turbo on PLG [#3468](https://github.com/sourcegraph/cody/pull/3468)
- Fix chat abort before first streaming chunk is coming in [#3466](https://github.com/sourcegraph/cody/pull/3466)
- Autocomplete: do not mutate stop sequences array [#3465](https://github.com/sourcegraph/cody/pull/3465)
- Delete unused intent detector [#3462](https://github.com/sourcegraph/cody/pull/3462)
- shard e2e tests so they complete faster [#3461](https://github.com/sourcegraph/cody/pull/3461)
- misc e2e test improvements [#3460](https://github.com/sourcegraph/cody/pull/3460)
- Context: add missing whitespace in context template [#3458](https://github.com/sourcegraph/cody/pull/3458)
- Add # of results from local embedding search to the trace [#3457](https://github.com/sourcegraph/cody/pull/3457)
- Rename span to indicate it doesn't use embeddings [#3456](https://github.com/sourcegraph/cody/pull/3456)
- VSCode: Add a testing flag to override local embeddings model dimension [#3454](https://github.com/sourcegraph/cody/pull/3454)
- Autocomplete: starcoder2 ollama stop sequences [#3452](https://github.com/sourcegraph/cody/pull/3452)
- remove `typing @-mention text does not automatically accept it` e2e test [#3451](https://github.com/sourcegraph/cody/pull/3451)
- fix log spam in e2e flakiness detector [#3450](https://github.com/sourcegraph/cody/pull/3450)
- VS Code: changelog update [#3448](https://github.com/sourcegraph/cody/pull/3448)
- only allow 1 retry for flaky e2e tests [#3447](https://github.com/sourcegraph/cody/pull/3447)
- add e2e-flakiness-detector GitHub action [#3446](https://github.com/sourcegraph/cody/pull/3446)
- V1 new client extension API, for inline edits + document code [#3445](https://github.com/sourcegraph/cody/pull/3445)
- make cody ignore e2e test less flaky on Windows [#3441](https://github.com/sourcegraph/cody/pull/3441)
- use interface extends for consistency [#3438](https://github.com/sourcegraph/cody/pull/3438)
- remove needless command:_cody.vscode.open wrapping for https? URLs [#3437](https://github.com/sourcegraph/cody/pull/3437)
- support @-mentioning URLs to use web page contents as context [#3436](https://github.com/sourcegraph/cody/pull/3436)
- factor out @-mention query scanning and parsing [#3435](https://github.com/sourcegraph/cody/pull/3435)
- explicitly enable biome in VS Code workspace settings [#3434](https://github.com/sourcegraph/cody/pull/3434)
- speed up & respect ignores in finding workspace files for file @-mentions [#3433](https://github.com/sourcegraph/cody/pull/3433)
- show "File too large" @-mention item warning on 2nd line in menu [#3429](https://github.com/sourcegraph/cody/pull/3429)
- Edit: Only compute diffs for actual edits [#3424](https://github.com/sourcegraph/cody/pull/3424)
- Add Claude 3 to model dropdown [#3423](https://github.com/sourcegraph/cody/pull/3423)
- Telemetry: Fix `hasV2Event` often being included as an event property [#3420](https://github.com/sourcegraph/cody/pull/3420)
- Autocomplete: wrap some `parser.parse()` calls in OpenTelemetry spans [#3419](https://github.com/sourcegraph/cody/pull/3419)
- experimental Cody CLI [#3418](https://github.com/sourcegraph/cody/pull/3418)
- Autocomplete: add StarCoder2 hybrid feature flag [#3417](https://github.com/sourcegraph/cody/pull/3417)
- Autocomplete: changelog update [#3416](https://github.com/sourcegraph/cody/pull/3416)
- Autocomplete: add `cody.autocomplete.experimental.fireworksOptions` [#3415](https://github.com/sourcegraph/cody/pull/3415)
- update agent recording token to use new shared account [#3414](https://github.com/sourcegraph/cody/pull/3414)
- standardize on a single prompt format for codebase context [#3412](https://github.com/sourcegraph/cody/pull/3412)
- Autocomplete: add `kotlin` multiline support [#3404](https://github.com/sourcegraph/cody/pull/3404)
- VS Code release 1.8.3 [#3399](https://github.com/sourcegraph/cody/pull/3399)
- Fixed indentation-based folding ranges [#3398](https://github.com/sourcegraph/cody/pull/3398)
- prevent Cody from crashing on init with mis-serialized chat history [#3394](https://github.com/sourcegraph/cody/pull/3394)
- disable unused vscode webview sourcemaps [#3393](https://github.com/sourcegraph/cody/pull/3393)
- Autocomplete: ship dynamic multiline completions enabled by default [#3392](https://github.com/sourcegraph/cody/pull/3392)
- more generous retries and timeouts for windows e2e tests to de-flake [#3390](https://github.com/sourcegraph/cody/pull/3390)
- Prototype: Supercompletions [#3389](https://github.com/sourcegraph/cody/pull/3389)
- Agent: Bundle WASM artifacts [#3386](https://github.com/sourcegraph/cody/pull/3386)
- Harden the GH actions by pinning the release [#3385](https://github.com/sourcegraph/cody/pull/3385)
- Chat: Log errors to Sentry [#3384](https://github.com/sourcegraph/cody/pull/3384)
- Autocomplete: Fix typo in Anthropic prompt [#3382](https://github.com/sourcegraph/cody/pull/3382)
- sourcegraph-api: always include anonymous UID [#3381](https://github.com/sourcegraph/cody/pull/3381)
- Autocomplete: do not cut off completions [#3377](https://github.com/sourcegraph/cody/pull/3377)
- Autocomplete: upgrade tree-sitter and expand language support [#3373](https://github.com/sourcegraph/cody/pull/3373)
- ignore index.scip [#3372](https://github.com/sourcegraph/cody/pull/3372)
- escapeHTML that does not use the DOM [#3371](https://github.com/sourcegraph/cody/pull/3371)
- do not crash initialization if chat history somehow lacks `displayText` [#3367](https://github.com/sourcegraph/cody/pull/3367)
- standardize on display{Line,}Range funcs [#3366](https://github.com/sourcegraph/cody/pull/3366)
- compute ChatMessage.displayText on-demand instead of persisting [#3363](https://github.com/sourcegraph/cody/pull/3363)
- VS Code: Release 1.8.2 [#3362](https://github.com/sourcegraph/cody/pull/3362)
- Chat: Wrap pasted code blocks in backticks [#3357](https://github.com/sourcegraph/cody/pull/3357)
- Chat: Fixes an issue where the abort error was not properly handled in the Claude 3 providers [#3355](https://github.com/sourcegraph/cody/pull/3355)
- disable model selector after 1st chat message is sent [#3354](https://github.com/sourcegraph/cody/pull/3354)
- document and reorganize ContextItem source, title, etc. [#3353](https://github.com/sourcegraph/cody/pull/3353)
- Autocomplete: ollama per model stop sequences [#3352](https://github.com/sourcegraph/cody/pull/3352)
- fix bug where the entire document text would be included instead of just visible content [#3351](https://github.com/sourcegraph/cody/pull/3351)
- biome ignore node_modules and .vscode-test [#3350](https://github.com/sourcegraph/cody/pull/3350)
- Auth: Fix pro status logic [#3346](https://github.com/sourcegraph/cody/pull/3346)
- Command: Generate file path for test command [#3344](https://github.com/sourcegraph/cody/pull/3344)
- Command: Remove model override for Test command [#3343](https://github.com/sourcegraph/cody/pull/3343)
- Debug: Enable debug mode from setting menu [#3342](https://github.com/sourcegraph/cody/pull/3342)
- Chat: Shows welcome message on empty chat only [#3341](https://github.com/sourcegraph/cody/pull/3341)
- VS Code: Release 1.8.1 [#3340](https://github.com/sourcegraph/cody/pull/3340)
- Prevent auth block when another auth is ongoing [#3339](https://github.com/sourcegraph/cody/pull/3339)
- Agent: disable feature flags in tests [#3337](https://github.com/sourcegraph/cody/pull/3337)
- remove unused CodeBlockMetadata [#3335](https://github.com/sourcegraph/cody/pull/3335)
- Custom Command: Fix shell command as context on Windows [#3333](https://github.com/sourcegraph/cody/pull/3333)
- Add support link for Cody Pro & Enterprise [#3330](https://github.com/sourcegraph/cody/pull/3330)
- VS Code: Release 1.8.0 [#3329](https://github.com/sourcegraph/cody/pull/3329)
- Telemetry: log 'codyIgnore:hasFile' event [#3327](https://github.com/sourcegraph/cody/pull/3327)
- Debug: enable debug logging by default [#3325](https://github.com/sourcegraph/cody/pull/3325)
- Command: do not refresh sidebar on config change [#3324](https://github.com/sourcegraph/cody/pull/3324)
- context ranker: adding sentence transformer embeddings as a context r… [#3323](https://github.com/sourcegraph/cody/pull/3323)
- Edit: Fix userContextFiles missing from context response [#3318](https://github.com/sourcegraph/cody/pull/3318)
- canonicalize the JSON request body in the agent recordings [#3317](https://github.com/sourcegraph/cody/pull/3317)
- handle incorrectly serialized vscode.Range values in toRangeData [#3315](https://github.com/sourcegraph/cody/pull/3315)
- clean up MessageWithContext, TranscriptJSON, InteractionJSON code [#3314](https://github.com/sourcegraph/cody/pull/3314)
- Test: Update e2e tests for Windows [#3313](https://github.com/sourcegraph/cody/pull/3313)
- Edit: Fix missing context for instruction-based inputs [#3309](https://github.com/sourcegraph/cody/pull/3309)
- clean up ContextItem<->ContextMessage conversion, remove duplicate wrapping & unused code [#3307](https://github.com/sourcegraph/cody/pull/3307)
- remove unused Transcript class, Interaction class, InteractionJSON fields, precise context code [#3306](https://github.com/sourcegraph/cody/pull/3306)
- remove code for old chat history migrations [#3305](https://github.com/sourcegraph/cody/pull/3305)
- preserve trailing non-alphanum chars in chat message [#3304](https://github.com/sourcegraph/cody/pull/3304)
- Add support for Claude 3  [#3301](https://github.com/sourcegraph/cody/pull/3301)
- Fix sign in icons [#3300](https://github.com/sourcegraph/cody/pull/3300)
- VS Code: release v1.6.1 [#3299](https://github.com/sourcegraph/cody/pull/3299)
- clean up vscode storybooks [#3295](https://github.com/sourcegraph/cody/pull/3295)
- improve context selector a11y e2e test [#3294](https://github.com/sourcegraph/cody/pull/3294)
- use `page.waitForTimeout` instead of custom `sleep` [#3293](https://github.com/sourcegraph/cody/pull/3293)
- de-flake and reenable `chat input focus` test [#3292](https://github.com/sourcegraph/cody/pull/3292)
- stricter timeouts for vscode e2e tests [#3291](https://github.com/sourcegraph/cody/pull/3291)
- Autocomplete: add `StarCoder2` ollama support [#3290](https://github.com/sourcegraph/cody/pull/3290)
- Autocomplete: migrate to `bfg/contextForIdentifiers` [#3289](https://github.com/sourcegraph/cody/pull/3289)
- use rich editor for chat prompt editor [#3287](https://github.com/sourcegraph/cody/pull/3287)
- ensure symf is only downloaded once [#3286](https://github.com/sourcegraph/cody/pull/3286)
- move lib/ui into vscode/webviews, remove lib/ui [#3285](https://github.com/sourcegraph/cody/pull/3285)
- Autocomplete: reduce the adaptive timeout [#3283](https://github.com/sourcegraph/cody/pull/3283)
- Chat: Support local Ollama models [#3282](https://github.com/sourcegraph/cody/pull/3282)
- Font: Add Ollama logo [#3281](https://github.com/sourcegraph/cody/pull/3281)
- Smarter Doc: Use Tree-sitter for range expansion, and show hints alongside symbols [#3275](https://github.com/sourcegraph/cody/pull/3275)
- Autocomplete: expose the smart throttle setting [#3274](https://github.com/sourcegraph/cody/pull/3274)
- Add documentation for CODY_RELEASE_TYPE environment variable [#3273](https://github.com/sourcegraph/cody/pull/3273)
- Autocomplete: fix `OpenTelemetry` exporter with multiple processors [#3270](https://github.com/sourcegraph/cody/pull/3270)
- rename type Context{File => Item}, remove existing redundant ContextItem type, [#3269](https://github.com/sourcegraph/cody/pull/3269)
- UserContextSelector: remove duplicative prop formInput [#3268](https://github.com/sourcegraph/cody/pull/3268)
- fix App story [#3267](https://github.com/sourcegraph/cody/pull/3267)
- remove unused userContextFiles kind [#3266](https://github.com/sourcegraph/cody/pull/3266)
- remove unused code [#3265](https://github.com/sourcegraph/cody/pull/3265)
- Update symf index when stale [#3261](https://github.com/sourcegraph/cody/pull/3261)
- format JSON files in a standard way [#3260](https://github.com/sourcegraph/cody/pull/3260)
- organize imports upon saving in editor and when running biome [#3259](https://github.com/sourcegraph/cody/pull/3259)
- log chat and fireworks requests [#3258](https://github.com/sourcegraph/cody/pull/3258)
- Auth: supports codium and cursor for enterprise instances [#3257](https://github.com/sourcegraph/cody/pull/3257)
- Debug: new button to export log [#3256](https://github.com/sourcegraph/cody/pull/3256)
- Update Ollama docs [#3253](https://github.com/sourcegraph/cody/pull/3253)
- Remove cody-chat-mock-test [#3248](https://github.com/sourcegraph/cody/pull/3248)
- Custom Commands: display commands in sidebar [#3245](https://github.com/sourcegraph/cody/pull/3245)
- Remove auth steps [#3244](https://github.com/sourcegraph/cody/pull/3244)
- Chat: enable editing chat command prompts [#3243](https://github.com/sourcegraph/cody/pull/3243)
- Custom Command: supports keybinding registration [#3242](https://github.com/sourcegraph/cody/pull/3242)
- support auth from cursor [#3241](https://github.com/sourcegraph/cody/pull/3241)
- VS Code: Release 1.6.0 [#3240](https://github.com/sourcegraph/cody/pull/3240)
- Chat: add file size warning to @-tabs [#3237](https://github.com/sourcegraph/cody/pull/3237)
- Add option to log tracing info in agent logs [#3233](https://github.com/sourcegraph/cody/pull/3233)
- Ghost text: Fire throttled display event [#3232](https://github.com/sourcegraph/cody/pull/3232)
- Edit: Skip applicable diff logic when only inserting code [#3231](https://github.com/sourcegraph/cody/pull/3231)
- Update the logged out status bar item with more obvious CTA [#3230](https://github.com/sourcegraph/cody/pull/3230)
- Update VSC README about pricing [#3229](https://github.com/sourcegraph/cody/pull/3229)
- Chat: add transcript messages in pairs [#3228](https://github.com/sourcegraph/cody/pull/3228)
- Chat: Fix at-mentioned links [#3226](https://github.com/sourcegraph/cody/pull/3226)
- Chat: Add flag to enable fused context [#3220](https://github.com/sourcegraph/cody/pull/3220)
- Agent CodeLenses: Allow consumers to control how they render `title` icons and omit shortcut labels [#3219](https://github.com/sourcegraph/cody/pull/3219)
- add an OpenAI-compatible provider as a generic Enterprise LLM adapter [#3218](https://github.com/sourcegraph/cody/pull/3218)
- Commands: Include Custom Commands in main menu [#3214](https://github.com/sourcegraph/cody/pull/3214)
- Autocomplete: Remove same line suffix information from ollama prompts [#3213](https://github.com/sourcegraph/cody/pull/3213)
- Agent: correctly dispose code lens providers [#3212](https://github.com/sourcegraph/cody/pull/3212)
- Cody: Fix edit shortcut label style [#3211](https://github.com/sourcegraph/cody/pull/3211)
- Reenable Sentry and enable default integrations [#3210](https://github.com/sourcegraph/cody/pull/3210)
- chat: do not hide snippets from the same file in context list [#3209](https://github.com/sourcegraph/cody/pull/3209)
- Security: add handlers for links in chat view [#3203](https://github.com/sourcegraph/cody/pull/3203)
- Test: update chat history e2e test [#3201](https://github.com/sourcegraph/cody/pull/3201)
- Autocomplete: Remove unused feature flags and models [#3200](https://github.com/sourcegraph/cody/pull/3200)
- Agent: Update Cody Ignore test [#3199](https://github.com/sourcegraph/cody/pull/3199)
- Agent: print out helpful error message on missing recording [#3197](https://github.com/sourcegraph/cody/pull/3197)
- Command Hints: Add enrollment events for A/B test [#3196](https://github.com/sourcegraph/cody/pull/3196)
- Agent: make tests more stable [#3194](https://github.com/sourcegraph/cody/pull/3194)
- Ensure multi-root integration tests run if single-root tests have failures [#3193](https://github.com/sourcegraph/cody/pull/3193)
- Edit: Improve response reliability with different chat models [#3192](https://github.com/sourcegraph/cody/pull/3192)
- Chat: fix at-symbol styles [#3189](https://github.com/sourcegraph/cody/pull/3189)
- Telemetry: update logs for custom commands [#3188](https://github.com/sourcegraph/cody/pull/3188)
- Autocomplete: Remove double-debounce [#3187](https://github.com/sourcegraph/cody/pull/3187)
- Autocomplete: Smart Throttle [#3186](https://github.com/sourcegraph/cody/pull/3186)
- Telemetry: chat-question:submitted [#3185](https://github.com/sourcegraph/cody/pull/3185)
- Agent: sort custom command context only [#3184](https://github.com/sourcegraph/cody/pull/3184)
- Agent: important fixes for Kotlin codegen [#3183](https://github.com/sourcegraph/cody/pull/3183)
- Autocomplete: Tracing improvements [#3181](https://github.com/sourcegraph/cody/pull/3181)
- Test: fix failed e2e tests [#3180](https://github.com/sourcegraph/cody/pull/3180)
- Custom Command:  set userConfigFile on runtime [#3179](https://github.com/sourcegraph/cody/pull/3179)
- Require a timeout when getting a loading lease [#3178](https://github.com/sourcegraph/cody/pull/3178)
- VSCode: Do not show update toast on new installs [#3177](https://github.com/sourcegraph/cody/pull/3177)
- Autocomplete: ship single-multiline requests [#3176](https://github.com/sourcegraph/cody/pull/3176)
- Chat: support line numbers in at-files [#3174](https://github.com/sourcegraph/cody/pull/3174)
- Chat: Display file range correctly [#3172](https://github.com/sourcegraph/cody/pull/3172)
- Chat: Add tracing [#3168](https://github.com/sourcegraph/cody/pull/3168)
- VSCode: Support login redirects in VSCodium [#3167](https://github.com/sourcegraph/cody/pull/3167)
- Agent: add protocol documentation [#3165](https://github.com/sourcegraph/cody/pull/3165)
- Add local certs when running agent on macOS [#3164](https://github.com/sourcegraph/cody/pull/3164)
- Version update for VS Code: Release 1.4.4 [#3160](https://github.com/sourcegraph/cody/pull/3160)
- Test: fix flanky e2e test [#3158](https://github.com/sourcegraph/cody/pull/3158)
- Auth: Add input validation for instance URL [#3156](https://github.com/sourcegraph/cody/pull/3156)
- Chat: fix welcome messages in chat view [#3155](https://github.com/sourcegraph/cody/pull/3155)
- Command Hints: Update setting enablement [#3154](https://github.com/sourcegraph/cody/pull/3154)
- `chat/restore`: set default llm for null `modelID` param [#3153](https://github.com/sourcegraph/cody/pull/3153)
- Agent: don't kill entire process on uncaught exceptions [#3151](https://github.com/sourcegraph/cody/pull/3151)
- Commit Messages: Fix bug with unstaged files and add feature toggle to menu [#3150](https://github.com/sourcegraph/cody/pull/3150)
- Autocomplete: Split debounce into two chunks, race the second part with the context retrieving [#3149](https://github.com/sourcegraph/cody/pull/3149)
- Chat: Fix input focus issue [#3147](https://github.com/sourcegraph/cody/pull/3147)
- Agent: automate generation of Kotlin bindings [#3142](https://github.com/sourcegraph/cody/pull/3142)
- Autocomplete: Only sample requests that are also suggested [#3139](https://github.com/sourcegraph/cody/pull/3139)
- Autocomplete: Don't delay completions for cached entries [#3138](https://github.com/sourcegraph/cody/pull/3138)
- Autocomplete: Log if a completion was suggested again [#3136](https://github.com/sourcegraph/cody/pull/3136)
- Autocomplete: Ship jaccard similarity changes [#3135](https://github.com/sourcegraph/cody/pull/3135)
- Edit: Stop clearing ghost text when input opens [#3134](https://github.com/sourcegraph/cody/pull/3134)
- Edit: Add feature flag / AB test logic for command hints [#3133](https://github.com/sourcegraph/cody/pull/3133)
- VS Code: changelog cleanup [#3132](https://github.com/sourcegraph/cody/pull/3132)
- VS Code: release v1.4.3 [#3131](https://github.com/sourcegraph/cody/pull/3131)
- Autocomplete: bump BFG version [#3130](https://github.com/sourcegraph/cody/pull/3130)
- Rename "Guard Rails" to "Guardrails" and update tooltips [#3129](https://github.com/sourcegraph/cody/pull/3129)
- Add a hint about how to include specific files or functions [#3128](https://github.com/sourcegraph/cody/pull/3128)
- VS Code: Release 1.4.2 - patch release [#3123](https://github.com/sourcegraph/cody/pull/3123)
- Update changelog [#3122](https://github.com/sourcegraph/cody/pull/3122)
- properly enforce prompt context limit [#3121](https://github.com/sourcegraph/cody/pull/3121)
- Chat: display file size warning on large files [#3118](https://github.com/sourcegraph/cody/pull/3118)
- Fixing logs on the failed GQL queries for refreshConfigFeatures [#3117](https://github.com/sourcegraph/cody/pull/3117)
- Chat: improve handling of at mentions [#3114](https://github.com/sourcegraph/cody/pull/3114)
- Move semgrep rules directory [#3113](https://github.com/sourcegraph/cody/pull/3113)
- context-ranking support [#3111](https://github.com/sourcegraph/cody/pull/3111)
- Edit: Improve telemetry for cancelled edits [#3107](https://github.com/sourcegraph/cody/pull/3107)
- VS Code: Release 1.4.1 [#3106](https://github.com/sourcegraph/cody/pull/3106)
- Update Semgrep Checkout step with ref & repo [#3105](https://github.com/sourcegraph/cody/pull/3105)
- Fix Ctrl+Arrows in chat input box [#3103](https://github.com/sourcegraph/cody/pull/3103)
- Make relative() case-insensitive for Windows paths + URIs [#3102](https://github.com/sourcegraph/cody/pull/3102)
- Autocomplete: bump BFG version [#3097](https://github.com/sourcegraph/cody/pull/3097)
- Autocomplete: Various latency related tweaks and new eager cancellation experiment [#3096](https://github.com/sourcegraph/cody/pull/3096)
- Remove "bin/" from search ignore, part 2 [#3094](https://github.com/sourcegraph/cody/pull/3094)
- vscode-shim: fix workspace.findFiles [#3093](https://github.com/sourcegraph/cody/pull/3093)
- Guardrails is enabled just via instance configuration [#3090](https://github.com/sourcegraph/cody/pull/3090)
- Agent: Custom Commands support [#3089](https://github.com/sourcegraph/cody/pull/3089)
- PLG: update end date [#3088](https://github.com/sourcegraph/cody/pull/3088)
- Autocomplete: Add Llama Code 13b feature flag [#3086](https://github.com/sourcegraph/cody/pull/3086)
- Autocomplete: use `executeFormatDocumentProvider` for completion formatting [#3083](https://github.com/sourcegraph/cody/pull/3083)
- Autocomplete: always log `onComplete` debug event [#3081](https://github.com/sourcegraph/cody/pull/3081)
- Add VSCode testing instructions for consumer, multi-repo context [#3080](https://github.com/sourcegraph/cody/pull/3080)
- bump symf version [#3079](https://github.com/sourcegraph/cody/pull/3079)
- Autocomplete: Mark Ollama support experimental [#3077](https://github.com/sourcegraph/cody/pull/3077)
- VS Code: Release 1.4.0 [#3076](https://github.com/sourcegraph/cody/pull/3076)
- Merge back VS Code release 1.2.3 [#3075](https://github.com/sourcegraph/cody/pull/3075)
- Edit: Always expand `doc` command [#3073](https://github.com/sourcegraph/cody/pull/3073)
- Add CharactersLogger [#3070](https://github.com/sourcegraph/cody/pull/3070)
- Edit: Disable command hints for unauthenticated users [#3067](https://github.com/sourcegraph/cody/pull/3067)
- Edit: Always set `models` on initialization [#3066](https://github.com/sourcegraph/cody/pull/3066)
- move logging for edits to provider [#3063](https://github.com/sourcegraph/cody/pull/3063)
- add: missing changelog entry [#3062](https://github.com/sourcegraph/cody/pull/3062)
- Command: remove slashes from commands [#3061](https://github.com/sourcegraph/cody/pull/3061)
- fix flanky e2e test [#3060](https://github.com/sourcegraph/cody/pull/3060)
- Add test case to reproduce crash that only happens with Enterprise accounts [#3055](https://github.com/sourcegraph/cody/pull/3055)
- Commands: Update testing instructions [#3054](https://github.com/sourcegraph/cody/pull/3054)
- Edit: Update testing instructions [#3053](https://github.com/sourcegraph/cody/pull/3053)
- Autocomplete: Add option to disable inside code comments [#3049](https://github.com/sourcegraph/cody/pull/3049)
- Autocomplete: Add button to quickly expose Autocomplete options to status bar items [#3048](https://github.com/sourcegraph/cody/pull/3048)
- Edit: Always expand range to include all non-whitespace chars [#3047](https://github.com/sourcegraph/cody/pull/3047)
- Autocomplete: dynamic multiline language list [#3044](https://github.com/sourcegraph/cody/pull/3044)
- Add QA testing flows  [#3042](https://github.com/sourcegraph/cody/pull/3042)
- Add config feature gating for chat and commands [#3039](https://github.com/sourcegraph/cody/pull/3039)
- cody: update auth endpoint for SAMS redirect [#3037](https://github.com/sourcegraph/cody/pull/3037)
- Autocomplete: Improve sampling code and prepare for Honeycomb export [#3034](https://github.com/sourcegraph/cody/pull/3034)
- CodyIgnore:  add logging [#3033](https://github.com/sourcegraph/cody/pull/3033)
- Autocomplete: truncate the last completion line if it matches suffix [#3032](https://github.com/sourcegraph/cody/pull/3032)
- fix build in bash [#3029](https://github.com/sourcegraph/cody/pull/3029)
- exclude build/ and .class files from user context files [#3027](https://github.com/sourcegraph/cody/pull/3027)
- update: remove description requirement from custom command [#3025](https://github.com/sourcegraph/cody/pull/3025)
- Always uses latest stable VS Code version for integration tests [#3021](https://github.com/sourcegraph/cody/pull/3021)
- Add integration tests for Ignores in multi-root VS Code workspaces [#3020](https://github.com/sourcegraph/cody/pull/3020)
- Fix ignore patterns that have trailing comments [#3017](https://github.com/sourcegraph/cody/pull/3017)
- Chat: Fix "Ask Cody to Explain" [#3015](https://github.com/sourcegraph/cody/pull/3015)
- Add support for integration tests using a multi-root workspace [#3014](https://github.com/sourcegraph/cody/pull/3014)
- Edit: Add command hint filters against non-file selections and multiple selections [#3011](https://github.com/sourcegraph/cody/pull/3011)
- remove retry lens from /test [#3010](https://github.com/sourcegraph/cody/pull/3010)
- Don't add duplicate workspace folders [#3007](https://github.com/sourcegraph/cody/pull/3007)
- change: disable edit buttons on core command messages [#3005](https://github.com/sourcegraph/cody/pull/3005)
- add e2e test for /edit [#2998](https://github.com/sourcegraph/cody/pull/2998)
- Edit: Fix chat/edit shortcuts [#2996](https://github.com/sourcegraph/cody/pull/2996)
- Remove dangling closing bracket [#2993](https://github.com/sourcegraph/cody/pull/2993)
- Feature flags: Add a way to subscribe to feature flag changes [#2992](https://github.com/sourcegraph/cody/pull/2992)
- Cosmetic changelog script improvements [#2989](https://github.com/sourcegraph/cody/pull/2989)
- Autocomplete: update BFG snippets structure to match the format expected on the client [#2987](https://github.com/sourcegraph/cody/pull/2987)
- display .cody/ignore status in status bar [#2984](https://github.com/sourcegraph/cody/pull/2984)
- Agent: handle document URIs with exclamation marks [#2983](https://github.com/sourcegraph/cody/pull/2983)
- VS Code: Release 1.2.2 [#2982](https://github.com/sourcegraph/cody/pull/2982)
- fix issue where natural language search panel disappears instead of showing results [#2981](https://github.com/sourcegraph/cody/pull/2981)
- Add analytics to settings & support items [#2979](https://github.com/sourcegraph/cody/pull/2979)
- Agent: add support for `workspace/edit` [#2978](https://github.com/sourcegraph/cody/pull/2978)
- Never reuse webviews when running inside the agent [#2977](https://github.com/sourcegraph/cody/pull/2977)
- Autocomplete: Remove obvious prompt-continuations [#2974](https://github.com/sourcegraph/cody/pull/2974)
- Autocomplete: make `getPrefetchedFlag` type safe [#2972](https://github.com/sourcegraph/cody/pull/2972)
- Agent: fail tests if a network request errors [#2971](https://github.com/sourcegraph/cody/pull/2971)
- Agent: disable reusing webview panels [#2969](https://github.com/sourcegraph/cody/pull/2969)
- Autocomplete: disable parallel inference requests for `ollama` [#2967](https://github.com/sourcegraph/cody/pull/2967)
- Autocomplete: add `deepseek-coder:6.7b` support [#2966](https://github.com/sourcegraph/cody/pull/2966)
- VSCode UI: Add an e2e smoke test for the multi-repo picker [#2964](https://github.com/sourcegraph/cody/pull/2964)
- add: .cody/ignore integration tests in agent [#2963](https://github.com/sourcegraph/cody/pull/2963)
- Autocomplete: add `single-multiline-request` feature flag [#2962](https://github.com/sourcegraph/cody/pull/2962)
- Finishing autocomplete Cody Ignore [#2961](https://github.com/sourcegraph/cody/pull/2961)
- cody: change auth endpoint to handle SAMS redirect [#2957](https://github.com/sourcegraph/cody/pull/2957)
- INC-267: add test case to reproduce regression [#2954](https://github.com/sourcegraph/cody/pull/2954)
- add e2e test for custom command openTabs context [#2953](https://github.com/sourcegraph/cody/pull/2953)
- Edit: Add support for multiple models [#2951](https://github.com/sourcegraph/cody/pull/2951)
- Edit: Remove usage of codebase context [#2950](https://github.com/sourcegraph/cody/pull/2950)
- update e2e tests [#2947](https://github.com/sourcegraph/cody/pull/2947)
- Autocomplete: add more stop-reason values to autocomplete responses [#2946](https://github.com/sourcegraph/cody/pull/2946)
- add log default chat commands [#2945](https://github.com/sourcegraph/cody/pull/2945)
- VS Code: Release 1.2.1 [#2944](https://github.com/sourcegraph/cody/pull/2944)
- Adding temp fix for the race condition involved in reading auth token [#2943](https://github.com/sourcegraph/cody/pull/2943)
- add /ask to command menu [#2939](https://github.com/sourcegraph/cody/pull/2939)
- add: display cody icon in chat panel title [#2937](https://github.com/sourcegraph/cody/pull/2937)
- cody: change feedback template [#2933](https://github.com/sourcegraph/cody/pull/2933)
- update: remove codebase item from custom command menu [#2932](https://github.com/sourcegraph/cody/pull/2932)
- Allow agent to be debugged by IntelliJ [#2930](https://github.com/sourcegraph/cody/pull/2930)
- VS Code: Release 1.2.0 [#2928](https://github.com/sourcegraph/cody/pull/2928)
- Autocomplete: Add experimental fast path mode for Fireworks on PLG [#2927](https://github.com/sourcegraph/cody/pull/2927)
- Agent: fix bug causing recording files to not remove unused files [#2926](https://github.com/sourcegraph/cody/pull/2926)
- Adding cody ignore docs [#2918](https://github.com/sourcegraph/cody/pull/2918)
- add e2e test for .cody/ignore in chat,  update filtering step [#2913](https://github.com/sourcegraph/cody/pull/2913)
- Add notification of expired/nearly expired Cody Pro [#2910](https://github.com/sourcegraph/cody/pull/2910)
- Agent: add ability to disable network requests to sourcegraph.com [#2909](https://github.com/sourcegraph/cody/pull/2909)
- Agent: reduce automatic requests to sourcegraph.com [#2908](https://github.com/sourcegraph/cody/pull/2908)
- Edit: Remove debug logs [#2907](https://github.com/sourcegraph/cody/pull/2907)
- Autocomplete: fix actual position calculation for hot-streak completions [#2906](https://github.com/sourcegraph/cody/pull/2906)
- Fix git clone URL converstion for dots in repo names [#2901](https://github.com/sourcegraph/cody/pull/2901)
- Workspace settings: Disable codeActionsOnSave [#2900](https://github.com/sourcegraph/cody/pull/2900)
- Autocomplete: More Jaccard improvements and per-line RRF [#2898](https://github.com/sourcegraph/cody/pull/2898)
- Agent: use more helpful assertion in squirrel test [#2897](https://github.com/sourcegraph/cody/pull/2897)
- VS Code chat UI matches design [#2896](https://github.com/sourcegraph/cody/pull/2896)
- Clean up chat editor title buttons & history separators [#2895](https://github.com/sourcegraph/cody/pull/2895)
- Clarify custom command codebase property removal changelog [#2892](https://github.com/sourcegraph/cody/pull/2892)
- Move context warnings from the UI to the debug log [#2891](https://github.com/sourcegraph/cody/pull/2891)
- Validate logged events in e2e tests [#2889](https://github.com/sourcegraph/cody/pull/2889)
- Update guardrails shield icon [#2888](https://github.com/sourcegraph/cody/pull/2888)
- Edit: Advanced Input [#2884](https://github.com/sourcegraph/cody/pull/2884)
- Autocomplete: adaptive dynamic multiline completions [#2881](https://github.com/sourcegraph/cody/pull/2881)
- Autocomplete: add test utility for completions streaming [#2880](https://github.com/sourcegraph/cody/pull/2880)
- Add multi-repo search for enterprise, remove remote embeddings [#2879](https://github.com/sourcegraph/cody/pull/2879)
- Agent: update squirrel test to assert context files [#2877](https://github.com/sourcegraph/cody/pull/2877)
- Agent: add support for inline edit command "Document code" [#2870](https://github.com/sourcegraph/cody/pull/2870)
- Autocomplete: Log wether we're inside a test file [#2868](https://github.com/sourcegraph/cody/pull/2868)
- Update language to make `@#-symbol` tagging more discoverable [#2866](https://github.com/sourcegraph/cody/pull/2866)
- Edit/Chat: Change shortcut and add dedicated setting [#2865](https://github.com/sourcegraph/cody/pull/2865)
- Update the Enhanced Context popover copy and link to docs [#2864](https://github.com/sourcegraph/cody/pull/2864)
- Add `graphql/getCurrentUserCodySubscription` endpoint [#2858](https://github.com/sourcegraph/cody/pull/2858)
- Autocomplete: Cancel requests that are no longer relevant [#2855](https://github.com/sourcegraph/cody/pull/2855)
- minor cleanup [#2854](https://github.com/sourcegraph/cody/pull/2854)
- Further clean up SimpleChatPanelProvider and document invariants [#2849](https://github.com/sourcegraph/cody/pull/2849)
- Refactor chat [#2848](https://github.com/sourcegraph/cody/pull/2848)
- resolve remote embeddings fileNames to URIs [#2847](https://github.com/sourcegraph/cody/pull/2847)
- fix storybooks [#2845](https://github.com/sourcegraph/cody/pull/2845)
- enable more biome rules [#2844](https://github.com/sourcegraph/cody/pull/2844)
- use `biome ci` for CI, simplify other check tasks [#2841](https://github.com/sourcegraph/cody/pull/2841)
- Restrict chat input to 80% of viewport height [#2837](https://github.com/sourcegraph/cody/pull/2837)
- use biome for formatting (not prettier) and linting (not eslint) [#2836](https://github.com/sourcegraph/cody/pull/2836)
- remove prettier import sorting to fix lint jitter [#2834](https://github.com/sourcegraph/cody/pull/2834)
- move ollama client to lib/shared [#2833](https://github.com/sourcegraph/cody/pull/2833)
- use async generator for completions and chat clients [#2832](https://github.com/sourcegraph/cody/pull/2832)
- rm unused CustomAbort{Controller,Signal} [#2831](https://github.com/sourcegraph/cody/pull/2831)
- use more standard AbortSignal for aborting stream/chat operations [#2830](https://github.com/sourcegraph/cody/pull/2830)
- skip remote embeddings detection for dotcom [#2829](https://github.com/sourcegraph/cody/pull/2829)
- Agent: reset server environment between tests [#2825](https://github.com/sourcegraph/cody/pull/2825)
- Fix Ctrl+Enter for follow-on chat on Windows [#2823](https://github.com/sourcegraph/cody/pull/2823)
- Agent: fix critical bugs related to document synchronization [#2821](https://github.com/sourcegraph/cody/pull/2821)
- Fix Anthropic model ID overwrite for old instances [#2819](https://github.com/sourcegraph/cody/pull/2819)
- Fix failing Windows integration test [#2818](https://github.com/sourcegraph/cody/pull/2818)
- Ghost text: Show on command driven selections [#2816](https://github.com/sourcegraph/cody/pull/2816)
- VS Code enables attribution based on site config [#2815](https://github.com/sourcegraph/cody/pull/2815)
- Agent: document useful commands for working on tests [#2813](https://github.com/sourcegraph/cody/pull/2813)
- Add squirrel test to agent test suite [#2810](https://github.com/sourcegraph/cody/pull/2810)
- bump vscode test version [#2805](https://github.com/sourcegraph/cody/pull/2805)
- Run embeddings and symf retrieval in parallel and implement basic fusion [#2804](https://github.com/sourcegraph/cody/pull/2804)
- Agent: Enterprise tests now run using new codytesting user [#2801](https://github.com/sourcegraph/cody/pull/2801)
- Agent: reorganize tests [#2800](https://github.com/sourcegraph/cody/pull/2800)
- Agent: support `new vscode.Selection(number,number,number,number)` [#2799](https://github.com/sourcegraph/cody/pull/2799)
- Agent attribution API [#2798](https://github.com/sourcegraph/cody/pull/2798)
- Agent: add tests case for Cody Enterprise [#2797](https://github.com/sourcegraph/cody/pull/2797)
- Agent: always disable local embeddings [#2796](https://github.com/sourcegraph/cody/pull/2796)
- never use remote embeddings for dotcom/PLG users [#2792](https://github.com/sourcegraph/cody/pull/2792)
- Autocomplete: Make sure to not crash when the site config was changed [#2783](https://github.com/sourcegraph/cody/pull/2783)
- Agent: remove recipes, fix authentication bugs and improve logging [#2782](https://github.com/sourcegraph/cody/pull/2782)
- [Cody] remove cody-pro feature flag dependency [#2780](https://github.com/sourcegraph/cody/pull/2780)
- remove unused lsp-light context retriever [#2779](https://github.com/sourcegraph/cody/pull/2779)
- remove e2e, e2e-inspector, Transcript, most of createClient [#2778](https://github.com/sourcegraph/cody/pull/2778)
- fix complaint about needing esModuleInterop [#2777](https://github.com/sourcegraph/cody/pull/2777)
- Autocomplete: use async generators for autocomplete tests [#2775](https://github.com/sourcegraph/cody/pull/2775)
- remove support for codebase-specific ignores [#2774](https://github.com/sourcegraph/cody/pull/2774)
- fix testing vscode.Uri.joinPath(/* vscode-uri.URI */, ...) [#2772](https://github.com/sourcegraph/cody/pull/2772)
- Make new chats the default and limited context window allocated to enhanced context to preserve context window [#2768](https://github.com/sourcegraph/cody/pull/2768)
- remove redundant console.log [#2763](https://github.com/sourcegraph/cody/pull/2763)
- add: new chat mode to run edit command in chat view [#2760](https://github.com/sourcegraph/cody/pull/2760)
- Edit: Add codelens shortcuts [#2757](https://github.com/sourcegraph/cody/pull/2757)
- Edit: Stop auto selecting code when opening diff [#2754](https://github.com/sourcegraph/cody/pull/2754)
- Chat UI codeblock now does not consider limit hit as guardrails unavailable [#2752](https://github.com/sourcegraph/cody/pull/2752)
- Wire chat guardrails with snippet attribution search on enterprise instance [#2751](https://github.com/sourcegraph/cody/pull/2751)
- Agent: re-enable tree-sitter parsing tests [#2750](https://github.com/sourcegraph/cody/pull/2750)
- improve usage of URIs and FS paths for multi-root support [#2749](https://github.com/sourcegraph/cody/pull/2749)
- remove more unused code [#2748](https://github.com/sourcegraph/cody/pull/2748)
- Autocomplete: migrate autocomplete streaming post-processing to async generators [#2747](https://github.com/sourcegraph/cody/pull/2747)
- remove old recipes code [#2746](https://github.com/sourcegraph/cody/pull/2746)
- DX: upgrade vitest to the latest version [#2745](https://github.com/sourcegraph/cody/pull/2745)
- encapsulate @sourcegraph/cody-shared, restrict subpath imports [#2744](https://github.com/sourcegraph/cody/pull/2744)
- fix cody-shared import from agent issue [#2741](https://github.com/sourcegraph/cody/pull/2741)
- simplify the shared language-detection code [#2740](https://github.com/sourcegraph/cody/pull/2740)
- change: display codeblock actions while message in progress [#2737](https://github.com/sourcegraph/cody/pull/2737)
- update google auth workflow step to unblock external contributors [#2736](https://github.com/sourcegraph/cody/pull/2736)
- Agent: make `pnpm update-agent-recordings` more stable and run faster [#2733](https://github.com/sourcegraph/cody/pull/2733)
- Symf: move term expansion to separate file [#2732](https://github.com/sourcegraph/cody/pull/2732)
- Autocomplete: clean up streaming unit tests [#2731](https://github.com/sourcegraph/cody/pull/2731)
- Fix Semgrep pull request event  [#2728](https://github.com/sourcegraph/cody/pull/2728)
- symf: clean up node:fs usage in SymfRunner [#2727](https://github.com/sourcegraph/cody/pull/2727)
- Improve Knip config [#2726](https://github.com/sourcegraph/cody/pull/2726)
- bump symf version -> 0.0.4 [#2725](https://github.com/sourcegraph/cody/pull/2725)
- show eslint warnings [#2724](https://github.com/sourcegraph/cody/pull/2724)
- rm more unused code [#2723](https://github.com/sourcegraph/cody/pull/2723)
- rm unused code [#2722](https://github.com/sourcegraph/cody/pull/2722)
- Add more agent tests [#2721](https://github.com/sourcegraph/cody/pull/2721)
- Agent: add support for `commands/{test,smell,explain}` [#2719](https://github.com/sourcegraph/cody/pull/2719)
- VS Code: Release 1.1.3 [#2718](https://github.com/sourcegraph/cody/pull/2718)
- added IDEA .iml files and vsix to gitignore [#2717](https://github.com/sourcegraph/cody/pull/2717)
- Autocomplete: Add support for Starcoder Enterprise virtual model identifier [#2714](https://github.com/sourcegraph/cody/pull/2714)
- Edit: Fix file/symbol hint showing unnecessarily [#2712](https://github.com/sourcegraph/cody/pull/2712)
- Chat/Edit: Fix symbol hint label typo [#2711](https://github.com/sourcegraph/cody/pull/2711)
- Edit: Update code lens to be more descriptive [#2710](https://github.com/sourcegraph/cody/pull/2710)
- Agent: add new `chat/restore` endpoint [#2709](https://github.com/sourcegraph/cody/pull/2709)
- fix capitalization [#2708](https://github.com/sourcegraph/cody/pull/2708)
- Edit: Maintain original insertion point when concurrent edits are being applied [#2707](https://github.com/sourcegraph/cody/pull/2707)
- run `tsc --watch` for project-wide TypeScript diagnostics [#2706](https://github.com/sourcegraph/cody/pull/2706)
- remove unused code [#2705](https://github.com/sourcegraph/cody/pull/2705)
- make all eslint warnings into errors, be a bit more lenient [#2702](https://github.com/sourcegraph/cody/pull/2702)
- remove custom cody.chat.open.file command, proxy standard vscode.open [#2701](https://github.com/sourcegraph/cody/pull/2701)
- disable eslint no-explicit-any [#2700](https://github.com/sourcegraph/cody/pull/2700)
- VS Code: use `--goto` another file [#2699](https://github.com/sourcegraph/cody/pull/2699)
- disable github copilot extension when debugging vscode extension [#2698](https://github.com/sourcegraph/cody/pull/2698)
- rm old onboarding state code (from Oct 2023) [#2696](https://github.com/sourcegraph/cody/pull/2696)
- remove now-unreachable chat history keyed on primary email [#2695](https://github.com/sourcegraph/cody/pull/2695)
- Cleanup: Remove unused "Reranker" [#2694](https://github.com/sourcegraph/cody/pull/2694)
- remove unused codebase-specific ignores [#2692](https://github.com/sourcegraph/cody/pull/2692)
- standardize vite/vitest config [#2691](https://github.com/sourcegraph/cody/pull/2691)
- fix CI flakes in AutocompleteMatcher.test.ts [#2690](https://github.com/sourcegraph/cody/pull/2690)
- Agent: use `temperature: 0` in HTTP recordings [#2683](https://github.com/sourcegraph/cody/pull/2683)
- Autocomplete: insert missing brackets before completion truncation [#2682](https://github.com/sourcegraph/cody/pull/2682)
- trim unused parts of ChatManager and SidebarViewController [#2681](https://github.com/sourcegraph/cody/pull/2681)
- VSCode: Remove close button from Enhanced Context Settings popup [#2680](https://github.com/sourcegraph/cody/pull/2680)
- show context files explicitly included (@-mentioned) by user [#2679](https://github.com/sourcegraph/cody/pull/2679)
- hydrate values passed via postMessage [#2678](https://github.com/sourcegraph/cody/pull/2678)
- update cody pro status when window refocuses [#2677](https://github.com/sourcegraph/cody/pull/2677)
- VS Code: Release 1.1.2 [#2676](https://github.com/sourcegraph/cody/pull/2676)
- send transcript data as `privateMetadata` for v2 telemetry only [#2675](https://github.com/sourcegraph/cody/pull/2675)
- Fixing Steal Cursor Issue [#2674](https://github.com/sourcegraph/cody/pull/2674)
- VSCode, Clean up: Remove classic context status indicator [#2673](https://github.com/sourcegraph/cody/pull/2673)
- Make the Enterprise login button more prominent [#2672](https://github.com/sourcegraph/cody/pull/2672)
- Autocomplete: fix ollama doc [#2671](https://github.com/sourcegraph/cody/pull/2671)
- VS Code: Release 1.1.1 [#2668](https://github.com/sourcegraph/cody/pull/2668)
- VS Code: Release 1.1.0 [#2666](https://github.com/sourcegraph/cody/pull/2666)
- Autocomplete: Improve jaccard similiarty retriever [#2662](https://github.com/sourcegraph/cody/pull/2662)
- DX: add `pnpm -C vscode run release:dry-run` to the CI build check [#2661](https://github.com/sourcegraph/cody/pull/2661)
- Autocomplete: hide ollama settings [#2660](https://github.com/sourcegraph/cody/pull/2660)
- docs: fix package extension command [#2659](https://github.com/sourcegraph/cody/pull/2659)
- Agent: add support for client-side progress bars [#2658](https://github.com/sourcegraph/cody/pull/2658)
- agent: return client-provided anonymous user ID from localStorage [#2657](https://github.com/sourcegraph/cody/pull/2657)
- fix grammar ("Use { => the} following") in prompt template [#2656](https://github.com/sourcegraph/cody/pull/2656)
- rm unused component ContextFiles [#2655](https://github.com/sourcegraph/cody/pull/2655)
- remove accidentally committed log [#2654](https://github.com/sourcegraph/cody/pull/2654)
- remove `ContextFile.fileName`, use URIs instead [#2653](https://github.com/sourcegraph/cody/pull/2653)
- Autocomplete: Fix retrieval hints [#2652](https://github.com/sourcegraph/cody/pull/2652)
- skip (instead of hanging indefinitely on) non-text context files [#2650](https://github.com/sourcegraph/cody/pull/2650)
- add missing changelog entry for pull/2627 [#2647](https://github.com/sourcegraph/cody/pull/2647)
- Symf: move term expansion into VS Code extension [#2644](https://github.com/sourcegraph/cody/pull/2644)
- VS Code: Disable displaying feature limits [#2643](https://github.com/sourcegraph/cody/pull/2643)
- Agent: add symf support and enabled keyword context by default [#2641](https://github.com/sourcegraph/cody/pull/2641)
- Do not require a root build for agent unit tests [#2638](https://github.com/sourcegraph/cody/pull/2638)
- Autocomplete: experimental autocomplete Ollama provider [#2635](https://github.com/sourcegraph/cody/pull/2635)
- annotate type-only exports/imports with `type` [#2634](https://github.com/sourcegraph/cody/pull/2634)
- Autocomplete: Add a new 16b exclusive experiment and document existing flags [#2632](https://github.com/sourcegraph/cody/pull/2632)
- do not require separate build process for storybooks [#2631](https://github.com/sourcegraph/cody/pull/2631)
- use new simpler/faster eslint project config [#2630](https://github.com/sourcegraph/cody/pull/2630)
- Edit: Reflect functionality and scope in quick pick [#2629](https://github.com/sourcegraph/cody/pull/2629)
- Autocomplete: use `NodeResponse` in the autocomplete client [#2626](https://github.com/sourcegraph/cody/pull/2626)
- Edit/Chat: Add ghost text alongside code [#2611](https://github.com/sourcegraph/cody/pull/2611)
- add: log enhanced context toggle clicks [#2608](https://github.com/sourcegraph/cody/pull/2608)
- Autocomplete: Remove unused feature flags [#2607](https://github.com/sourcegraph/cody/pull/2607)
- Autocomplete: Tweak user-delay maximum timer and decrease steps [#2606](https://github.com/sourcegraph/cody/pull/2606)
- Autocomplete: Remove unused cody-autocomplete-disable-recycling-of-previous-requests flag [#2605](https://github.com/sourcegraph/cody/pull/2605)
- Agent: optimize HTTP recording file for human reviews [#2604](https://github.com/sourcegraph/cody/pull/2604)
- Autocomplete: drop leftover console.log [#2603](https://github.com/sourcegraph/cody/pull/2603)
- Cleanup test code and add tests for rate limits [#2602](https://github.com/sourcegraph/cody/pull/2602)
- Autocomplete: add unit tests for dynamic multiline completions [#2598](https://github.com/sourcegraph/cody/pull/2598)
- Don't skip setting ignore files when not in a codebase [#2587](https://github.com/sourcegraph/cody/pull/2587)
- Specify git merge strategy for HTTP recording file [#2582](https://github.com/sourcegraph/cody/pull/2582)
- Fix changelog entry [#2581](https://github.com/sourcegraph/cody/pull/2581)
- Clean up Polly recordings to reduce diffs when re-recording [#2577](https://github.com/sourcegraph/cody/pull/2577)
- Edit: Support user provided files ("@name") and symbols ("@#name") [#2574](https://github.com/sourcegraph/cody/pull/2574)
- Autocomplete: do not adjust insert text in a VS Code-specific way for the agent [#2573](https://github.com/sourcegraph/cody/pull/2573)
- Autocomplete: split up completion item provider [#2572](https://github.com/sourcegraph/cody/pull/2572)
- Add install/auth events to `loggedEvents` in e2e tests [#2569](https://github.com/sourcegraph/cody/pull/2569)
- Cody VS Code: Release 1.0.5 [#2567](https://github.com/sourcegraph/cody/pull/2567)
- Autocomplete: adjust leading whitespace in the last candidate text on indentation [#2560](https://github.com/sourcegraph/cody/pull/2560)
- Making the Cody UI configurable by Site Admin [#2559](https://github.com/sourcegraph/cody/pull/2559)
- Adding Semgrep SAST Scanner [#2552](https://github.com/sourcegraph/cody/pull/2552)
- Move VS Code chat attribution search to extension process [#2550](https://github.com/sourcegraph/cody/pull/2550)
- Edit: Refactor away from `MessageProvider` and `Recipe` [#2549](https://github.com/sourcegraph/cody/pull/2549)
- Autocomplete: skip request manager cache on manual completion trigger [#2546](https://github.com/sourcegraph/cody/pull/2546)
- replace link to google form with pricing page [#2541](https://github.com/sourcegraph/cody/pull/2541)
- Chat: fallback to local keyword search when embeddings fail [#2540](https://github.com/sourcegraph/cody/pull/2540)
- OpenAI provider requires use of topP parameter [#2526](https://github.com/sourcegraph/cody/pull/2526)
- Chat attribution UI [#2521](https://github.com/sourcegraph/cody/pull/2521)
- Pass URIs for some context snippets [#2520](https://github.com/sourcegraph/cody/pull/2520)
- Autocomplete: add console-exporter for autocomplete OpenTelemetry tracing [#2489](https://github.com/sourcegraph/cody/pull/2489)
- Autocomplete: improve autocomplete tracing util [#2487](https://github.com/sourcegraph/cody/pull/2487)
- Autocomplete: add `experimental.tracing` setting for local debugging [#2486](https://github.com/sourcegraph/cody/pull/2486)
- VS Code: remove redundant cancellation logic from the click handler [#2479](https://github.com/sourcegraph/cody/pull/2479)
- VS Code: remove redundant abort controller [#2478](https://github.com/sourcegraph/cody/pull/2478)
- Fix duplication of query when selecting a context file that already exists earlier in the input [#2474](https://github.com/sourcegraph/cody/pull/2474)
- Ensure pressing Up to re-send chat messages includes same context files [#2473](https://github.com/sourcegraph/cody/pull/2473)
- Remove "bin/" from search ignore and just rank low unless typed [#2472](https://github.com/sourcegraph/cody/pull/2472)
- VS Code: call the error callback only once per request [#2471](https://github.com/sourcegraph/cody/pull/2471)
- VS Code: require `userInfo` prop [#2470](https://github.com/sourcegraph/cody/pull/2470)
- VS Code: Release 1.0.4 [#2458](https://github.com/sourcegraph/cody/pull/2458)
- Agent: prepare to fix chat parity [#2457](https://github.com/sourcegraph/cody/pull/2457)
- Remove serverEndpoint from config object [#2456](https://github.com/sourcegraph/cody/pull/2456)
- RFC: Detect and close stale issues and PRs [#2454](https://github.com/sourcegraph/cody/pull/2454)
- Only open renovate PRs manually [#2453](https://github.com/sourcegraph/cody/pull/2453)
- VS Code: Release 1.0.3 [#2447](https://github.com/sourcegraph/cody/pull/2447)
- Autocomplete: Do not trigger a completion if a single-line completion was accepted [#2446](https://github.com/sourcegraph/cody/pull/2446)
- Fix logging issue [#2444](https://github.com/sourcegraph/cody/pull/2444)
- Automate VS Code release GitHub changelog [#2441](https://github.com/sourcegraph/cody/pull/2441)
- Adding support to save the locally selected model so that new chats don´t require repeated model selection [#2438](https://github.com/sourcegraph/cody/pull/2438)
- Fix: Handle Azure DevOps Codebase URLs Automatically from Git Metadata [#2435](https://github.com/sourcegraph/cody/pull/2435)
- VS Code: Release 1.0.2 [#2432](https://github.com/sourcegraph/cody/pull/2432)
- Fix code lenses feature [#2430](https://github.com/sourcegraph/cody/pull/2430)
- Autocomplete: extract the shared generate completions logic [#2426](https://github.com/sourcegraph/cody/pull/2426)
- Autocomplete: extract the shared completion params logic [#2425](https://github.com/sourcegraph/cody/pull/2425)
- Fix Debug Instructions [#2422](https://github.com/sourcegraph/cody/pull/2422)
- Add missing handlers to vscode-shim [#2418](https://github.com/sourcegraph/cody/pull/2418)
- Chat: honor cody.codebase setting [#2415](https://github.com/sourcegraph/cody/pull/2415)
- Use correct file sources instead of always showing 'embeddings' in chat context [#2408](https://github.com/sourcegraph/cody/pull/2408)
- Ensure all explicitly-mentioned files are included in chats [#2405](https://github.com/sourcegraph/cody/pull/2405)
- Fix encoding of file paths in chat links [#2398](https://github.com/sourcegraph/cody/pull/2398)
- VS Code: Release 1.0.1 [#2397](https://github.com/sourcegraph/cody/pull/2397)
- Chat: Honor enterprise token limits [#2395](https://github.com/sourcegraph/cody/pull/2395)
- Hide LLM dropdown for enterprise users [#2393](https://github.com/sourcegraph/cody/pull/2393)
- Handle connection close events with no prior errors or messages [#2391](https://github.com/sourcegraph/cody/pull/2391)
- set more conservative limit for gpt-3.5-turbo to stay under window limit [#2386](https://github.com/sourcegraph/cody/pull/2386)
- Update "Start New Chat" button label casing [#2385](https://github.com/sourcegraph/cody/pull/2385)
- VS Code: Release 1.0.0 [#2377](https://github.com/sourcegraph/cody/pull/2377)
- chat: display CTA to create new chat when context limit reached [#2374](https://github.com/sourcegraph/cody/pull/2374)
- Chat: Re-add /edit and /doc commands [#2373](https://github.com/sourcegraph/cody/pull/2373)
- Chat: use the correct user tier in the upsell event [#2372](https://github.com/sourcegraph/cody/pull/2372)
- set context window limit by model [#2371](https://github.com/sourcegraph/cody/pull/2371)
- Chat: send `openLLMDropdown:clicked` only on dropdown open [#2370](https://github.com/sourcegraph/cody/pull/2370)
- docs: update dev docs to include `pnpm build` [#2369](https://github.com/sourcegraph/cody/pull/2369)
- Embeddings: Display accurate percent done; do not toast continued embeddings failure [#2368](https://github.com/sourcegraph/cody/pull/2368)
- Fix code smell icon [#2367](https://github.com/sourcegraph/cody/pull/2367)
- Update rate limit error messages for Cody Pro users [#2364](https://github.com/sourcegraph/cody/pull/2364)
- VSCode: Roll cody-engine to v5.2.12792 [#2359](https://github.com/sourcegraph/cody/pull/2359)
- VSCode: Fix local embeddings e2e test to specifically check that *embeddings* are indexed [#2358](https://github.com/sourcegraph/cody/pull/2358)
- [ONLY MERGE FOR 1.0 RELEASE] Update Marketplace README with new gifs, free/pro info, and NLS [#2357](https://github.com/sourcegraph/cody/pull/2357)
- telemetry-v2: generate timestamps locally for sourcegraph 5.2.5+ [#2355](https://github.com/sourcegraph/cody/pull/2355)
- change nls label to beta [#2351](https://github.com/sourcegraph/cody/pull/2351)
- VS Code: Release 0.18.6 [#2349](https://github.com/sourcegraph/cody/pull/2349)
- Chat: Scope history to user account [#2348](https://github.com/sourcegraph/cody/pull/2348)
- Remove mention of Free/Pro from marketplace [#2347](https://github.com/sourcegraph/cody/pull/2347)
- Chat: Fix settings menu not opening on click [#2346](https://github.com/sourcegraph/cody/pull/2346)
- Chat: Fix chat panel titles [#2345](https://github.com/sourcegraph/cody/pull/2345)
- Chat Context: Provide relative path as current file [#2344](https://github.com/sourcegraph/cody/pull/2344)
- Agent: skip file system tests on Windows for now [#2341](https://github.com/sourcegraph/cody/pull/2341)
- Edit: Update the changelog with a bunch of missed fixes from the last release [#2340](https://github.com/sourcegraph/cody/pull/2340)
- Custom Commands: Filter out insert and edit commands from chat input [#2339](https://github.com/sourcegraph/cody/pull/2339)
- Agent: add test case to accept autocomplete [#2337](https://github.com/sourcegraph/cody/pull/2337)
- Chat: Fix cody icon font usage [#2336](https://github.com/sourcegraph/cody/pull/2336)
- Agent: enable source maps in `pnpm agent` [#2334](https://github.com/sourcegraph/cody/pull/2334)
- Agent: enable source maps in tests [#2333](https://github.com/sourcegraph/cody/pull/2333)
- Remove complete command from CLI [#2332](https://github.com/sourcegraph/cody/pull/2332)
- Autocomplete: format completions on accept [#2327](https://github.com/sourcegraph/cody/pull/2327)
- Autocomplete: remove stop sequences for dynamuc multliline completions [#2326](https://github.com/sourcegraph/cody/pull/2326)
- chat: use search context by default [#2325](https://github.com/sourcegraph/cody/pull/2325)
- Autocomplete: fix invalid position [#2324](https://github.com/sourcegraph/cody/pull/2324)
- Autocomplete: log raw error in the development env [#2323](https://github.com/sourcegraph/cody/pull/2323)
- Autocomplete: remove `scminput` from the autocomplete languages setting default value [#2322](https://github.com/sourcegraph/cody/pull/2322)
- update pr-auditor token [#2321](https://github.com/sourcegraph/cody/pull/2321)
- Chore: Skip flaky agent chat cancellation test [#2320](https://github.com/sourcegraph/cody/pull/2320)
- Autocomplete: Don't show loading spinner when rate limited [#2314](https://github.com/sourcegraph/cody/pull/2314)
- Chat: Fix reset recipe [#2313](https://github.com/sourcegraph/cody/pull/2313)
- Fix rate limit number being displayed [#2312](https://github.com/sourcegraph/cody/pull/2312)
- VS Code: Release 0.18.5 [#2308](https://github.com/sourcegraph/cody/pull/2308)
- Chat: Add Mixtral as a chat model [#2307](https://github.com/sourcegraph/cody/pull/2307)
- Commands: Include /test [#2305](https://github.com/sourcegraph/cody/pull/2305)
- Edit: Flush diffs on apply [#2304](https://github.com/sourcegraph/cody/pull/2304)
- Chore: Remove some GHA `ifs` that didn't work [#2299](https://github.com/sourcegraph/cody/pull/2299)
- Chat: Update welcome message [#2298](https://github.com/sourcegraph/cody/pull/2298)
- Edit: Do not scroll into view on complete [#2297](https://github.com/sourcegraph/cody/pull/2297)
- Edit: Fix doc command jumping unnecessarily [#2296](https://github.com/sourcegraph/cody/pull/2296)
- remove rg-based local keyword context fetcher [#2295](https://github.com/sourcegraph/cody/pull/2295)
- Chat: Add tooltip to disabled chat model selector [#2294](https://github.com/sourcegraph/cody/pull/2294)
- Fix keyDown:Paste:clicked events [#2293](https://github.com/sourcegraph/cody/pull/2293)
- Simple chat: Bring back chat telemetry [#2291](https://github.com/sourcegraph/cody/pull/2291)
- Edit: Fix malformed comments from doc command with selection [#2290](https://github.com/sourcegraph/cody/pull/2290)
- Update rate limit error wording for Cody Pro users [#2287](https://github.com/sourcegraph/cody/pull/2287)
- Settings: Remove the "Simple Chat Context" setting [#2286](https://github.com/sourcegraph/cody/pull/2286)
- Settings: Relabel "symf Context" as "Search Context" [#2285](https://github.com/sourcegraph/cody/pull/2285)
- Chat: Remove Chat Suggestions setting that no longer works [#2284](https://github.com/sourcegraph/cody/pull/2284)
- docs: update docs to new url [#2283](https://github.com/sourcegraph/cody/pull/2283)
- Update the marketplace readme to match product features [#2280](https://github.com/sourcegraph/cody/pull/2280)
- Update walkthrough to match product features [#2279](https://github.com/sourcegraph/cody/pull/2279)
- Clean up VS Code Extension Settings [#2278](https://github.com/sourcegraph/cody/pull/2278)
- Add cody-pro-jetbrains feature flag [#2274](https://github.com/sourcegraph/cody/pull/2274)
- telemetry-v2: fix splitSafeMetadata to generate acceptable type [#2273](https://github.com/sourcegraph/cody/pull/2273)
- use context.globalStorageUri for symf indexes [#2271](https://github.com/sourcegraph/cody/pull/2271)
- VS Code: Release 0.18.4 [#2268](https://github.com/sourcegraph/cody/pull/2268)
- Do not await `showSetupNotification` [#2267](https://github.com/sourcegraph/cody/pull/2267)
- VSCode: Make embeddings errors visible, resume indexing on restart [#2265](https://github.com/sourcegraph/cody/pull/2265)
- VS Code: Release 0.18.3 [#2262](https://github.com/sourcegraph/cody/pull/2262)
- Chat: Add support for cody.chat.preInstruction in the new preamble [#2255](https://github.com/sourcegraph/cody/pull/2255)
- Chat: Update chat icon and transcript gradient [#2254](https://github.com/sourcegraph/cody/pull/2254)
- Disable gzip compression for SSE streams [#2251](https://github.com/sourcegraph/cody/pull/2251)
- Implement history quick pick [#2250](https://github.com/sourcegraph/cody/pull/2250)
- VSCode: Local Embeddings should pick up initial access token [#2247](https://github.com/sourcegraph/cody/pull/2247)
- Only search relative paths when @-mentioning files in chat [#2241](https://github.com/sourcegraph/cody/pull/2241)
- Fix pre-release version numbers not being correctly detected [#2240](https://github.com/sourcegraph/cody/pull/2240)
- VSCode: Fix local embeddings status for non-git workspaces, git repos w/out remotes [#2235](https://github.com/sourcegraph/cody/pull/2235)
- VS Code: Release 0.18.2 [#2234](https://github.com/sourcegraph/cody/pull/2234)
- Replace "Sign Out" with an account dialog [#2233](https://github.com/sourcegraph/cody/pull/2233)
- Update CHANGELOG.md [#2232](https://github.com/sourcegraph/cody/pull/2232)
- Update CHANGELOG.md [#2226](https://github.com/sourcegraph/cody/pull/2226)
- send sigkill to symf when extension exits [#2225](https://github.com/sourcegraph/cody/pull/2225)
- Mark Upgrade/Usage links as dot-com only [#2219](https://github.com/sourcegraph/cody/pull/2219)
- Don't duplicate @-filenames when pressing tab if the whole string has been typed [#2218](https://github.com/sourcegraph/cody/pull/2218)
- Handle context file searching using forward slashes on Windows [#2215](https://github.com/sourcegraph/cody/pull/2215)
- Search: Only show search instructions on hover or focus [#2212](https://github.com/sourcegraph/cody/pull/2212)
- JetBrains: Fix missing context files in the chat response [#2211](https://github.com/sourcegraph/cody/pull/2211)
- Fix "Release Notes" label & link for pre-releases in sidebar [#2210](https://github.com/sourcegraph/cody/pull/2210)
- Allow dotfiles to be included in context files list [#2209](https://github.com/sourcegraph/cody/pull/2209)
- Fix symf index dir on Windows [#2207](https://github.com/sourcegraph/cody/pull/2207)
- Adding endpoint for fetching feature flag [#2204](https://github.com/sourcegraph/cody/pull/2204)
- symf: support cancelling index [#2202](https://github.com/sourcegraph/cody/pull/2202)
- Add rate limit upgrade for code edits [#2201](https://github.com/sourcegraph/cody/pull/2201)
- VSCode: Do not parse Windows file paths as URIs [#2197](https://github.com/sourcegraph/cody/pull/2197)
- Fix cursor blink issue and ensure proper chat initialization synchronization [#2193](https://github.com/sourcegraph/cody/pull/2193)
- evaluate-autocomplete: more advanced triggering [#2189](https://github.com/sourcegraph/cody/pull/2189)
- Update intro chat message to be clear about coding questions [#2187](https://github.com/sourcegraph/cody/pull/2187)
- VSCode: Send `embeddings/initialize` to the local embeddings controller [#2183](https://github.com/sourcegraph/cody/pull/2183)
- Reset feature flags when switching through logins [#2182](https://github.com/sourcegraph/cody/pull/2182)
- Autocomplete: Remove top_p when using temperature [#2178](https://github.com/sourcegraph/cody/pull/2178)
- VS Code: Release 0.18.1 [#2177](https://github.com/sourcegraph/cody/pull/2177)
- ensure error message makes it through to chat view [#2176](https://github.com/sourcegraph/cody/pull/2176)
- Chat: Improve Pro upgrade CTA styles [#2175](https://github.com/sourcegraph/cody/pull/2175)
- Add missing changelogs [#2174](https://github.com/sourcegraph/cody/pull/2174)
- Chat: Improve slash command heading padding [#2173](https://github.com/sourcegraph/cody/pull/2173)
- Enable symf-based context for chat (cody.experimental.symfContext) [#2166](https://github.com/sourcegraph/cody/pull/2166)
- chat: fix abort [#2159](https://github.com/sourcegraph/cody/pull/2159)
- support custom commands in simple chat [#2153](https://github.com/sourcegraph/cody/pull/2153)
- Fix rate limit messages for short time spans [#2152](https://github.com/sourcegraph/cody/pull/2152)
- Fix isRateLimitError [#2151](https://github.com/sourcegraph/cody/pull/2151)
- chat: always include selection in enhanced context [#2144](https://github.com/sourcegraph/cody/pull/2144)
- Chat: Update message input placeholder to mention slash commands [#2142](https://github.com/sourcegraph/cody/pull/2142)
- Chat: Fix message input overlapping with enhanced context button [#2141](https://github.com/sourcegraph/cody/pull/2141)
- Search: Style and UX improvements to the search panel [#2138](https://github.com/sourcegraph/cody/pull/2138)
- Chat: Reduce size of chats list blank copy [#2137](https://github.com/sourcegraph/cody/pull/2137)
- plg: display errors when autocomplete rate limits trigger [#2135](https://github.com/sourcegraph/cody/pull/2135)
- Chat: update embeddings and codebase identifiers [#2130](https://github.com/sourcegraph/cody/pull/2130)
- Chat: Speed up chat panel debounce w/ trigger on leading edge too [#2126](https://github.com/sourcegraph/cody/pull/2126)
- enable simple chat context by default [#2120](https://github.com/sourcegraph/cody/pull/2120)
- Autocomplete: Add Experimental hot streak mode [#2118](https://github.com/sourcegraph/cody/pull/2118)
- Add a Chat Settings button in Chat panels [#2117](https://github.com/sourcegraph/cody/pull/2117)
- Update dependency eslint to ^8.55.0 [#2116](https://github.com/sourcegraph/cody/pull/2116)
- Chat: Fix infinite loop when searching for symbols [#2114](https://github.com/sourcegraph/cody/pull/2114)
- Link to new Cody feedback URL [#2113](https://github.com/sourcegraph/cody/pull/2113)
- VS Code: Release 0.18.0 [#2111](https://github.com/sourcegraph/cody/pull/2111)
- Autocomplete: Log both the status bar item and the CTA [#2110](https://github.com/sourcegraph/cody/pull/2110)
- Commands: Expose commands in the VS Code command palette and clean up the context menu [#2109](https://github.com/sourcegraph/cody/pull/2109)
- plg: fix incorrect commands for admin buttons [#2106](https://github.com/sourcegraph/cody/pull/2106)
- Make abort work in the simplified chat panel [#2103](https://github.com/sourcegraph/cody/pull/2103)
- Chat: Line break folder names in Enhanced Context popover [#2102](https://github.com/sourcegraph/cody/pull/2102)
- vscode: Remove App login [#2099](https://github.com/sourcegraph/cody/pull/2099)
- Incorporate Cody preamble into simple chat provider [#2098](https://github.com/sourcegraph/cody/pull/2098)
- Chat: Show onboarding glowy dot guide until first time opening Enhanced Context [#2097](https://github.com/sourcegraph/cody/pull/2097)
- Chat: Close the Enhanced Context popover on chat input focus [#2091](https://github.com/sourcegraph/cody/pull/2091)
- change: reuse empty "New Chat" panel [#2087](https://github.com/sourcegraph/cody/pull/2087)
- update enhance context display copy [#2086](https://github.com/sourcegraph/cody/pull/2086)
- telemetry: add v2 interactionID support [#2085](https://github.com/sourcegraph/cody/pull/2085)
- Update dependency @types/react to v18.2.42 [#2084](https://github.com/sourcegraph/cody/pull/2084)
- change: enable new chat and search UIs by default [#2079](https://github.com/sourcegraph/cody/pull/2079)
- Set ChatModels behind codypro feature flag [#2077](https://github.com/sourcegraph/cody/pull/2077)
- Autocomplete: Log rate limit message and interactions [#2076](https://github.com/sourcegraph/cody/pull/2076)
- Chat: Improve enhanced context popover and button styles [#2075](https://github.com/sourcegraph/cody/pull/2075)
- Agent: add parsing test to evaluate-autocomplete [#2074](https://github.com/sourcegraph/cody/pull/2074)
- Replace windows-arm64 with windows-x84 binary [#2073](https://github.com/sourcegraph/cody/pull/2073)
- Autocomplete: Remove Wizardcoder support [#2072](https://github.com/sourcegraph/cody/pull/2072)
- Autocomplete: Fix dynamic multiline feature flag typo [#2071](https://github.com/sourcegraph/cody/pull/2071)
- VScode: Do not toggle "Enhanced context" off automatically. [#2069](https://github.com/sourcegraph/cody/pull/2069)
- Add a test for non-dotCom chat rate limit [#2068](https://github.com/sourcegraph/cody/pull/2068)
- Fix flaky e2e chat tests [#2061](https://github.com/sourcegraph/cody/pull/2061)
- Add V2 telemetry to remaining Cody events [#2060](https://github.com/sourcegraph/cody/pull/2060)
- log chat rate limit events [#2057](https://github.com/sourcegraph/cody/pull/2057)
- VS Code: Cody release v0.16.3 [#2055](https://github.com/sourcegraph/cody/pull/2055)
- add telemetry for LLM selection and CTA clicks [#2052](https://github.com/sourcegraph/cody/pull/2052)
- Refresh Cody Pro status on editor focus change [#2049](https://github.com/sourcegraph/cody/pull/2049)
- Agent: single instances of AgentTextDocument per uri [#2048](https://github.com/sourcegraph/cody/pull/2048)
- BFG: index git repository from subfolders and workspaces with no git repositories [#2047](https://github.com/sourcegraph/cody/pull/2047)
- Docs: Update changelog for #1883 [#2046](https://github.com/sourcegraph/cody/pull/2046)
- Embeddings: Display indexing status in Enhanced Context Selector, query new index when done [#2045](https://github.com/sourcegraph/cody/pull/2045)
- Update dependency eslint to ^8.54.0 [#2043](https://github.com/sourcegraph/cody/pull/2043)
- VS Code: Cody release v0.16.2 [#2042](https://github.com/sourcegraph/cody/pull/2042)
- Update react monorepo [#2039](https://github.com/sourcegraph/cody/pull/2039)
- Update dependency @types/isomorphic-fetch to ^0.0.39 [#2036](https://github.com/sourcegraph/cody/pull/2036)
- Update dependency @types/google-protobuf to ^3.15.10 [#2035](https://github.com/sourcegraph/cody/pull/2035)
- VS Code: hide experimental settings for stable releases [#2034](https://github.com/sourcegraph/cody/pull/2034)
- Clarify pre-release builds in changelog [#2033](https://github.com/sourcegraph/cody/pull/2033)
- VScode: Enhanced context selector updates in new "not simplified" panel chats [#2030](https://github.com/sourcegraph/cody/pull/2030)
- make commands work with SimpleChatPanelProvider [#2018](https://github.com/sourcegraph/cody/pull/2018)
- Edit: Rename diff view from Fixup to Edit [#2015](https://github.com/sourcegraph/cody/pull/2015)
- BFG: bump to latest version [#2014](https://github.com/sourcegraph/cody/pull/2014)
- BFG: increase resilience [#2013](https://github.com/sourcegraph/cody/pull/2013)
- VScode: Start up local embeddings less often [#2010](https://github.com/sourcegraph/cody/pull/2010)
- Add a handling for other context strategies [#2008](https://github.com/sourcegraph/cody/pull/2008)
- Update changelog for #2004 [#2007](https://github.com/sourcegraph/cody/pull/2007)
- Autocomplete: stop some dynamic multiline completions early [#2006](https://github.com/sourcegraph/cody/pull/2006)
- Edit: Only affix non-whitespace changes to ranges [#2005](https://github.com/sourcegraph/cody/pull/2005)
- Edit: Fix edit command palette [#2004](https://github.com/sourcegraph/cody/pull/2004)
- Change "Restart Chat Session" icon and add a confirmation [#2002](https://github.com/sourcegraph/cody/pull/2002)
- Autocomplete: extended multiline triggers inside brackets [#2000](https://github.com/sourcegraph/cody/pull/2000)
- change: display sorted commands in ui [#1998](https://github.com/sourcegraph/cody/pull/1998)
- change: rename chat panel command title [#1996](https://github.com/sourcegraph/cody/pull/1996)
- Fix TextDocumentWithUri when uri is not set [#1991](https://github.com/sourcegraph/cody/pull/1991)
- Disable flaky markdown test in Node.js v16 [#1990](https://github.com/sourcegraph/cody/pull/1990)
- Agent: fix URI fallback for autocomplete requests [#1988](https://github.com/sourcegraph/cody/pull/1988)
- Autocomplete: Use OpenTelemtry traceparent logic [#1987](https://github.com/sourcegraph/cody/pull/1987)
- BFG: bump version [#1986](https://github.com/sourcegraph/cody/pull/1986)
- Autocomplete: fix multiline trigger position calculation [#1985](https://github.com/sourcegraph/cody/pull/1985)
- Autocomplete: Document manual completion trigger action [#1982](https://github.com/sourcegraph/cody/pull/1982)
- Reduce noise in test logs [#1981](https://github.com/sourcegraph/cody/pull/1981)
- Roll cody-engine to v5.2.9998. [#1961](https://github.com/sourcegraph/cody/pull/1961)
- new chat panel: trigger progress indicator [#1952](https://github.com/sourcegraph/cody/pull/1952)
- change: display chat model dropdown to pros only [#1942](https://github.com/sourcegraph/cody/pull/1942)
- Agent: use `uri: vscode.Uri` instead of `filePath: string` [#1928](https://github.com/sourcegraph/cody/pull/1928)
- Edit: Update sidebar copy [#1927](https://github.com/sourcegraph/cody/pull/1927)
- Edit: Use a tracked `originalRange` when retrying a task [#1926](https://github.com/sourcegraph/cody/pull/1926)
- change: replace vscode links with command [#1919](https://github.com/sourcegraph/cody/pull/1919)
- telemetry-v2: apply #1871 to v2 setup [#1916](https://github.com/sourcegraph/cody/pull/1916)
- telemetry: tee completions events to telemetry v2 [#1913](https://github.com/sourcegraph/cody/pull/1913)
- change: open new chat panels on top of active one [#1912](https://github.com/sourcegraph/cody/pull/1912)
- Agent: flip cody.telemetry.level to 'agent' [#1911](https://github.com/sourcegraph/cody/pull/1911)
- add: include text in dotCom chat events [#1910](https://github.com/sourcegraph/cody/pull/1910)
- change: show editor icon in non-ready only [#1909](https://github.com/sourcegraph/cody/pull/1909)
- Edit: Show notification when no valid document [#1901](https://github.com/sourcegraph/cody/pull/1901)
- Edit: Faster `doc` workflow with more target context [#1900](https://github.com/sourcegraph/cody/pull/1900)
- Emit Auth:connected event to correct endpoint for agent [#1899](https://github.com/sourcegraph/cody/pull/1899)
- Merge back 0.16.1 patch release into main [#1898](https://github.com/sourcegraph/cody/pull/1898)
- VScode: Enhanced context settings dialog and add local embeddings [#1897](https://github.com/sourcegraph/cody/pull/1897)
- Fix types for autocomplete agent notifications [#1895](https://github.com/sourcegraph/cody/pull/1895)
- Autocomplete: dynamically switch to multliline completions [#1894](https://github.com/sourcegraph/cody/pull/1894)
- Autocomplete: use a smaller percentage to detect the same string [#1893](https://github.com/sourcegraph/cody/pull/1893)
- Edit: Improve response consistency [#1892](https://github.com/sourcegraph/cody/pull/1892)
- Autocomplete: fix parse completions edit positions [#1891](https://github.com/sourcegraph/cody/pull/1891)
- Fuzzy search for @-ing files and symbols [#1889](https://github.com/sourcegraph/cody/pull/1889)
- DX: log errors with source maps [#1888](https://github.com/sourcegraph/cody/pull/1888)
- [#1811]Added margin for release popup notification [#1887](https://github.com/sourcegraph/cody/pull/1887)
- Telemetry v1 prefix for non-vscode clientse [#1886](https://github.com/sourcegraph/cody/pull/1886)
- Remove Claude Instant Cyan [#1884](https://github.com/sourcegraph/cody/pull/1884)
- Edit: Stream apply insertions line-by-line [#1883](https://github.com/sourcegraph/cody/pull/1883)
- Add rate limit notification/upgrade buttons in chat [#1882](https://github.com/sourcegraph/cody/pull/1882)
- Allow awaiting extension activation instead of being unawaitably async [#1881](https://github.com/sourcegraph/cody/pull/1881)
- Autocomplete: Remove DisableNetworkCache flag [#1880](https://github.com/sourcegraph/cody/pull/1880)
- Fix RateLimitError propagation from autocomplete [#1879](https://github.com/sourcegraph/cody/pull/1879)
- Agent: add testing mode [#1872](https://github.com/sourcegraph/cody/pull/1872)
- Provide anonymousUserId via agent clients [#1871](https://github.com/sourcegraph/cody/pull/1871)
- Automatically merge CHANGELOG entries on conflict [#1870](https://github.com/sourcegraph/cody/pull/1870)
- Autocomplete: Add OpenTelemetry tracing [#1867](https://github.com/sourcegraph/cody/pull/1867)
- evaluate-autocomplete: add support to run test commands [#1866](https://github.com/sourcegraph/cody/pull/1866)
- Fix flaky completion test and clean up console [#1864](https://github.com/sourcegraph/cody/pull/1864)
- Autocomplete: Remove extended token window feature flag [#1863](https://github.com/sourcegraph/cody/pull/1863)
- Autocomplete: Reduce frequency of low performance language [#1862](https://github.com/sourcegraph/cody/pull/1862)
- Autocomplete: Update low performing subset [#1861](https://github.com/sourcegraph/cody/pull/1861)
- evaluate-autocomplete: fix git-log strategy and add more CSV columns [#1859](https://github.com/sourcegraph/cody/pull/1859)
- chat: mock feature flag [#1857](https://github.com/sourcegraph/cody/pull/1857)
- change: custom commands to beta [#1855](https://github.com/sourcegraph/cody/pull/1855)
- change: set ignoreFocusOut to false for custom commands [#1854](https://github.com/sourcegraph/cody/pull/1854)
- move cody.search webview position in sidebar [#1852](https://github.com/sourcegraph/cody/pull/1852)
- Autocomplete: Better document analytics interfaces [#1849](https://github.com/sourcegraph/cody/pull/1849)
- Agent: add option to emit CSV file for `evaluate-autocomplete` [#1847](https://github.com/sourcegraph/cody/pull/1847)
- Add agent notifications for autocomplete events [#1846](https://github.com/sourcegraph/cody/pull/1846)
- Autocomplete: Move decision which StarCoder model to use to the server [#1845](https://github.com/sourcegraph/cody/pull/1845)
- Autocomplete: log `insertText` for DotCom users [#1843](https://github.com/sourcegraph/cody/pull/1843)
- Autocomplete: make javascript completion intent queries more precise [#1839](https://github.com/sourcegraph/cody/pull/1839)
- Autocomplete Evaluation: Add git log evaluation strategy [#1832](https://github.com/sourcegraph/cody/pull/1832)
- Fix: Chat spins forever after errors [#1831](https://github.com/sourcegraph/cody/pull/1831)
- Enable support for legacy event logger in non-vscode clients [#1829](https://github.com/sourcegraph/cody/pull/1829)
- Fix scip-typescript upload job [#1825](https://github.com/sourcegraph/cody/pull/1825)
- Agent: get tests running again [#1824](https://github.com/sourcegraph/cody/pull/1824)
- Autocomplete: drop the `syntactic triggers` feature flag [#1823](https://github.com/sourcegraph/cody/pull/1823)
- Autocomplete: drop autocomplete review tool [#1822](https://github.com/sourcegraph/cody/pull/1822)
- Chat: Edit button to rename history chats [#1818](https://github.com/sourcegraph/cody/pull/1818)
- Update completion rate limit message when upgrade is available [#1807](https://github.com/sourcegraph/cody/pull/1807)
- add feedback and bug templates [#1806](https://github.com/sourcegraph/cody/pull/1806)
- change: disable inline chat by default [#1797](https://github.com/sourcegraph/cody/pull/1797)
- Allow promise return in notifications [#1794](https://github.com/sourcegraph/cody/pull/1794)
- Return 'cody.advanced.agent.ide' from ClientInfo.name [#1791](https://github.com/sourcegraph/cody/pull/1791)
- Edit: Fix leaky XML tags [#1789](https://github.com/sourcegraph/cody/pull/1789)
- Embeddings - explain a service in a codebase - 2 tests [#1788](https://github.com/sourcegraph/cody/pull/1788)
- Capture dependency download issues in Sentry [#1786](https://github.com/sourcegraph/cody/pull/1786)
- Autocomplete: remove top level `charCount` from completion events [#1785](https://github.com/sourcegraph/cody/pull/1785)
- Autocomplete: split doc context calc logic [#1784](https://github.com/sourcegraph/cody/pull/1784)
- Cody Release v0.16.0 [#1777](https://github.com/sourcegraph/cody/pull/1777)
- Agent: add support for fixtures with `evaluate-autocomplete` [#1771](https://github.com/sourcegraph/cody/pull/1771)
- Edit: Fix flickering code lens for users with autoSave enabled [#1767](https://github.com/sourcegraph/cody/pull/1767)
- Docs: Add missing changelog for response time improvements [#1766](https://github.com/sourcegraph/cody/pull/1766)
- Edit: Fix `selectedCode` and `problemCode` appearing in edits [#1765](https://github.com/sourcegraph/cody/pull/1765)
- Autocomplete: Remove unused feature flag [#1753](https://github.com/sourcegraph/cody/pull/1753)
- Autocomplete: Prepare mixed retrieval examples [#1752](https://github.com/sourcegraph/cody/pull/1752)
- Cleanup chat model selector styles [#1750](https://github.com/sourcegraph/cody/pull/1750)
- VS Code: move tree-sitter out of autocomplete dir [#1749](https://github.com/sourcegraph/cody/pull/1749)
- Autocomplete: fix multiline comment intent detection [#1748](https://github.com/sourcegraph/cody/pull/1748)
- Agent: support multiple workspaces with `evaluate-autocomplete` [#1746](https://github.com/sourcegraph/cody/pull/1746)
- Add config error handler [#1739](https://github.com/sourcegraph/cody/pull/1739)
- Autocomplete: Clean up artificial delay implementation [#1737](https://github.com/sourcegraph/cody/pull/1737)
- BFG: rename `bfg` binary name into `cody-engine` [#1736](https://github.com/sourcegraph/cody/pull/1736)
- Add URLs for referrer traffic to READMEs [#1732](https://github.com/sourcegraph/cody/pull/1732)
- BFG: correctly load git repositories [#1728](https://github.com/sourcegraph/cody/pull/1728)
- Chat panel icon update #1693 [#1727](https://github.com/sourcegraph/cody/pull/1727)
- Edit: Add further code actions for editing and documenting code [#1724](https://github.com/sourcegraph/cody/pull/1724)
- Edit: Quality improvements: Add related `fix` context when available [#1723](https://github.com/sourcegraph/cody/pull/1723)
- Chat/Commands: Remove LLM reranker for repos without embeddings [#1722](https://github.com/sourcegraph/cody/pull/1722)
- Autocomplete: do not trigger the partial response callback when the request is aborted [#1719](https://github.com/sourcegraph/cody/pull/1719)
- Autocomplete: use streaming truncation for all completion requests [#1718](https://github.com/sourcegraph/cody/pull/1718)
- Simplify chat prompt construction [#1717](https://github.com/sourcegraph/cody/pull/1717)
- Agent: implement `vscode.workspace.fs` [#1716](https://github.com/sourcegraph/cody/pull/1716)
- agent: add telemetry/recordEvent to replace graphql/logEvent [#1713](https://github.com/sourcegraph/cody/pull/1713)
- shorten prd example and remove unnecessary prefix [#1712](https://github.com/sourcegraph/cody/pull/1712)
- Add new sidebar links [#1711](https://github.com/sourcegraph/cody/pull/1711)
- Autocomplete: Implement a variant of RRF for retrieval mixing [#1710](https://github.com/sourcegraph/cody/pull/1710)
- Autocomplete: truncate multiline completions by the next new sibling [#1709](https://github.com/sourcegraph/cody/pull/1709)
- Clean up login page styles [#1708](https://github.com/sourcegraph/cody/pull/1708)
- Autocomplete: Implement top-k retrieval mixing and make section history a retriever [#1705](https://github.com/sourcegraph/cody/pull/1705)
- Chat Panel: Fix chat history view [#1703](https://github.com/sourcegraph/cody/pull/1703)
- Autocomplete: Shift range when last candidate match is calculated [#1701](https://github.com/sourcegraph/cody/pull/1701)
- change chat panel view column to beside [#1698](https://github.com/sourcegraph/cody/pull/1698)
- remove blank tasklist entries [#1697](https://github.com/sourcegraph/cody/pull/1697)
- Agent: add `evaluate-autocomplete` subcommand [#1688](https://github.com/sourcegraph/cody/pull/1688)
- VS Code: Merge back 0.14.5 release [#1686](https://github.com/sourcegraph/cody/pull/1686)
- Autocomplete: Migrate retrieval strategies to new API [#1682](https://github.com/sourcegraph/cody/pull/1682)
- fix symf download URL for linux and windows [#1680](https://github.com/sourcegraph/cody/pull/1680)
- Autocomplete: support python completion intents [#1679](https://github.com/sourcegraph/cody/pull/1679)
- Add a feature toggle for the new search panel [#1674](https://github.com/sourcegraph/cody/pull/1674)
- Autocomplete: Add initial prompting for Mistral 7b [#1671](https://github.com/sourcegraph/cody/pull/1671)
- Autocomplete: Add feature flag for Sourcegraph specific Fireworks setup [#1670](https://github.com/sourcegraph/cody/pull/1670)
- Cody: Fix stop generating error [#1668](https://github.com/sourcegraph/cody/pull/1668)
- Add RateLimitError to jsonrpc [#1662](https://github.com/sourcegraph/cody/pull/1662)
- Autocomplete: Remove enableExtendedTriggers flag [#1647](https://github.com/sourcegraph/cody/pull/1647)
- Edit: Faster code action fixes [#1639](https://github.com/sourcegraph/cody/pull/1639)
- Agent: Fix autocomplete (FixupController) [#1637](https://github.com/sourcegraph/cody/pull/1637)
- Autocomplete: support python multiline truncation [#1636](https://github.com/sourcegraph/cody/pull/1636)
- fix grammar in prd-issues.yml [#1629](https://github.com/sourcegraph/cody/pull/1629)
- convert issue markdown templates to issue forms [#1628](https://github.com/sourcegraph/cody/pull/1628)
- fix about value in template [#1626](https://github.com/sourcegraph/cody/pull/1626)
- Edit: Fix recursive diff expansion [#1621](https://github.com/sourcegraph/cody/pull/1621)
- Fixup: Use editor `tabSize` and `insertSpaces` when available [#1620](https://github.com/sourcegraph/cody/pull/1620)
- VS Code: Release 0.14.4 [#1618](https://github.com/sourcegraph/cody/pull/1618)
- Add PRD issue template [#1616](https://github.com/sourcegraph/cody/pull/1616)
- Update the FixUp retry instruction text [#1615](https://github.com/sourcegraph/cody/pull/1615)
- Cody Release v0.14.3 [#1614](https://github.com/sourcegraph/cody/pull/1614)
- Benchmark: Move to separate repository [#1612](https://github.com/sourcegraph/cody/pull/1612)
- Agent:  add support for providing `SelectedCompletionInfo` to autocomplete requests [#1611](https://github.com/sourcegraph/cody/pull/1611)
- Autocomplete: log partial acceptance events on every word instead of every char [#1608](https://github.com/sourcegraph/cody/pull/1608)
- Autocomplete: reuse the last candidate if the user types forward as suggested despite the updated completion info [#1607](https://github.com/sourcegraph/cody/pull/1607)
- Autocomplete: log partial acceptance events only if the length increases [#1606](https://github.com/sourcegraph/cody/pull/1606)
- Update react monorepo [#1593](https://github.com/sourcegraph/cody/pull/1593)
- telemetry: add request_id field for code block actions [#1586](https://github.com/sourcegraph/cody/pull/1586)
- Update dependency @ianvs/prettier-plugin-sort-imports to ^4.1.1 [#1585](https://github.com/sourcegraph/cody/pull/1585)
- Fixup: Add formatting codelens and the option to skip [#1582](https://github.com/sourcegraph/cody/pull/1582)
- add back `transcript` to cody feedback event data for dotcom users [#1581](https://github.com/sourcegraph/cody/pull/1581)
- Make manual context option take priority over flags [#1580](https://github.com/sourcegraph/cody/pull/1580)
- Completions: Fix duplicate InlineCompletionItemProvider bug [#1579](https://github.com/sourcegraph/cody/pull/1579)
- E2E: Skip flaky decoration test [#1578](https://github.com/sourcegraph/cody/pull/1578)
- Fixup: Avoid recreating diff on acceptance [#1575](https://github.com/sourcegraph/cody/pull/1575)
- Fix Github SSH URL parsing [#1574](https://github.com/sourcegraph/cody/pull/1574)
- Return null from getRepoId in the case of private repos [#1567](https://github.com/sourcegraph/cody/pull/1567)
- Autocomplete: Remove recursion from lsp light [#1563](https://github.com/sourcegraph/cody/pull/1563)
- Fixup: Fix error codelens being hidden [#1562](https://github.com/sourcegraph/cody/pull/1562)
- MessageProvider: Show errors when Cody does not provide any response [#1561](https://github.com/sourcegraph/cody/pull/1561)
- update chat panel icon and view type [#1560](https://github.com/sourcegraph/cody/pull/1560)
- Autocomplete: Add feature flag to test Claude Cyan [#1554](https://github.com/sourcegraph/cody/pull/1554)
- Changelog for fix heading styles and inline code colors (#1528) [#1553](https://github.com/sourcegraph/cody/pull/1553)
- VS Code: changelog updates [#1551](https://github.com/sourcegraph/cody/pull/1551)
- Removing classifyIntent call to LLM to optimize Fixup recipes [#1548](https://github.com/sourcegraph/cody/pull/1548)
- Cody search panel [#1546](https://github.com/sourcegraph/cody/pull/1546)
- Fix task-controller e2e test flakes on Windows [#1541](https://github.com/sourcegraph/cody/pull/1541)
- telemetry-v2: remove need to manually enumerate feature/action/metadata keys [#1537](https://github.com/sourcegraph/cody/pull/1537)
- Improve e2e completion tests to have better mock responses [#1535](https://github.com/sourcegraph/cody/pull/1535)
- BFG: bump to 5.2.4257 [#1533](https://github.com/sourcegraph/cody/pull/1533)
- Custom Commands: Fix custom command menu not showing for a single custom command [#1532](https://github.com/sourcegraph/cody/pull/1532)
- Chat: Fix heading styles and inline code colors [#1528](https://github.com/sourcegraph/cody/pull/1528)
- Add secondary telemetry to ContextProvider [#1516](https://github.com/sourcegraph/cody/pull/1516)
- BFG: fix git URI inference on Windows [#1514](https://github.com/sourcegraph/cody/pull/1514)
- BFG: fix download URL for x64 CPU architecture [#1513](https://github.com/sourcegraph/cody/pull/1513)
- add new aliases for x86_64 architecture [#1511](https://github.com/sourcegraph/cody/pull/1511)
- Autocomplete: do adjust a completion range if it does not match the current line suffix [#1507](https://github.com/sourcegraph/cody/pull/1507)
- Benchmarks: update benchmark config to match folder name [#1491](https://github.com/sourcegraph/cody/pull/1491)
- Autocomplete: add `jsx_attribute` completion intent [#1490](https://github.com/sourcegraph/cody/pull/1490)
- Add secondary telemetry to MessageProvider [#1488](https://github.com/sourcegraph/cody/pull/1488)
- eventlogger: accept hasV2Event in properties, add to properties [#1484](https://github.com/sourcegraph/cody/pull/1484)
- Add secondary telemetry to ChatViewProvider and main [#1483](https://github.com/sourcegraph/cody/pull/1483)
- Update openai autocomplete provider to use prompt similar to anthropic infill mode [#1480](https://github.com/sourcegraph/cody/pull/1480)
- Cody Patch Release v0.14.2 [#1478](https://github.com/sourcegraph/cody/pull/1478)
- Autocomplete: Fix suggest item race condition [#1477](https://github.com/sourcegraph/cody/pull/1477)
- Add missing changelog entries [#1476](https://github.com/sourcegraph/cody/pull/1476)
- Agent: fix `git/codebaseName` request [#1473](https://github.com/sourcegraph/cody/pull/1473)
- DX: fix eslint errors caused by the config upgrade [#1471](https://github.com/sourcegraph/cody/pull/1471)
- Update dependency @sourcegraph/eslint-config to v0.37.1 [#1468](https://github.com/sourcegraph/cody/pull/1468)
- Expose a unstable_handleDidShowCompletionItem for agent [#1463](https://github.com/sourcegraph/cody/pull/1463)
- Autocomplete: add completion intent to completion events [#1457](https://github.com/sourcegraph/cody/pull/1457)
- Autocomplete: add `// only` support to `tree-sitter` snapshot tests [#1450](https://github.com/sourcegraph/cody/pull/1450)
- Enable e2e tests for Windows on bots [#1447](https://github.com/sourcegraph/cody/pull/1447)
- Fixup: Only apply formatting changes to a range, and clean the undo stack [#1445](https://github.com/sourcegraph/cody/pull/1445)
- Agent: exist process when stdout/stdin close [#1439](https://github.com/sourcegraph/cody/pull/1439)
- BFG: use RFC 795 naming conventions [#1437](https://github.com/sourcegraph/cody/pull/1437)
- Autocomplete: Log which retrieval strategy is used [#1436](https://github.com/sourcegraph/cody/pull/1436)
- Enable feature flag checking for non dotcom instances [#1435](https://github.com/sourcegraph/cody/pull/1435)
- BFG: clean up logging [#1433](https://github.com/sourcegraph/cody/pull/1433)
- Remove empty file that's failing ESLint checks [#1432](https://github.com/sourcegraph/cody/pull/1432)
- Autocomplete: update the outdated setting description [#1430](https://github.com/sourcegraph/cody/pull/1430)
- Autocomplete: Remove test file [#1428](https://github.com/sourcegraph/cody/pull/1428)
- Explain code action: Always send to sidebar [#1427](https://github.com/sourcegraph/cody/pull/1427)
- add changelog entry for pull/1383 [#1426](https://github.com/sourcegraph/cody/pull/1426)
- Agent: add new `git/codebaseName` request [#1425](https://github.com/sourcegraph/cody/pull/1425)
- VS Code: Release 0.14.1 [#1424](https://github.com/sourcegraph/cody/pull/1424)
- Update dependency @sourcegraph/eslint-config to v0.35.0 [#1421](https://github.com/sourcegraph/cody/pull/1421)
- Remove Secret Scan Github Action in favour of Background Secret Scan [#1420](https://github.com/sourcegraph/cody/pull/1420)
- Cody: Apply fixups by default [#1411](https://github.com/sourcegraph/cody/pull/1411)
- Autocomplete: Add feature flags to disable network cache and request recycling [#1409](https://github.com/sourcegraph/cody/pull/1409)
- Autocomplete: Fix forwarding of completeSuggestWidgetSelection [#1408](https://github.com/sourcegraph/cody/pull/1408)
- Autocomplete: add a feature flag for streaming truncation [#1404](https://github.com/sourcegraph/cody/pull/1404)
- Autocomplete: use cursor position for the `blocks` query [#1403](https://github.com/sourcegraph/cody/pull/1403)
- VScode: Clean up login and chat status widgets, tests [#1399](https://github.com/sourcegraph/cody/pull/1399)
- Show an inline notification on accepting first completion [#1397](https://github.com/sourcegraph/cody/pull/1397)
- Move Chromium installation into install-deps so "pnpm test:e2e" works on Windows [#1395](https://github.com/sourcegraph/cody/pull/1395)
- Autocomplete: Update other providers list [#1390](https://github.com/sourcegraph/cody/pull/1390)
- Benchmark: Add error messages for env [#1389](https://github.com/sourcegraph/cody/pull/1389)
- Autocomplete: fix `canUsePartialCompletion` for completions with leading new lines [#1386](https://github.com/sourcegraph/cody/pull/1386)
- Autocomplete: Fix Fireworks multi-line completion timeouts [#1381](https://github.com/sourcegraph/cody/pull/1381)
- Autocomplete: Track inserted completions [#1380](https://github.com/sourcegraph/cody/pull/1380)
- Fixup: Improve error handling [#1376](https://github.com/sourcegraph/cody/pull/1376)
- VScode: Add popups for all embeddings conditions [#1374](https://github.com/sourcegraph/cody/pull/1374)
- pass the sourcegraph url to symf [#1373](https://github.com/sourcegraph/cody/pull/1373)
- Autocomplete: prevent negative `position.character` value [#1368](https://github.com/sourcegraph/cody/pull/1368)
- Autocomplete: Add logging for partial acceptence delta [#1367](https://github.com/sourcegraph/cody/pull/1367)
- Autocomplete: Add StarCoder context window experiment [#1365](https://github.com/sourcegraph/cody/pull/1365)
- Autocomplete: Remove codegen provider [#1364](https://github.com/sourcegraph/cody/pull/1364)
- Autocomplete: Mark Fireworks provider as stable [#1363](https://github.com/sourcegraph/cody/pull/1363)
- Autocomplete: collect node types without pasted completion [#1361](https://github.com/sourcegraph/cody/pull/1361)
- Autocomplete: Implement client-side timeouts [#1355](https://github.com/sourcegraph/cody/pull/1355)
- Autocomplete: keep completion metadata on cache hit [#1353](https://github.com/sourcegraph/cody/pull/1353)
- Agent: mirror runtime behavior for `instanceof URI` [#1346](https://github.com/sourcegraph/cody/pull/1346)
- Fixing the cody chat jump to the top on initiating a new chat [#1343](https://github.com/sourcegraph/cody/pull/1343)
- Use vscode-uri for the mock/shim Uri [#1335](https://github.com/sourcegraph/cody/pull/1335)
- Cody eval TypeScript dataset [#1334](https://github.com/sourcegraph/cody/pull/1334)
- benchmark suite: first pass at adding a golang dataset [#1332](https://github.com/sourcegraph/cody/pull/1332)
- add: context summary logging to recipe execution [#1331](https://github.com/sourcegraph/cody/pull/1331)
- Autocomplete: LSP light graph context [#1326](https://github.com/sourcegraph/cody/pull/1326)
- Agent: reject promise on completions exception [#1324](https://github.com/sourcegraph/cody/pull/1324)
- Autocomplete: Make string distance filters more lenient [#1320](https://github.com/sourcegraph/cody/pull/1320)
- Autocomplete: add a feature flag for syntactic triggers [#1318](https://github.com/sourcegraph/cody/pull/1318)
- Adding Smart Selection to FixupRecipe [#1317](https://github.com/sourcegraph/cody/pull/1317)
- add: line comment detection to completion latency [#1316](https://github.com/sourcegraph/cody/pull/1316)
- Unit test matrix [#1315](https://github.com/sourcegraph/cody/pull/1315)
- Refactor smart document section and account for more edge cases [#1314](https://github.com/sourcegraph/cody/pull/1314)
- remove accidental console log in e2e test [#1312](https://github.com/sourcegraph/cody/pull/1312)
- Autocomplete: add go tree-sitter query for multiline truncation [#1311](https://github.com/sourcegraph/cody/pull/1311)
- VS Code: Release 0.14.0 [#1310](https://github.com/sourcegraph/cody/pull/1310)
- Autocomplete: Remove outdated embeddings config [#1308](https://github.com/sourcegraph/cody/pull/1308)
- Autocomplete: restructure tree-sitter related modules [#1307](https://github.com/sourcegraph/cody/pull/1307)
- VS Code: singleton graphql client and feature flag provider [#1306](https://github.com/sourcegraph/cody/pull/1306)
- Autocomplete: remove `console.log`s [#1304](https://github.com/sourcegraph/cody/pull/1304)
- Autocomplete: add multiline truncation unit test [#1303](https://github.com/sourcegraph/cody/pull/1303)
- VScode: Move onboarding control group onto simplified onboarding [#1301](https://github.com/sourcegraph/cody/pull/1301)
- VScode: Show Cody on first install [#1299](https://github.com/sourcegraph/cody/pull/1299)
- Detect more test files [#1297](https://github.com/sourcegraph/cody/pull/1297)
- Agent: disable tree-sitter setting [#1296](https://github.com/sourcegraph/cody/pull/1296)
- add event logging validation to inline test [#1295](https://github.com/sourcegraph/cody/pull/1295)
- Don't show completion notice for existing installs [#1293](https://github.com/sourcegraph/cody/pull/1293)
- Autocomplete: add `autocomplete.languages` user setting [#1290](https://github.com/sourcegraph/cody/pull/1290)
- Remove .com from enterprise login options [#1286](https://github.com/sourcegraph/cody/pull/1286)
- Only show "Ask Cody Inline" context menu item when signed in [#1281](https://github.com/sourcegraph/cody/pull/1281)
- agent: start unifying event logging between clients [#1272](https://github.com/sourcegraph/cody/pull/1272)
- change: add latency gradually [#1269](https://github.com/sourcegraph/cody/pull/1269)
- Cody: Add benchmark suite [#1265](https://github.com/sourcegraph/cody/pull/1265)
- Agent: fix Windows issues [#1264](https://github.com/sourcegraph/cody/pull/1264)
- Autocomplete: Throttle lang server requests for LSP graph context [#1263](https://github.com/sourcegraph/cody/pull/1263)
- Autocomplete: Enable completeSuggestWidgetSelection by default [#1262](https://github.com/sourcegraph/cody/pull/1262)
- Autocomplete: add `stopReason` to completion events [#1261](https://github.com/sourcegraph/cody/pull/1261)
- Update changelog with 0.12.x onboarding changes. [#1260](https://github.com/sourcegraph/cody/pull/1260)
- Autocomplete: add single completion trigger queries [#1259](https://github.com/sourcegraph/cody/pull/1259)
- Fix unit tests on Windows + enable on bots [#1256](https://github.com/sourcegraph/cody/pull/1256)
- Autocomplete: Simplify injected prefix handling and fix logging issue [#1255](https://github.com/sourcegraph/cody/pull/1255)
- Log platform version [#1254](https://github.com/sourcegraph/cody/pull/1254)
- Whoops [#1250](https://github.com/sourcegraph/cody/pull/1250)
- VS Code: Release 0.12.4 [#1249](https://github.com/sourcegraph/cody/pull/1249)
- add doc behind feature flag [#1248](https://github.com/sourcegraph/cody/pull/1248)
- Fix Transcript order [#1247](https://github.com/sourcegraph/cody/pull/1247)
- update expectedEvents in E2E tests [#1246](https://github.com/sourcegraph/cody/pull/1246)
- Autocomplete: Very rudimentary Python support for LSP graph context [#1245](https://github.com/sourcegraph/cody/pull/1245)
- Cody: Fix first command not executing in the sidebar [#1243](https://github.com/sourcegraph/cody/pull/1243)
- VS Code: Release 0.12.3 [#1242](https://github.com/sourcegraph/cody/pull/1242)
- Agent: make chat client respect NODE_TLS_REJECT_UNAUTHORIZED [#1236](https://github.com/sourcegraph/cody/pull/1236)
- Increase simplified onboarding experiment rollout to 100% [#1235](https://github.com/sourcegraph/cody/pull/1235)
- Agent: replace console.info with debug logs [#1234](https://github.com/sourcegraph/cody/pull/1234)
- BFG: add new graph context engine [#1232](https://github.com/sourcegraph/cody/pull/1232)
- Agent: don't default provider to anthropic so detection logic can run [#1231](https://github.com/sourcegraph/cody/pull/1231)
- Autocomplete: Add bookkeeping to reuse completion IDs over multiple suggestions [#1230](https://github.com/sourcegraph/cody/pull/1230)
- Add custom abort controller to circumvent max event listeners limit [#1227](https://github.com/sourcegraph/cody/pull/1227)
- change: /doc scroll on invisible range only [#1226](https://github.com/sourcegraph/cody/pull/1226)
- Auth symf after login [#1225](https://github.com/sourcegraph/cody/pull/1225)
- Add back support and CI tests for Node 16 [#1224](https://github.com/sourcegraph/cody/pull/1224)
- JetBrains: expose graphql query getRepoId in protocol [#1222](https://github.com/sourcegraph/cody/pull/1222)
- change: remove fixup display in chat and history [#1220](https://github.com/sourcegraph/cody/pull/1220)
- update: /doc use current line when no folding range detected [#1219](https://github.com/sourcegraph/cody/pull/1219)
- Autocomplete: Don't trigger on closing characters [#1218](https://github.com/sourcegraph/cody/pull/1218)
- refactor options and hints for context size [#1217](https://github.com/sourcegraph/cody/pull/1217)
- Agent: Add a way to trigger "manual" autocompletions [#1215](https://github.com/sourcegraph/cody/pull/1215)
- Autocomplete: Add logging for partial acceptances [#1214](https://github.com/sourcegraph/cody/pull/1214)
- Code Action: Allow enabling/disabling and improve ranking of explain [#1211](https://github.com/sourcegraph/cody/pull/1211)
- Simplified Onboarding: Pick up the app token if available after sign-in [#1210](https://github.com/sourcegraph/cody/pull/1210)
- Autocomplete: Accept completions that are forward typed to the end [#1208](https://github.com/sourcegraph/cody/pull/1208)
- /symf: remove direct anthropic dependency, pass sourcegraph token [#1207](https://github.com/sourcegraph/cody/pull/1207)
- VS Code: Release 0.12.2 [#1203](https://github.com/sourcegraph/cody/pull/1203)
- new feature flag for situation based latency [#1202](https://github.com/sourcegraph/cody/pull/1202)
- change: replace "Fixup ready" with "Apply Edits" button [#1201](https://github.com/sourcegraph/cody/pull/1201)
- change: rename "Refactor Code" to "Edit Code" in right click context menu [#1200](https://github.com/sourcegraph/cody/pull/1200)
- Autocomplete: remove cursor line from code samples before running snapshot tests [#1199](https://github.com/sourcegraph/cody/pull/1199)
- vscode: add telemetry v2 SDK [#1192](https://github.com/sourcegraph/cody/pull/1192)
- Autocomplete: Remove embeddings context [#1188](https://github.com/sourcegraph/cody/pull/1188)
- Autocomplete: Set default for tree sitter [#1181](https://github.com/sourcegraph/cody/pull/1181)
- Silence logspam from expected app connection failures [#1180](https://github.com/sourcegraph/cody/pull/1180)
- add: visual feedback on codeblock action clicks [#1173](https://github.com/sourcegraph/cody/pull/1173)
- Autocomplete: enable tree-sitter by default [#1172](https://github.com/sourcegraph/cody/pull/1172)
- Autocomplete: Improved manual completion trigger [#1170](https://github.com/sourcegraph/cody/pull/1170)
- Autocomplete: Use UUID for compltion ids [#1167](https://github.com/sourcegraph/cody/pull/1167)
- Autocomplete: Use location key rather then location object for uniqueness test [#1166](https://github.com/sourcegraph/cody/pull/1166)
- change: use infill prompt by default for anthropic [#1164](https://github.com/sourcegraph/cody/pull/1164)
- Agent: add support to cancel chat [#1162](https://github.com/sourcegraph/cody/pull/1162)
- Autocomplete: Improve suggest widget interop and add feature flag [#1158](https://github.com/sourcegraph/cody/pull/1158)
- Autocomplete: add changelog item [#1155](https://github.com/sourcegraph/cody/pull/1155)
- Autocomplete: add `nodeTypes` to `CompletionEvent` for analytics [#1154](https://github.com/sourcegraph/cody/pull/1154)
- add missing changelog for pull/1116 1139 [#1147](https://github.com/sourcegraph/cody/pull/1147)
- Agent: add better lang detection support for files without extensions [#1146](https://github.com/sourcegraph/cody/pull/1146)
- Merge back 0.12.1 change into main [#1145](https://github.com/sourcegraph/cody/pull/1145)
- Autocomplete: add `items` to `CompletionEvent` with tree-sitter fields for analytics [#1144](https://github.com/sourcegraph/cody/pull/1144)
- Autocomplete: refactor prep for adding analytics tree-sitter events [#1142](https://github.com/sourcegraph/cody/pull/1142)
- VS Code: module scope telemetry service [#1141](https://github.com/sourcegraph/cody/pull/1141)
- Agent: re-authenticate during configuration changes [#1140](https://github.com/sourcegraph/cody/pull/1140)
- Autocomplete: Fix cody-autocomplete-claude-instant-infill experiment [#1132](https://github.com/sourcegraph/cody/pull/1132)
- VS Code: implement partial `vscode.workspace.fs` mock [#1131](https://github.com/sourcegraph/cody/pull/1131)
- Automaticaly download symf [#1130](https://github.com/sourcegraph/cody/pull/1130)
- Autocomplete: Do not reset lastCandidate with invalidated requests [#1127](https://github.com/sourcegraph/cody/pull/1127)
- Cody release v0.12.0 [#1126](https://github.com/sourcegraph/cody/pull/1126)
- Autocomplete: Fix support for documents with \r\n line endings [#1124](https://github.com/sourcegraph/cody/pull/1124)
- Autocomplete: add basic multi-lang infra for tree-sitter queries [#1122](https://github.com/sourcegraph/cody/pull/1122)
- Fix completion trigger enablement [#1121](https://github.com/sourcegraph/cody/pull/1121)
- change: register inline completion provider for files and notebooks only [#1114](https://github.com/sourcegraph/cody/pull/1114)
- Autocomplete: Remove common TS hover text for graph context [#1113](https://github.com/sourcegraph/cody/pull/1113)
- Autocomplete: Split minimum latency tests into two thresholds [#1111](https://github.com/sourcegraph/cody/pull/1111)
- Autocomplete: Add StarCoder hybrid feature flag and Llama Code flags [#1110](https://github.com/sourcegraph/cody/pull/1110)
- Autocomplete: Filter out single character completions [#1109](https://github.com/sourcegraph/cody/pull/1109)
- Fix: replaceAll() should not be called with a non-global regular expression. [#1108](https://github.com/sourcegraph/cody/pull/1108)
- typewriter: do not throw on the same message [#1107](https://github.com/sourcegraph/cody/pull/1107)
- Agent: update contributing docs [#1106](https://github.com/sourcegraph/cody/pull/1106)
- Adding logged events validation within e2e test [#1104](https://github.com/sourcegraph/cody/pull/1104)
- Autocomplete: Limit parallel lang server hits and abort requests when rapidly changing sections [#1101](https://github.com/sourcegraph/cody/pull/1101)
- Merge back 0.10.2 change log changes into `main` [#1095](https://github.com/sourcegraph/cody/pull/1095)
- LLM judge: run tests in parallel [#1093](https://github.com/sourcegraph/cody/pull/1093)
- Share a dotcom access token with app, when available [#1090](https://github.com/sourcegraph/cody/pull/1090)
- Add install, embeddings enabled notices for post-hoc app setup [#1089](https://github.com/sourcegraph/cody/pull/1089)
- Agent: add `pnpm agent:debug` command [#1087](https://github.com/sourcegraph/cody/pull/1087)
- Autocomplete: add snapshot tests for tree-sitter queries [#1086](https://github.com/sourcegraph/cody/pull/1086)
- Fix broken Cody Agent [#1081](https://github.com/sourcegraph/cody/pull/1081)
- update changelog [#1080](https://github.com/sourcegraph/cody/pull/1080)
- Fix VScode storybook CSS class name mangling [#1078](https://github.com/sourcegraph/cody/pull/1078)
- Clean up: Remove lint suppressions from OnboardingExperiment. [#1077](https://github.com/sourcegraph/cody/pull/1077)
- dx: upgrade @sourcegraph/eslint-config [#1075](https://github.com/sourcegraph/cody/pull/1075)
- Update dependency @sourcegraph/eslint-config to v0.34.0 [#1074](https://github.com/sourcegraph/cody/pull/1074)
- Worker: support correct transcript management [#1073](https://github.com/sourcegraph/cody/pull/1073)
- Show notice on first autocomplete [#1071](https://github.com/sourcegraph/cody/pull/1071)
- Consistent event names for commands [#1068](https://github.com/sourcegraph/cody/pull/1068)
- fix replace prefix logic for infill prompt [#1063](https://github.com/sourcegraph/cody/pull/1063)
- Autocomplete: Add alt+\ shortcut to trigger autocomplete and bypass debouncing times [#1060](https://github.com/sourcegraph/cody/pull/1060)
- Autocomplete: Only persist last candidate if it would be shown in the UI [#1059](https://github.com/sourcegraph/cody/pull/1059)
- Autocomplete: Use the same context window size for StarCoder [#1058](https://github.com/sourcegraph/cody/pull/1058)
- Autocomplete: Include \n\r\n as stop sequence for multi-line requests [#1057](https://github.com/sourcegraph/cody/pull/1057)
- dx: extract linting into a separate CI job [#1055](https://github.com/sourcegraph/cody/pull/1055)
- VS Code: sign out cleanup [#1053](https://github.com/sourcegraph/cody/pull/1053)
- Autocomplete: trigger multiline completions on empty block only [#1052](https://github.com/sourcegraph/cody/pull/1052)
- Intelligent Cody: Add additional Go heuristics [#1047](https://github.com/sourcegraph/cody/pull/1047)
- Autocomplete: Don't cull symbols that are defined in common import paths [#1046](https://github.com/sourcegraph/cody/pull/1046)
- Agent: add `graphql/getRepoIdIfEmbeddingExists` [#1045](https://github.com/sourcegraph/cody/pull/1045)
- Autocomplete: Use <filename> token in StarCoder prompt [#1044](https://github.com/sourcegraph/cody/pull/1044)
- Remove fs dependency from common [#1043](https://github.com/sourcegraph/cody/pull/1043)
- Simplified onboarding experiment assignment and logging [#1036](https://github.com/sourcegraph/cody/pull/1036)
- configure autocomplete provider based on cody LLM settings in site config [#1035](https://github.com/sourcegraph/cody/pull/1035)
- [Cody Web] fix typewriter err handling and closing [#1034](https://github.com/sourcegraph/cody/pull/1034)
- Autocomplete: truncate multiline completions based on parse-trees [#1033](https://github.com/sourcegraph/cody/pull/1033)
- VS Code: remove sign-out menu [#1032](https://github.com/sourcegraph/cody/pull/1032)
- doc: add cody quality tools + autocomplete review tool docs [#1031](https://github.com/sourcegraph/cody/pull/1031)
- Autocomplete: do not report some network errors to Sentry [#1029](https://github.com/sourcegraph/cody/pull/1029)
- Autocomplete: do not report auth errors to Sentry [#1028](https://github.com/sourcegraph/cody/pull/1028)
- Intelligent Cody: Track which local variable types/implementations alter [#1022](https://github.com/sourcegraph/cody/pull/1022)
- Autocomplete: Add stop sequence to Fireworks [#1018](https://github.com/sourcegraph/cody/pull/1018)
- Autocomplete: Add minimum latency [#1017](https://github.com/sourcegraph/cody/pull/1017)
- Autocomplete: Add a feature flag for graph context and only enable it for supported languages [#1016](https://github.com/sourcegraph/cody/pull/1016)
- Agent: specify User-Agent in more requests [#1015](https://github.com/sourcegraph/cody/pull/1015)
- transcript: ensure react key uniqueness [#1012](https://github.com/sourcegraph/cody/pull/1012)
- Autocomplete: remove duplicated tests [#1009](https://github.com/sourcegraph/cody/pull/1009)
- Introduce testRunID when logging events from e2e tests [#1007](https://github.com/sourcegraph/cody/pull/1007)
- update scrolling behavior [#1005](https://github.com/sourcegraph/cody/pull/1005)
- Remove remove unstable-azure provider [#1003](https://github.com/sourcegraph/cody/pull/1003)
- Autocomplete: Add section history to graph context [#999](https://github.com/sourcegraph/cody/pull/999)
- Agent: add notification that clears the last autocomplete candidate [#998](https://github.com/sourcegraph/cody/pull/998)
- Agent: add support for custom User-Agent [#997](https://github.com/sourcegraph/cody/pull/997)
- Onboarding: New login experience behind QA flag [#996](https://github.com/sourcegraph/cody/pull/996)
- Autocomplete: Remove cody-autocomplete-streaming-response flag [#995](https://github.com/sourcegraph/cody/pull/995)
- UX improvements to the custom command workflow [#992](https://github.com/sourcegraph/cody/pull/992)
- update claude infill prompt to fix indent issue [#990](https://github.com/sourcegraph/cody/pull/990)
- Autocomplete: Various section observer tweaks [#986](https://github.com/sourcegraph/cody/pull/986)
- Intelligent Cody: Supercharge hover text [#983](https://github.com/sourcegraph/cody/pull/983)
- Update VS Code README.md [#982](https://github.com/sourcegraph/cody/pull/982)
- changelog update for pull/974 [#977](https://github.com/sourcegraph/cody/pull/977)
- Autocomplete: Document test suite setup [#976](https://github.com/sourcegraph/cody/pull/976)
- Autocomplete: Add document section logging to trace view [#975](https://github.com/sourcegraph/cody/pull/975)
- Autocomplete: Add bare bones statistics logging and UI [#973](https://github.com/sourcegraph/cody/pull/973)
- Merge back 0.10.1 change log changes into `main` [#972](https://github.com/sourcegraph/cody/pull/972)
- Autocomplete: Don't init when not logged in and add UI to show that to users [#970](https://github.com/sourcegraph/cody/pull/970)
- Autocomplete: Tweak StarCoder temperature [#966](https://github.com/sourcegraph/cody/pull/966)
- Autocomplete: Fix feature flag init [#965](https://github.com/sourcegraph/cody/pull/965)
- Show commands format changed notification [#964](https://github.com/sourcegraph/cody/pull/964)
- Update ci.yml [#962](https://github.com/sourcegraph/cody/pull/962)
- dx: bump memory and disable warnings for the vscode `lint:js` script [#961](https://github.com/sourcegraph/cody/pull/961)
- E2e test logging patch1 [#948](https://github.com/sourcegraph/cody/pull/948)
- Autocomplete: group `getInlineCompletions` unit tests [#947](https://github.com/sourcegraph/cody/pull/947)
- add twoNums.ts to completions test [#945](https://github.com/sourcegraph/cody/pull/945)
- Autocomplete: Tweaks to the graph context to make it actually slightly usable already [#943](https://github.com/sourcegraph/cody/pull/943)
- Add dev flag to open output console on startup [#941](https://github.com/sourcegraph/cody/pull/941)
- Autocomplete: add multi-line trigger info to `docContext` [#938](https://github.com/sourcegraph/cody/pull/938)
- Fix streaming logs [#937](https://github.com/sourcegraph/cody/pull/937)
- Fix dev build by not overwriting CODY_TESTING env [#935](https://github.com/sourcegraph/cody/pull/935)
- Add trufflehog secret scanning [#932](https://github.com/sourcegraph/cody/pull/932)
- VS Code: Release 0.10.0 [#930](https://github.com/sourcegraph/cody/pull/930)
- Autocomplete: Modernize codegen provider [#927](https://github.com/sourcegraph/cody/pull/927)
- Autocomplete: Add model specific feature flags [#926](https://github.com/sourcegraph/cody/pull/926)
- Autocomplete: improve `detectMultiline` unit tests [#920](https://github.com/sourcegraph/cody/pull/920)
- E2E tests: Upload recording artifacts and fix flaky test [#919](https://github.com/sourcegraph/cody/pull/919)
- Sentry: Don't crash the extension when we can't init [#916](https://github.com/sourcegraph/cody/pull/916)
- show /ask command in sidebat chat [#915](https://github.com/sourcegraph/cody/pull/915)
- Autocomplete: trigger multiline completions on empty block only [#913](https://github.com/sourcegraph/cody/pull/913)
- VS Code: use singleton storage providers in rest consumers [#912](https://github.com/sourcegraph/cody/pull/912)
- Autocomplete: restructure text processing utils [#911](https://github.com/sourcegraph/cody/pull/911)
- improve generate unit tests command output quality [#907](https://github.com/sourcegraph/cody/pull/907)
- Update Cody VS Code README gifs [#906](https://github.com/sourcegraph/cody/pull/906)
- remove experimental plugins feature [#904](https://github.com/sourcegraph/cody/pull/904)
- make sidebar chat commands match main quick pick [#902](https://github.com/sourcegraph/cody/pull/902)
- Update dependency stylelint to ^15.10.3 [#895](https://github.com/sourcegraph/cody/pull/895)
- Update dependency prettier to v3.0.3 [#894](https://github.com/sourcegraph/cody/pull/894)
- Update dependency @vscode/test-web to ^0.0.48 [#890](https://github.com/sourcegraph/cody/pull/890)
- Update dependency @types/react to v18.2.21 [#889](https://github.com/sourcegraph/cody/pull/889)
- VSCode: Add Sentry to extension host process [#882](https://github.com/sourcegraph/cody/pull/882)
- Autocomplete: Add tracing for network requests [#881](https://github.com/sourcegraph/cody/pull/881)
- Autocomplete: Remove unused HuggingFace provider [#880](https://github.com/sourcegraph/cody/pull/880)
- Autocomplete: Tweak Llama code params and add 7b model support [#878](https://github.com/sourcegraph/cody/pull/878)
- VS Code: use singleton storage providers [#876](https://github.com/sourcegraph/cody/pull/876)
- OpenAI  provider that sends requests though sourcegraph server [#875](https://github.com/sourcegraph/cody/pull/875)
- Azure / e2e Cody suite [#873](https://github.com/sourcegraph/cody/pull/873)
- Agent: add an in-process client [#871](https://github.com/sourcegraph/cody/pull/871)
- Agent: use esbuild CLI invocation instead of ESM script [#870](https://github.com/sourcegraph/cody/pull/870)
- experimental `cody complete` subcommand [#869](https://github.com/sourcegraph/cody/pull/869)
- Autocomplete: Enable keepalive agent for Node [#868](https://github.com/sourcegraph/cody/pull/868)
- Fix main: Don't use shared import [#866](https://github.com/sourcegraph/cody/pull/866)
- Add section observer to track code navigation section changes [#865](https://github.com/sourcegraph/cody/pull/865)
- Autocomplete: Add llama-v2-13b-code support [#862](https://github.com/sourcegraph/cody/pull/862)
- Autocomplete: use tree-sitter incremental parsing [#861](https://github.com/sourcegraph/cody/pull/861)
- dx: ignore ESLint and Stylelint warnings on CI [#858](https://github.com/sourcegraph/cody/pull/858)
- Intelligent Cody: Heuristically reduce get definition calls [#854](https://github.com/sourcegraph/cody/pull/854)
- enhance main quick pick items filtering logic [#852](https://github.com/sourcegraph/cody/pull/852)
- Autocomplete: Surface rate limit and other errors [#851](https://github.com/sourcegraph/cody/pull/851)
- rename /fix command to /edit [#847](https://github.com/sourcegraph/cody/pull/847)
- dx: show `dist` in the VS Code explorer [#846](https://github.com/sourcegraph/cody/pull/846)
- dx: document how to debug locally with dedicated node dev tools [#845](https://github.com/sourcegraph/cody/pull/845)
- Agent: improve langage detection  [#844](https://github.com/sourcegraph/cody/pull/844)
- make slash command required in command configs [#841](https://github.com/sourcegraph/cody/pull/841)
- Autocomplete: Include model identifier with autocomplete logs [#840](https://github.com/sourcegraph/cody/pull/840)
- Autocomplete: Add feature flag to enable Fireworks as the default provider [#839](https://github.com/sourcegraph/cody/pull/839)
- dx: show `node_modules` in the VS Code explorer [#838](https://github.com/sourcegraph/cody/pull/838)
- Autocomplete: add naive suggestions ranking based on syntactic validity [#837](https://github.com/sourcegraph/cody/pull/837)
- Agent: support unstable-codegen access via SOCKS proxy [#836](https://github.com/sourcegraph/cody/pull/836)
- add "the" [#834](https://github.com/sourcegraph/cody/pull/834)
- Fix autocomplete embeddings refresh condition [#831](https://github.com/sourcegraph/cody/pull/831)
- export all chat history [#830](https://github.com/sourcegraph/cody/pull/830)
- add null check before accessing editor in inline controller [#828](https://github.com/sourcegraph/cody/pull/828)
- Autocomplete: Connect to Fireworks via Sourcegraph Server [#826](https://github.com/sourcegraph/cody/pull/826)
- Agent: remove debugging log [#822](https://github.com/sourcegraph/cody/pull/822)
- Autocomplete: Add Llama Code support to Fireworks provider [#818](https://github.com/sourcegraph/cody/pull/818)
- Agent: Make recipes work through agent [#816](https://github.com/sourcegraph/cody/pull/816)
- Fix insders build and make CI notification pretty [#814](https://github.com/sourcegraph/cody/pull/814)
- Agent: return `CompletionEvent` telemetry data from `autocomplete/execute` [#807](https://github.com/sourcegraph/cody/pull/807)
- vscode: Add docs about the purpose of different kinds of tests [#806](https://github.com/sourcegraph/cody/pull/806)
- Agent: fix bug when reading `.id` from null [#799](https://github.com/sourcegraph/cody/pull/799)
- Update quick-pick labels [#798](https://github.com/sourcegraph/cody/pull/798)
- Reword catch-all refactor command [#797](https://github.com/sourcegraph/cody/pull/797)
- Remove CODY_FOCUS_SIDEBAR_ON_STARTUP [#796](https://github.com/sourcegraph/cody/pull/796)
- vscode e2e: Download less, faster, update VScode version [#794](https://github.com/sourcegraph/cody/pull/794)
- Agent: implement `vscode.env.language` [#793](https://github.com/sourcegraph/cody/pull/793)
- Agent: enable embeddings in chat [#788](https://github.com/sourcegraph/cody/pull/788)
- Agent: add cancelation support [#787](https://github.com/sourcegraph/cody/pull/787)
- Add notification when nightly build fails [#786](https://github.com/sourcegraph/cody/pull/786)
- Add tooltips to the chat input buttons [#784](https://github.com/sourcegraph/cody/pull/784)
- Add a 'v' to the start of the version number in the update notice [#782](https://github.com/sourcegraph/cody/pull/782)
- Intelligent Cody: Fetch locations multiple hops in the graph [#778](https://github.com/sourcegraph/cody/pull/778)
- lib/shared: bump package version [#777](https://github.com/sourcegraph/cody/pull/777)
- Re-enable the web build [#774](https://github.com/sourcegraph/cody/pull/774)
- Unblock the VS Code build #2 - Remove the web build from package.json [#773](https://github.com/sourcegraph/cody/pull/773)
- Unblock VS Code release by removing the web build [#770](https://github.com/sourcegraph/cody/pull/770)
- update: changelog for unit test [#768](https://github.com/sourcegraph/cody/pull/768)
- changelog: add experimental /symf [#767](https://github.com/sourcegraph/cody/pull/767)
- remove fixup command handling from refactor menu [#766](https://github.com/sourcegraph/cody/pull/766)
- Do not init inline controller on startup when disabled [#764](https://github.com/sourcegraph/cody/pull/764)
- remove compare open tabs from workspace command [#763](https://github.com/sourcegraph/cody/pull/763)
- Autocomplete: Abort network requests when a completion request is resolved with a previously started request's response [#762](https://github.com/sourcegraph/cody/pull/762)
- Autocomplete: Log errors [#761](https://github.com/sourcegraph/cody/pull/761)
- VS Code: Release 0.8.0 [#759](https://github.com/sourcegraph/cody/pull/759)
- lib/shared: add arg to optionally initialize chat with a specific scope [#753](https://github.com/sourcegraph/cody/pull/753)
- improve 2 Cody text labels [#752](https://github.com/sourcegraph/cody/pull/752)
- throttle updates of context to chat sidebar [#751](https://github.com/sourcegraph/cody/pull/751)
- New welcome chat words [#748](https://github.com/sourcegraph/cody/pull/748)
- Show a notice and link to release notes after extension updates [#746](https://github.com/sourcegraph/cody/pull/746)
- Agent: Log arguments need to be strings  [#743](https://github.com/sourcegraph/cody/pull/743)
- remove h tags from allowed list [#742](https://github.com/sourcegraph/cody/pull/742)
- cody: add exp label to custom command dropdown [#740](https://github.com/sourcegraph/cody/pull/740)
- log custom command only [#738](https://github.com/sourcegraph/cody/pull/738)
- Agent: disable telemetry only via the shim [#737](https://github.com/sourcegraph/cody/pull/737)
- Experimentation: Move FeatureFlagProvider to shared and add tests [#735](https://github.com/sourcegraph/cody/pull/735)
- Agent: add requests for logging events and to find user ID [#734](https://github.com/sourcegraph/cody/pull/734)
- Add increased autocomplete debounce time feature flag support [#733](https://github.com/sourcegraph/cody/pull/733)
- Agent: recipes/execute - handle empty selection [#732](https://github.com/sourcegraph/cody/pull/732)
- update dotcomUrl [#730](https://github.com/sourcegraph/cody/pull/730)
- added more e2e test cases [#729](https://github.com/sourcegraph/cody/pull/729)
- Adds an experimental command `/symf` that provides an indexed keyword search capability [#728](https://github.com/sourcegraph/cody/pull/728)
- Autocomplete: Include up to a single new line in the Anthropic prompt [#727](https://github.com/sourcegraph/cody/pull/727)
- Don't trigger multiline completion in case of function or method invocation [#726](https://github.com/sourcegraph/cody/pull/726)
- Agent: always build parent directory first [#724](https://github.com/sourcegraph/cody/pull/724)
- Autocomplete: Use streaming to early-terminate Anthropic requests [#723](https://github.com/sourcegraph/cody/pull/723)
- Agent: Add clipboard to VS Code shim [#721](https://github.com/sourcegraph/cody/pull/721)
- Agent: add support to trace JSON messages [#720](https://github.com/sourcegraph/cody/pull/720)
- Move typewriter so it does not throttle keyword expansion, reranker [#719](https://github.com/sourcegraph/cody/pull/719)
- Add autoresizing and command button to chat input [#718](https://github.com/sourcegraph/cody/pull/718)
- Use primary button theme on hover for insert, copy. [#717](https://github.com/sourcegraph/cody/pull/717)
- VS Code marketplace readme clarifications [#715](https://github.com/sourcegraph/cody/pull/715)
- Adding support for downward scrolling when a search operation is performed on Cody [#712](https://github.com/sourcegraph/cody/pull/712)
- fixup: add code lens to discard fixup suggestion [#711](https://github.com/sourcegraph/cody/pull/711)
- Autocomplete: Log chars with suggestion event [#710](https://github.com/sourcegraph/cody/pull/710)
- Autocomplete: Fix starcoder model name again [#708](https://github.com/sourcegraph/cody/pull/708)
- Agent: make advanced autocomplete configuration optional  [#707](https://github.com/sourcegraph/cody/pull/707)
- Autocomplete: Aggregate completion started events [#706](https://github.com/sourcegraph/cody/pull/706)
- e2e: inspect quality evaluation results [#705](https://github.com/sourcegraph/cody/pull/705)
- Use CSS scroll anchoring for most chat scroll pinning [#704](https://github.com/sourcegraph/cody/pull/704)
- vscode: add feature flag provider [#703](https://github.com/sourcegraph/cody/pull/703)
- commands: match commands on description [#702](https://github.com/sourcegraph/cody/pull/702)
- Add a settings button to Cody pane header [#701](https://github.com/sourcegraph/cody/pull/701)
- Don't require Esc to dismiss Cody menu [#700](https://github.com/sourcegraph/cody/pull/700)
- VS Code: Release 0.6.7 [#698](https://github.com/sourcegraph/cody/pull/698)
- fix duplicate paste events for telemetry log [#696](https://github.com/sourcegraph/cody/pull/696)
- Fixed typo in context-search.ts [#695](https://github.com/sourcegraph/cody/pull/695)
- Trim values in vscode auth menu [#693](https://github.com/sourcegraph/cody/pull/693)
- Intelligent Cody: MVP using VSCode API [#692](https://github.com/sourcegraph/cody/pull/692)
- Agent: add codebase setting to configuration [#691](https://github.com/sourcegraph/cody/pull/691)
- Agent: Suppress telemetry if agent is running and update docs [#689](https://github.com/sourcegraph/cody/pull/689)
- Agent: implement more `vscode` APIs [#687](https://github.com/sourcegraph/cody/pull/687)
- fix chat verical alignment [#684](https://github.com/sourcegraph/cody/pull/684)
- custom command: update get context for current file [#683](https://github.com/sourcegraph/cody/pull/683)
- update: log token count for code generated and button click events across the extension [#675](https://github.com/sourcegraph/cody/pull/675)
- Autocomplete: Log number of accepted chars per suggestion [#674](https://github.com/sourcegraph/cody/pull/674)
- Autocomplete: Remove suffix matching bail for FIM models [#671](https://github.com/sourcegraph/cody/pull/671)
- Release cody-ui v0.0.7 [#670](https://github.com/sourcegraph/cody/pull/670)
- Agent: code cleanup and get autocomplete working again [#669](https://github.com/sourcegraph/cody/pull/669)
- Agent: add debug notifications for clients to receive debug messages [#668](https://github.com/sourcegraph/cody/pull/668)
- always log error from getInlineCompletions [#664](https://github.com/sourcegraph/cody/pull/664)
- rm unused streamCompletions [#663](https://github.com/sourcegraph/cody/pull/663)
- rm needlessly included file [#662](https://github.com/sourcegraph/cody/pull/662)
- fix changelog from pull/602 [#661](https://github.com/sourcegraph/cody/pull/661)
- Update VSC marketplace + README [#659](https://github.com/sourcegraph/cody/pull/659)
- Autocomplete: Truncate same line suffix from prompt [#655](https://github.com/sourcegraph/cody/pull/655)
- overhaul autocomplete provider config [#650](https://github.com/sourcegraph/cody/pull/650)
- Autocomplete: Fix suggestion event over counting [#649](https://github.com/sourcegraph/cody/pull/649)
- add walkthrough for commands, update commands menu [#648](https://github.com/sourcegraph/cody/pull/648)
- Autocomplete: Fix previous non-empty line [#647](https://github.com/sourcegraph/cody/pull/647)
- VS Code: Release 0.6.6 [#645](https://github.com/sourcegraph/cody/pull/645)
- Autocomplete: More analytics tweaks [#644](https://github.com/sourcegraph/cody/pull/644)
- Autocomplete: Fix fireworks model name [#643](https://github.com/sourcegraph/cody/pull/643)
- Prefer runtime package.json for logger version [#641](https://github.com/sourcegraph/cody/pull/641)
- Autocomplete: Various analytic improvements [#637](https://github.com/sourcegraph/cody/pull/637)
- Autocomplete: Improve interaction with completions menu [#636](https://github.com/sourcegraph/cody/pull/636)
- Update package publishing docs [#627](https://github.com/sourcegraph/cody/pull/627)
- Bump cody-shared package version [#626](https://github.com/sourcegraph/cody/pull/626)
- support signing in on VS Code Web [#625](https://github.com/sourcegraph/cody/pull/625)
- Agent: add support for autocomplete [#624](https://github.com/sourcegraph/cody/pull/624)
- VS Cody: Add #605 and #603 to the changelog [#621](https://github.com/sourcegraph/cody/pull/621)
- add experimentalEditorTitleCommandIcon > statusbar [#611](https://github.com/sourcegraph/cody/pull/611)
- Add recipe that asks Cody to respond with only code [#610](https://github.com/sourcegraph/cody/pull/610)
- Autocomplete: Tweak StarCoder options [#609](https://github.com/sourcegraph/cody/pull/609)
- commands: add telemetry logging for chat commands [#608](https://github.com/sourcegraph/cody/pull/608)
- Autocomplete: Fix suffix matching logic for FIM models [#607](https://github.com/sourcegraph/cody/pull/607)
- command: add tab-to-complete [#606](https://github.com/sourcegraph/cody/pull/606)
- VS Code: Remove beta labels from features [#605](https://github.com/sourcegraph/cody/pull/605)
- Autocomplete: Move context logic into a seperate folder and improve naming consistency [#604](https://github.com/sourcegraph/cody/pull/604)
- VS Code: Don't add "Reload Window" actions to all views [#603](https://github.com/sourcegraph/cody/pull/603)
- Autocomplete: Improve Python and Ruby quality [#597](https://github.com/sourcegraph/cody/pull/597)
- Cody: Always expand inline on chat [#593](https://github.com/sourcegraph/cody/pull/593)
- VS Code: Release 0.6.5 [#592](https://github.com/sourcegraph/cody/pull/592)
- Autocomplete: Check next non-empty line for last candidate test and network cache [#591](https://github.com/sourcegraph/cody/pull/591)
- Cody end-to-end quality evaluation suite [#590](https://github.com/sourcegraph/cody/pull/590)
- Autocomplete: Use correct range for fill-in-middle models [#581](https://github.com/sourcegraph/cody/pull/581)
- Autocomplete: Include current file name in anthropic prompt [#580](https://github.com/sourcegraph/cody/pull/580)
- Update CHANGELOG [#579](https://github.com/sourcegraph/cody/pull/579)
- Potential bug fix in next questions recipe [#572](https://github.com/sourcegraph/cody/pull/572)
- cody web: fix state updates when switching between history records when response is in flight [#568](https://github.com/sourcegraph/cody/pull/568)
- Fix git SSH URL parsing [#567](https://github.com/sourcegraph/cody/pull/567)
- fix ~/.vscode/cody.json recipes file watch that exhausted system [#565](https://github.com/sourcegraph/cody/pull/565)
- dispose of file watcher listeners in CommandsController [#564](https://github.com/sourcegraph/cody/pull/564)
- add test case for filtering when there are multiple last-candidate items [#563](https://github.com/sourcegraph/cody/pull/563)
- Autocomplete: Use the 7b version of StarCoder by default [#560](https://github.com/sourcegraph/cody/pull/560)
- Autocomplete: Bring back completion synthesization from prior requests and retest all inflight requests [#559](https://github.com/sourcegraph/cody/pull/559)
- cody chat: add getting started widget [#557](https://github.com/sourcegraph/cody/pull/557)
- autocomplete trace view improvements [#556](https://github.com/sourcegraph/cody/pull/556)
- use separate vscode webview source map to cut bundle by 17MB [#555](https://github.com/sourcegraph/cody/pull/555)
- Update dependency prettier to v3.0.1 [#553](https://github.com/sourcegraph/cody/pull/553)
- add cody.experimental.nonStop as setting for internal discoverability [#552](https://github.com/sourcegraph/cody/pull/552)
- fix problem with github copilot suppressing ctrl+enter in comment UI [#551](https://github.com/sourcegraph/cody/pull/551)
- disable commands code lens and editor title icon by default [#550](https://github.com/sourcegraph/cody/pull/550)
- remove obsolete "Fixup Code from Inline Instructions" [#549](https://github.com/sourcegraph/cody/pull/549)
- left-align items in the cody status bar enable menu [#548](https://github.com/sourcegraph/cody/pull/548)
- ignore completion-review-tool data files in search [#547](https://github.com/sourcegraph/cody/pull/547)
- Autocomplete: Remove unused sliceUntilFirstNLinesOfSuffixMatch function [#543](https://github.com/sourcegraph/cody/pull/543)
- Autocomplete: Remove trailing whitespace [#542](https://github.com/sourcegraph/cody/pull/542)
- VS Code: Release 0.6.4 [#541](https://github.com/sourcegraph/cody/pull/541)
- Autocomplete: Add infilling test case and capture new StarCoder 7b results [#540](https://github.com/sourcegraph/cody/pull/540)
- Cody completion: Add initial tree-sitter utils [#538](https://github.com/sourcegraph/cody/pull/538)
- Add support for custom pre-configured extension settings to Cody VSCode extension build script [#536](https://github.com/sourcegraph/cody/pull/536)
- Autocomplete: Fix Fireworks [#534](https://github.com/sourcegraph/cody/pull/534)
- Autocomplete: Add php, dart, and vue support for multi-line completions [#533](https://github.com/sourcegraph/cody/pull/533)
- Update dependency @types/glob to v8 [#529](https://github.com/sourcegraph/cody/pull/529)
- Remove unused build script [#527](https://github.com/sourcegraph/cody/pull/527)
- Autocomplete: Fix codebase context inference for embeddings [#525](https://github.com/sourcegraph/cody/pull/525)
- Update dependency @types/marked to v5 [#520](https://github.com/sourcegraph/cody/pull/520)
- Update dependency @types/prettier to v2.7.3 [#517](https://github.com/sourcegraph/cody/pull/517)
- Update prettier [#514](https://github.com/sourcegraph/cody/pull/514)
- Cody: Consolidate inline and non-stop fixups [#510](https://github.com/sourcegraph/cody/pull/510)
- Autocomplete: Properly handle Fireworks errors [#505](https://github.com/sourcegraph/cody/pull/505)
- Cody: Fix dev commands [#504](https://github.com/sourcegraph/cody/pull/504)
- Update dependency @vscode/vsce to ^2.22.0 [#503](https://github.com/sourcegraph/cody/pull/503)
- Update dependency stylelint to ^15.10.2 [#495](https://github.com/sourcegraph/cody/pull/495)
- support null completion tracer context [#483](https://github.com/sourcegraph/cody/pull/483)
- return completions from the start of current line to reduce VS Code UI jitter [#482](https://github.com/sourcegraph/cody/pull/482)
- skip flaky `Cody Fixup Task Controller` integration test [#481](https://github.com/sourcegraph/cody/pull/481)
- do not swallow provideInlineCompletionItems exception [#480](https://github.com/sourcegraph/cody/pull/480)
- add documentAndPosition test helper [#479](https://github.com/sourcegraph/cody/pull/479)
- try to show completion when suggest widget is showing [#478](https://github.com/sourcegraph/cody/pull/478)
- mv vscode/src/completions/{index => types}.ts [#477](https://github.com/sourcegraph/cody/pull/477)
- skip playwright post-install scripts to speed up build  [#476](https://github.com/sourcegraph/cody/pull/476)
- never build deasync to speed up and de-flake builds [#475](https://github.com/sourcegraph/cody/pull/475)
- Update CHANGELOG.md [#473](https://github.com/sourcegraph/cody/pull/473)
- move provider to vscodeInlineCompletionItemProvider.ts [#470](https://github.com/sourcegraph/cody/pull/470)
- extract completion tag function test helper [#469](https://github.com/sourcegraph/cody/pull/469)
- Log events from E2E tests in dedicated testing environment [#468](https://github.com/sourcegraph/cody/pull/468)
- fix eslint auto-fixable issues [#467](https://github.com/sourcegraph/cody/pull/467)
- use more realistic VS Code mocks in tests [#466](https://github.com/sourcegraph/cody/pull/466)
- extract History to DocumentHistory [#465](https://github.com/sourcegraph/cody/pull/465)
- disable telemetry when extension is running in dev or test mode [#464](https://github.com/sourcegraph/cody/pull/464)
- extract DocumentContext and rename currentLine{Prefix,Suffix} [#463](https://github.com/sourcegraph/cody/pull/463)
- always use triggerMoreEagerly behavior (remove config to disable it) [#462](https://github.com/sourcegraph/cody/pull/462)
- rm unneeded check for cody scheme [#461](https://github.com/sourcegraph/cody/pull/461)
- debug log prefix for readability in output channel [#460](https://github.com/sourcegraph/cody/pull/460)
- Add provider name to generated completions datasets [#458](https://github.com/sourcegraph/cody/pull/458)
- Autocomplete: Fix loading indicator and deletion opt-out [#456](https://github.com/sourcegraph/cody/pull/456)
- Cody: Rename confusing `selection` to `selectionRange` [#453](https://github.com/sourcegraph/cody/pull/453)
- Cody: Add dev:insiders command for VS Code [#452](https://github.com/sourcegraph/cody/pull/452)
- Improve feedback button behavior [#451](https://github.com/sourcegraph/cody/pull/451)
- Remove in-chat onboarding buttons for new chats [#450](https://github.com/sourcegraph/cody/pull/450)
- Layout cleanups: smaller header and single line message input [#449](https://github.com/sourcegraph/cody/pull/449)
- Cody: Hide feedback button on err response  [#448](https://github.com/sourcegraph/cody/pull/448)
- more stable autocomplete [#442](https://github.com/sourcegraph/cody/pull/442)
- Autocomplete: Add fireworks provider [#441](https://github.com/sourcegraph/cody/pull/441)
- Autocomplete: Add some info on how to access logs [#439](https://github.com/sourcegraph/cody/pull/439)
- Add optional data parameter for client requests [#438](https://github.com/sourcegraph/cody/pull/438)
- use consistent language for insiders (builds vs. releases vs. channel) [#435](https://github.com/sourcegraph/cody/pull/435)
- do not disable other autocomplete extensions when debugging [#434](https://github.com/sourcegraph/cody/pull/434)
- trace calls to completion providers [#433](https://github.com/sourcegraph/cody/pull/433)
- add dev helpers to focus sidebar on startup or open trace view [#432](https://github.com/sourcegraph/cody/pull/432)
- fix Cody status bar icon in release builds [#431](https://github.com/sourcegraph/cody/pull/431)
- hack around flaky Fixup Task Controller integration test w/delay [#430](https://github.com/sourcegraph/cody/pull/430)
- disable slow eslint no-deprecated rule [#429](https://github.com/sourcegraph/cody/pull/429)
- remove needless alias for `path` to `path-browserify` in `web` [#428](https://github.com/sourcegraph/cody/pull/428)
- make FixupScheduler compatible with DOM setTimeout and Node.js setTimeout [#427](https://github.com/sourcegraph/cody/pull/427)
- use VS Code git extension to get remote URL instead of exec'ing [#426](https://github.com/sourcegraph/cody/pull/426)
- narrow types and imports [#425](https://github.com/sourcegraph/cody/pull/425)
- experimental support for Cody as a VS Code Web extension [#424](https://github.com/sourcegraph/cody/pull/424)
- reuse SourcegraphCompletionsClient.complete across browser/node [#423](https://github.com/sourcegraph/cody/pull/423)
- simpler "fresh user install" steps in docs [#422](https://github.com/sourcegraph/cody/pull/422)
- document how to get the Cody insiders release [#420](https://github.com/sourcegraph/cody/pull/420)
- Autocomplete: Add unstable-azure-openai provider for code autocomplete [#419](https://github.com/sourcegraph/cody/pull/419)
- various possible fixes for `Cannot read properties of null` errors [#418](https://github.com/sourcegraph/cody/pull/418)
- run e2e tests on windows [#417](https://github.com/sourcegraph/cody/pull/417)
- include sourcemaps in vscode extension [#416](https://github.com/sourcegraph/cody/pull/416)
- Autocomplete: Use tabby style helpers for completion strings in tests [#413](https://github.com/sourcegraph/cody/pull/413)
- Autocomplete: Overhaul telemetry and fix various corner cases [#412](https://github.com/sourcegraph/cody/pull/412)
- Autocomplete: Use enum for finite config options [#411](https://github.com/sourcegraph/cody/pull/411)
- minor cleanups [#410](https://github.com/sourcegraph/cody/pull/410)
- make vscode extension more portable [#409](https://github.com/sourcegraph/cody/pull/409)
- run full vscode test suite before release [#408](https://github.com/sourcegraph/cody/pull/408)
- rm unused/unneeded vscode build scripts [#407](https://github.com/sourcegraph/cody/pull/407)
- use the `rg` (ripgrep) built into VS Code [#406](https://github.com/sourcegraph/cody/pull/406)
- remove deprecated VS Code settings that have since been migrated [#405](https://github.com/sourcegraph/cody/pull/405)
- Add naive html escaping for inline chat. [#404](https://github.com/sourcegraph/cody/pull/404)
- remove unused Debug tab in sidebar webview [#403](https://github.com/sourcegraph/cody/pull/403)
- release v0.6.3 [#402](https://github.com/sourcegraph/cody/pull/402)
- fix default of triggerMoreEagerly in code [#401](https://github.com/sourcegraph/cody/pull/401)
- remove experimental file-path hallucination detector [#400](https://github.com/sourcegraph/cody/pull/400)
- add cody.telemetry.level VS Code setting to control telemetry [#399](https://github.com/sourcegraph/cody/pull/399)
- fix steps for using cody as a library [#398](https://github.com/sourcegraph/cody/pull/398)
- Autocomplete: Remove docprovider [#394](https://github.com/sourcegraph/cody/pull/394)
- Autocomplete: Make completion test indentation more explicit [#393](https://github.com/sourcegraph/cody/pull/393)
- Autocomplete: Delay mutli-line cached completions [#392](https://github.com/sourcegraph/cody/pull/392)
- Autocomplete: Fix Codegen provider [#391](https://github.com/sourcegraph/cody/pull/391)
- refactor telemetry service for VS Code extension [#388](https://github.com/sourcegraph/cody/pull/388)
- remove config migration from `completions` to `autocomplete` after ~35 days [#387](https://github.com/sourcegraph/cody/pull/387)
- Log new fields client, connected_site_id, and hashed_license_key with… [#385](https://github.com/sourcegraph/cody/pull/385)
- helpful VS Code launch profile for running a separate instance [#384](https://github.com/sourcegraph/cody/pull/384)
- remove unused vscode settings webview tab [#383](https://github.com/sourcegraph/cody/pull/383)
- v0.6.2 [#382](https://github.com/sourcegraph/cody/pull/382)
- note in changelog that triggerMoreEagerly defaults to true [#380](https://github.com/sourcegraph/cody/pull/380)
- get 3 completions when manually triggered [#379](https://github.com/sourcegraph/cody/pull/379)
- Completion: fix bad trailing `}` completion  [#378](https://github.com/sourcegraph/cody/pull/378)
- Feedback overlap fix [#377](https://github.com/sourcegraph/cody/pull/377)
- Inline Fix: Improve response quality [#376](https://github.com/sourcegraph/cody/pull/376)
- Autocomplete: Fix text document slicing logic in VS Code mocks [#375](https://github.com/sourcegraph/cody/pull/375)
- make ActiveTextEditorViewControllers optional and improve usage of types [#372](https://github.com/sourcegraph/cody/pull/372)
- fall back to less context if `rg` is not available [#371](https://github.com/sourcegraph/cody/pull/371)
- use simpler XML parsing lib in reranking [#370](https://github.com/sourcegraph/cody/pull/370)
- support working with recipes, etc., on virtual files [#369](https://github.com/sourcegraph/cody/pull/369)
- default `cody.autocomplete.experimental.triggerMoreEagerly` to true [#368](https://github.com/sourcegraph/cody/pull/368)
- shorten test plan in PR template [#366](https://github.com/sourcegraph/cody/pull/366)
- custom recipes: add comments, debug, basic e2e test [#365](https://github.com/sourcegraph/cody/pull/365)
- Autocomplete: Update Hugging Face inference endpoint for StarCoder prompt [#363](https://github.com/sourcegraph/cody/pull/363)
- Autocomplete: Add support for context in automated testing and add export for dataset option to trace view [#362](https://github.com/sourcegraph/cody/pull/362)
- reuse CodyCompletionItemProviderConfig [#357](https://github.com/sourcegraph/cody/pull/357)
- add `Cody: Open Autocomplete Trace View` and associated view [#356](https://github.com/sourcegraph/cody/pull/356)
- misc vscode refactors [#355](https://github.com/sourcegraph/cody/pull/355)
- Release v0.6.1 [#354](https://github.com/sourcegraph/cody/pull/354)
- fix event name for copy and insert events [#353](https://github.com/sourcegraph/cody/pull/353)
- Cody: Fix `any` type [#350](https://github.com/sourcegraph/cody/pull/350)
- custom recipes: move behind experimental flag [#348](https://github.com/sourcegraph/cody/pull/348)
- Cody: Type webview events [#347](https://github.com/sourcegraph/cody/pull/347)
- Migrate autocomplete review tool [#345](https://github.com/sourcegraph/cody/pull/345)
- Autocomplete: Only ever complete a single line in single-line mode and reduce the output token limit [#344](https://github.com/sourcegraph/cody/pull/344)
- fix tsconfig excludes [#343](https://github.com/sourcegraph/cody/pull/343)
- remove unnecessary vite globals [#342](https://github.com/sourcegraph/cody/pull/342)
- "Sign in" is two words [#341](https://github.com/sourcegraph/cody/pull/341)
- fix `pnpm run dev` when run from the vscode/ dir [#340](https://github.com/sourcegraph/cody/pull/340)
- VS Code: Add docs for testing packaged extension [#331](https://github.com/sourcegraph/cody/pull/331)
- Autocomplete: Remove multilineMode in favor of a simple boolean [#329](https://github.com/sourcegraph/cody/pull/329)
- Fix input history down button [#328](https://github.com/sourcegraph/cody/pull/328)
- custom recipes: add /open command and improve prompts [#327](https://github.com/sourcegraph/cody/pull/327)
- remove obsolete manual completions [#326](https://github.com/sourcegraph/cody/pull/326)
- update: log app and auth events [#324](https://github.com/sourcegraph/cody/pull/324)
- cody: change history icon [#323](https://github.com/sourcegraph/cody/pull/323)
- [Cody completion]: Improve trailing completion based on suffix string [#322](https://github.com/sourcegraph/cody/pull/322)
- Autocomplete: Cache previously cancelled completions [#317](https://github.com/sourcegraph/cody/pull/317)
- Recipes drag and drop feature [#314](https://github.com/sourcegraph/cody/pull/314)
- declutter and clean up vscode package.json [#313](https://github.com/sourcegraph/cody/pull/313)
- remove outdated comment [#312](https://github.com/sourcegraph/cody/pull/312)
- show inline completions even when suggest widget is visible (experimental) [#311](https://github.com/sourcegraph/cody/pull/311)
- Refactor eventlogger and use localstorage for server endpoint [#309](https://github.com/sourcegraph/cody/pull/309)
- separately cache non-empty lines with differing trailing whitespace [#307](https://github.com/sourcegraph/cody/pull/307)
- custom recipes: replace numResults with const, add comments, update samples [#306](https://github.com/sourcegraph/cody/pull/306)
- Autocomplete: Fix merging existing line suffix [#286](https://github.com/sourcegraph/cody/pull/286)
- allow manual triggering of completions [#285](https://github.com/sourcegraph/cody/pull/285)
- preserve leading whitespace in completions [#284](https://github.com/sourcegraph/cody/pull/284)
- add MockCompletionsClient, improve run-code-completions-on-dataset [#283](https://github.com/sourcegraph/cody/pull/283)
- update custom recipes: support premade, save user recipes to file [#279](https://github.com/sourcegraph/cody/pull/279)
- agent: get cody enabled status/version [#277](https://github.com/sourcegraph/cody/pull/277)
- Cody: Limit completions to 2 lines in single line mode [#276](https://github.com/sourcegraph/cody/pull/276)
- better logging for trigger-more-eagerly autocomplete [#273](https://github.com/sourcegraph/cody/pull/273)
- improve stable/insiders instructions for publishing and usage [#272](https://github.com/sourcegraph/cody/pull/272)
- improve single-line completion perf by only fetching 1 completion [#266](https://github.com/sourcegraph/cody/pull/266)
- improve Anthropic code completion prompt [#265](https://github.com/sourcegraph/cody/pull/265)
- make the run-code-completions-on-dataset script work [#263](https://github.com/sourcegraph/cody/pull/263)
- upgrade nodejs [#262](https://github.com/sourcegraph/cody/pull/262)
- support publishing insiders builds whenever [#261](https://github.com/sourcegraph/cody/pull/261)
- experimental more eager autocomplete triggering [#260](https://github.com/sourcegraph/cody/pull/260)
- add logging to `publicProperties` in new logged events [#259](https://github.com/sourcegraph/cody/pull/259)
- Release v0.4.4 [#257](https://github.com/sourcegraph/cody/pull/257)
- custom prompts: add intro and new context type [#255](https://github.com/sourcegraph/cody/pull/255)
- Bump pnpm for scip typescript [#254](https://github.com/sourcegraph/cody/pull/254)
- Add scip-typescript indexing job [#252](https://github.com/sourcegraph/cody/pull/252)
- add installation instructions from the published npm package [#251](https://github.com/sourcegraph/cody/pull/251)
- make the @sourcegraph/cody-cli package publishable [#250](https://github.com/sourcegraph/cody/pull/250)
- use absolute paths for tsconfig files [#247](https://github.com/sourcegraph/cody/pull/247)
- cli: add commit command to generate a commit message [#246](https://github.com/sourcegraph/cody/pull/246)
- Hotkey cmd+K clears & restarts session [#245](https://github.com/sourcegraph/cody/pull/245)
- clean up Cody CLI [#203](https://github.com/sourcegraph/cody/pull/203)
- remove nonexistent .eslintrc.js entry from tsconfig.json files [#202](https://github.com/sourcegraph/cody/pull/202)
- agent: prevent infinite loop [#109](https://github.com/sourcegraph/cody/pull/109)
- autocomplete: cut-off completions on partial suffix match [#108](https://github.com/sourcegraph/cody/pull/108)
- Handle network disconnection [#107](https://github.com/sourcegraph/cody/pull/107)
- feature: custom prompts (internal) [#81](https://github.com/sourcegraph/cody/pull/81)
- agent: add minify command [#79](https://github.com/sourcegraph/cody/pull/79)
- Cody: Update extension display name [#74](https://github.com/sourcegraph/cody/pull/74)
- Cody: Fix inline loading state [#73](https://github.com/sourcegraph/cody/pull/73)
- Set `CODY_RELEASE_TYPE` for vscode-release [#72](https://github.com/sourcegraph/cody/pull/72)
- add pr template [#71](https://github.com/sourcegraph/cody/pull/71)
- Cody: Bot response multiplexer publishes, then completes turns [#70](https://github.com/sourcegraph/cody/pull/70)
- hide .vscode-test dir in VS Code explorer [#69](https://github.com/sourcegraph/cody/pull/69)
- faster download-rg.sh that runs w/o hitting the GitHub API [#68](https://github.com/sourcegraph/cody/pull/68)
- Update dependency eslint to ^8.49.0 [#64](https://github.com/sourcegraph/cody/pull/64)
- use explicit imports for describe/test/it/expect [#63](https://github.com/sourcegraph/cody/pull/63)
- update VS Code readme and marketplace listing to match top-level README [#59](https://github.com/sourcegraph/cody/pull/59)
- finish removing rg binary downloads for archaic architectures (i686, etc.) [#58](https://github.com/sourcegraph/cody/pull/58)
- release vscode 0.4.3 [#57](https://github.com/sourcegraph/cody/pull/57)
- fix release script invocation of download-rg.sh [#56](https://github.com/sourcegraph/cody/pull/56)
- improve cody cli docs [#55](https://github.com/sourcegraph/cody/pull/55)
- less noisy download-rg.sh, don't re-download files if already exist [#54](https://github.com/sourcegraph/cody/pull/54)
- Update dependency @sourcegraph/eslint-config to v0.33.0 [#52](https://github.com/sourcegraph/cody/pull/52)
- add deprecationMessage for serverEndpoint [#51](https://github.com/sourcegraph/cody/pull/51)
- Cody: Reduce scroll threshold for auto scroll [#39](https://github.com/sourcegraph/cody/pull/39)
- Inline Chat: Separate from sidebar (and ChatProvider) [#7](https://github.com/sourcegraph/cody/pull/7)
- fix typo [#2](https://github.com/sourcegraph/cody/pull/2)
- Configure Renovate [#1](https://github.com/sourcegraph/cody/pull/1)


## Unreleased

### Added

### Fixed

### Changed

### Uncategorized

## 1.64.0

Introducing Sourcegraph’s AI coding agents: built to automate repetitive tasks so your developers can focus on innovation. Learn more about our vision for the future [here](https://sourcegraph.com/blog/introducing-enterprise-ai-agents).

### Added

- Release Omnibox: remove feature flag [pull/6849](https://github.com/sourcegraph/cody/pull/6849)
- omnibox: open results locally if possible [pull/6799](https://github.com/sourcegraph/cody/pull/6799)
- omnibox: add callout for results from other repos [pull/6732](https://github.com/sourcegraph/cody/pull/6732)
- omnibox: link file path to the line of the first match [pull/6705](https://github.com/sourcegraph/cody/pull/6705)
- feat: omnibox cheatsheet [pull/6676](https://github.com/sourcegraph/cody/pull/6676)
- omnibox: add "Did you mean" notice [pull/6655](https://github.com/sourcegraph/cody/pull/6655)
- feat(auth): Allow workspace to pre-populate URL for quick sign-in (#6653) [pull/6817](https://github.com/sourcegraph/cody/pull/6817)
- Support endpoint param in auth flow (workspaces vscode sign-in flow) [pull/6742](https://github.com/sourcegraph/cody/pull/6742)
- feat: at mentions for prompt templates editor [pull/6638](https://github.com/sourcegraph/cody/pull/6638)

### Fixed

- fix(auto-edit): fix temperature value to be low for output consistency [pull/6854](https://github.com/sourcegraph/cody/pull/6854)
- feat(auto-edit): fix the temperature value regression with the auto-edit [pull/6851](https://github.com/sourcegraph/cody/pull/6851)
- chore(audo-edit): fix the illegal line runtime error [pull/6727](https://github.com/sourcegraph/cody/pull/6727)
- feat(autoedit): Fix blockify range logic for tab indentation [pull/6701](https://github.com/sourcegraph/cody/pull/6701)
- fix: handle missing spaces around @ mentions in cody chat [pull/6843](https://github.com/sourcegraph/cody/pull/6843)
- fix: improved support for special characters around @ mentions [pull/6814](https://github.com/sourcegraph/cody/pull/6814)
- fix: define all base64 characters [pull/6840](https://github.com/sourcegraph/cody/pull/6840)
- fix(telemetry): add billing metadata to `onebox` events [pull/6822](https://github.com/sourcegraph/cody/pull/6822)
- Fix intent telemetry (#6779) [pull/6795](https://github.com/sourcegraph/cody/pull/6795)
- Disable Intent Detection if Code Search Disabled [pull/6754](https://github.com/sourcegraph/cody/pull/6754)
- fix(models): ensure Tool Cody is only added when enabled [pull/6758](https://github.com/sourcegraph/cody/pull/6758)
- fix(omnibox): add conditional rendering to buttons [pull/6731](https://github.com/sourcegraph/cody/pull/6731)
- fix(omnibox): fix available filters when deselecting [pull/6717](https://github.com/sourcegraph/cody/pull/6717)
- Various styling updates [pull/6723](https://github.com/sourcegraph/cody/pull/6723)
- fix/context: Link to helpful resource when current repo not indexed in non-dotcom [pull/6695](https://github.com/sourcegraph/cody/pull/6695)
- Update UI and fix intent bug [pull/6720](https://github.com/sourcegraph/cody/pull/6720)
- fix: Search results in Cody visual update [pull/6714](https://github.com/sourcegraph/cody/pull/6714)
- fix/agentic-context: Reveal hidden switch in context popup [pull/6694](https://github.com/sourcegraph/cody/pull/6694)
- fix: add z-index to quick start modal [pull/6711](https://github.com/sourcegraph/cody/pull/6711)
- fix: only log on open file [pull/6704](https://github.com/sourcegraph/cody/pull/6704)
- Fix pointer cursor displaying on line numbers in search results [pull/6681](https://github.com/sourcegraph/cody/pull/6681)
- Fixing Css logic to correctly show rate limit banners in the correct place [pull/6464](https://github.com/sourcegraph/cody/pull/6464)
- fix: unicode support, remove current repo mention [pull/6688](https://github.com/sourcegraph/cody/pull/6688)
- fix/intent: Insert detected intent scores into telemetry event metadata in acceptable format [pull/6686](https://github.com/sourcegraph/cody/pull/6686)
- fix: Intent handling logic fixes [pull/6637](https://github.com/sourcegraph/cody/pull/6637)
- fix(auto-edit): fix the feature name [pull/6682](https://github.com/sourcegraph/cody/pull/6682)
- fix/accounts: Do not prefill the dotcom URL in the Enterprise login field [pull/6418](https://github.com/sourcegraph/cody/pull/6418)
- chore/webview: Fix webview-extension RPC logging to contain message payloads [pull/6671](https://github.com/sourcegraph/cody/pull/6671)
- fix(agentic-chat): fix prompt-mixin for deep-cody agent [pull/6654](https://github.com/sourcegraph/cody/pull/6654)

### Changed

- chore(marketing): update listing description [pull/6874](https://github.com/sourcegraph/cody/pull/6874)
- chore(ES): fix cta typo [pull/6857](https://github.com/sourcegraph/cody/pull/6857)
- chore(client): update display name for agentic model [pull/6828](https://github.com/sourcegraph/cody/pull/6828)
- chore(ES): update CTAs and eligibility logic [pull/6825](https://github.com/sourcegraph/cody/pull/6825)
- refactor(agentic chat): move into model dropdown [pull/6718](https://github.com/sourcegraph/cody/pull/6718)
- refactor(agentic-context): update status messaging [pull/6670](https://github.com/sourcegraph/cody/pull/6670)
- Refactor external auth providers to re-generate headers on demand [pull/6687](https://github.com/sourcegraph/cody/pull/6687)
- chore(autocomplete): use the correct output channel label [pull/6709](https://github.com/sourcegraph/cody/pull/6709)
- omnibox: remove code search external link [pull/6706](https://github.com/sourcegraph/cody/pull/6706)
- chore(audo-edit): encapsulate prompt components [pull/6672](https://github.com/sourcegraph/cody/pull/6672)
- chore(audo-edit): add backward compatible setting value [pull/6673](https://github.com/sourcegraph/cody/pull/6673)
- chore(webviews): remove teams upgrade notice [pull/6651](https://github.com/sourcegraph/cody/pull/6651)

## 1.62.0

### Added

- feat(audo-edit): target vim normal mode only [pull/6647](https://github.com/sourcegraph/cody/pull/6647)
- feat(autoedit): Add telemetry and accept behaviour to E2E tests [pull/6575](https://github.com/sourcegraph/cody/pull/6575)
- feat(auto-edit): fix problem with vim extension supressing the tab [pull/6640](https://github.com/sourcegraph/cody/pull/6640)
- feat(auto-edits): fix the suffix duplication on inline accept [pull/6583](https://github.com/sourcegraph/cody/pull/6583)
- feat(auto-edits): fix tab not working when decorations are triggered on conflicting decorations [pull/6581](https://github.com/sourcegraph/cody/pull/6581)
- feat(auto-edit): improve error logging [pull/6609](https://github.com/sourcegraph/cody/pull/6609)
- feat(autoedits): Correctly produce decorations for files that use Tab indentation [pull/6617](https://github.com/sourcegraph/cody/pull/6617)
- feat(autoedit): Add more E2E test scenarios [pull/6573](https://github.com/sourcegraph/cody/pull/6573)
- feat(auto-edits): add test case for setting context [pull/6592](https://github.com/sourcegraph/cody/pull/6592)
- feat(auto-edits): fix the partial decoration issue when not enough lines in the editor [pull/6582](https://github.com/sourcegraph/cody/pull/6582)
- feat(autoedit): E2E tests, adjust color threshold [pull/6616](https://github.com/sourcegraph/cody/pull/6616)
- feat(auto-edits): add telemetry for auto-edits notification [pull/6594](https://github.com/sourcegraph/cody/pull/6594)
- feat(audoedit): update billing categories [pull/6591](https://github.com/sourcegraph/cody/pull/6591)
- feat(agentic context): add agentic context component [pull/6598](https://github.com/sourcegraph/cody/pull/6598)
- refactor(agentic-context): rename experimental feature flags [pull/6644](https://github.com/sourcegraph/cody/pull/6644)
- feat(agentic-context): disable setting by default [pull/6641](https://github.com/sourcegraph/cody/pull/6641)
- feat(webviews): add Sourcegraph Workspaces CTA [pull/6604](https://github.com/sourcegraph/cody/pull/6604)
- refactor(webviews): remove "Upgrade to Team" from context menu [pull/6621](https://github.com/sourcegraph/cody/pull/6621)
- chore/build: Do not complain about GITHUB_ENV when building locally [pull/6586](https://github.com/sourcegraph/cody/pull/6586)
- Add disabled to recording modes [pull/6615](https://github.com/sourcegraph/cody/pull/6615)
- bench/context: Cache repo IDs [pull/6569](https://github.com/sourcegraph/cody/pull/6569)

### Fixed

- chore(audo-edit): fix the illegal line runtime error [pull/6729](https://github.com/sourcegraph/cody/pull/6729)
- chore(audo-edit): add backward compatible setting value [pull/6674](https://github.com/sourcegraph/cody/pull/6674)
- fix(autoedits): Fix E2E tests on main [pull/6576](https://github.com/sourcegraph/cody/pull/6576)
- fix(agentic chat): exclude deep-cody prompt for o1 models (#6725) [pull/6733](https://github.com/sourcegraph/cody/pull/6733)
- fix(agentic-context): update search tool prompt and examples [pull/6632](https://github.com/sourcegraph/cody/pull/6632)
- feat(agentic-context): add feature flag for session usage limit [pull/6623](https://github.com/sourcegraph/cody/pull/6623)
- fix(webview): reorder human editor menu buttons [pull/6660](https://github.com/sourcegraph/cody/pull/6660)
- fix(release): fix generate changelog template string [pull/6728](https://github.com/sourcegraph/cody/pull/6728)
- fix: changelog generator with titles instead of changelog entries [pull/6712](https://github.com/sourcegraph/cody/pull/6712)
- fix: Hide search result checkboxes instead of disabling them [pull/6568](https://github.com/sourcegraph/cody/pull/6568)
- Fix repo name resolver cache miss due to using separate RepoNameResol… [pull/6570](https://github.com/sourcegraph/cody/pull/6570)
- fix(cody): fix chat context review logic [pull/6602](https://github.com/sourcegraph/cody/pull/6602)
- fix/context: Nit, remove duplicate "this" from Agentic context popover [pull/6633](https://github.com/sourcegraph/cody/pull/6633)
- Fix: Can actually run the changelog github action [pull/6645](https://github.com/sourcegraph/cody/pull/6645)

### Changed

- chore(audoedit): ensure consistent auto-edit name [pull/6611](https://github.com/sourcegraph/cody/pull/6611)
- chore(audoedit): simplify output channel logger [pull/6610](https://github.com/sourcegraph/cody/pull/6610)
- refactor(agentic context): update agent context settings [pull/6596](https://github.com/sourcegraph/cody/pull/6596)
- feat(agentic chat): showing error for toolbox settings status [pull/6579](https://github.com/sourcegraph/cody/pull/6579)
- chore/release: Bump package version and update changelog for 1.60 [pull/6666](https://github.com/sourcegraph/cody/pull/6666)
- Fix: Changelog generator action frfr no cap [pull/6659](https://github.com/sourcegraph/cody/pull/6659)
- Improve reporting auth errors [pull/6639](https://github.com/sourcegraph/cody/pull/6639)
- Open remote files locally in VSCode [pull/6475](https://github.com/sourcegraph/cody/pull/6475)
- Make sure precomputed intent is not stale [pull/6572](https://github.com/sourcegraph/cody/pull/6572)
- feat: changelog generation + version update action [pull/6597](https://github.com/sourcegraph/cody/pull/6597)
- External Authentication Providers Support for Cody [pull/6526](https://github.com/sourcegraph/cody/pull/6526)
- NLS: escape backslashes in query string [pull/6585](https://github.com/sourcegraph/cody/pull/6585)
- Bench: add option to disable Polly [pull/6557](https://github.com/sourcegraph/cody/pull/6557)
- Simplify jetbrains account management [pull/6558](https://github.com/sourcegraph/cody/pull/6558)
- Allow to force usage of pre-defined endpoint [pull/6574](https://github.com/sourcegraph/cody/pull/6574)
- Implement showWindowsMessage in JetBrains [pull/6577](https://github.com/sourcegraph/cody/pull/6577)
- chore/release: Remove the changelog section from the PR template. [pull/6470](https://github.com/sourcegraph/cody/pull/6470)
- Update Cody Web 0.22.0 [pull/6578](https://github.com/sourcegraph/cody/pull/6578)
- Pass query as 'content' in NLS bench [pull/6565](https://github.com/sourcegraph/cody/pull/6565)
- chore/release: Bump package version and update changelog for 1.58 [pull/6566](https://github.com/sourcegraph/cody/pull/6566)

### Uncategorized

## 1.60.0

### Added

- feat(agentic context): add agentic context component [pull/6598](https://github.com/sourcegraph/cody/pull/6598)
- feat(webviews): add Sourcegraph Workspaces CTA [pull/6604](https://github.com/sourcegraph/cody/pull/6604)
- feat(audo-edit): target vim normal mode only [pull/6647](https://github.com/sourcegraph/cody/pull/6647)
- Open remote files locally in VSCode [pull/6475](https://github.com/sourcegraph/cody/pull/6475)

### Fixed

- fix(webview): reorder human editor menu buttons [pull/6660](https://github.com/sourcegraph/cody/pull/6660)
- feat(auto-edit): fix problem with vim extension supressing the tab [pull/6640](https://github.com/sourcegraph/cody/pull/6640)
- Fix: Can actually run the changelog github action [pull/6645](https://github.com/sourcegraph/cody/pull/6645)
- External Authentication Providers Support for Cody [pull/6526](https://github.com/sourcegraph/cody/pull/6526)
- feat(autoedits): Correctly produce decorations for files that use Tab indentation [pull/6617](https://github.com/sourcegraph/cody/pull/6617)
- chore/build: Do not complain about GITHUB_ENV when building locally [pull/6586](https://github.com/sourcegraph/cody/pull/6586)
- fix(agentic-context): update search tool prompt and examples [pull/6632](https://github.com/sourcegraph/cody/pull/6632)
- fix(cody): fix chat context review logic [pull/6602](https://github.com/sourcegraph/cody/pull/6602)
- feat(auto-edits): fix the partial decoration issue when not enough lines in the editor [pull/6582](https://github.com/sourcegraph/cody/pull/6582)
- Allow to force usage of pre-defined endpoint [pull/6574](https://github.com/sourcegraph/cody/pull/6574)
- feat(auto-edits): fix the suffix duplication on inline accept [pull/6583](https://github.com/sourcegraph/cody/pull/6583)
- feat(auto-edits): fix tab not working when decorations are triggered on conflicting decorations [pull/6581](https://github.com/sourcegraph/cody/pull/6581)
- feat(agentic chat): showing error for toolbox settings status [pull/6579](https://github.com/sourcegraph/cody/pull/6579)
- Pass query as 'content' in NLS bench [pull/6565](https://github.com/sourcegraph/cody/pull/6565)
- fix: Hide search result checkboxes instead of disabling them [pull/6568](https://github.com/sourcegraph/cody/pull/6568)
- Fix repo name resolver cache miss due to using separate RepoNameResol… [pull/6570](https://github.com/sourcegraph/cody/pull/6570)

### Changed

- Improve reporting auth errors [pull/6639](https://github.com/sourcegraph/cody/pull/6639)
- feat(autoedit): Add telemetry and accept behaviour to E2E tests [pull/6575](https://github.com/sourcegraph/cody/pull/6575)
- Make sure precomputed intent is not stale [pull/6572](https://github.com/sourcegraph/cody/pull/6572)
- refactor(agentic-context): rename experimental feature flags [pull/6644](https://github.com/sourcegraph/cody/pull/6644)
- feat(agentic-context): disable setting by default [pull/6641](https://github.com/sourcegraph/cody/pull/6641)
- refactor(webviews): remove "Upgrade to Team" from context menu [pull/6621](https://github.com/sourcegraph/cody/pull/6621)
- feat(auto-edit): improve error logging [pull/6609](https://github.com/sourcegraph/cody/pull/6609)
- feat(agentic-context): add feature flag for session usage limit [pull/6623](https://github.com/sourcegraph/cody/pull/6623)
- feat(auto-edits): add telemetry for auto-edits notification [pull/6594](https://github.com/sourcegraph/cody/pull/6594)
- refactor(agentic context): update agent context settings [pull/6596](https://github.com/sourcegraph/cody/pull/6596)
- Add disabled to recording modes [pull/6615](https://github.com/sourcegraph/cody/pull/6615)
- bench/context: Cache repo IDs [pull/6569](https://github.com/sourcegraph/cody/pull/6569)
- chore(audoedit): ensure consistent auto-edit name [pull/6611](https://github.com/sourcegraph/cody/pull/6611)
- chore(audoedit): simplify output channel logger [pull/6610](https://github.com/sourcegraph/cody/pull/6610)
- NLS: escape backslashes in query string [pull/6585](https://github.com/sourcegraph/cody/pull/6585)
- feat(audoedit): update billing categories [pull/6591](https://github.com/sourcegraph/cody/pull/6591)

## 1.58.0

### Added

- feat(context-agent): tool status callbacks and process support [pull/6451](https://github.com/sourcegraph/cody/pull/6451)
- feat(nls): Add Cody bench command for NLS [pull/6497](https://github.com/sourcegraph/cody/pull/6497)

### Fixed

- fix(release): add $ variable invocation [pull/6509](https://github.com/sourcegraph/cody/pull/6509)
- fix/editor: Ask Cody to Fix no longer throws exceptions in TypeScript files [pull/6473](https://github.com/sourcegraph/cody/pull/6473)
- fix(context-agent): add status callbacks back [pull/6479](https://github.com/sourcegraph/cody/pull/6479)
- chore(security): Fix closed events for sast scan [pull/6512](https://github.com/sourcegraph/cody/pull/6512)
- fix: Move BigQuery insertion after release step [pull/6477](https://github.com/sourcegraph/cody/pull/6477)
- chore(chat): Adding fixing save chat session overwriting [pull/6457](https://github.com/sourcegraph/cody/pull/6457)

### Changed

- update `billingMetadata` for failed/disconnected type of events [pull/6254](https://github.com/sourcegraph/cody/pull/6254)
- feat(nls): add relevant repo boost [pull/6502](https://github.com/sourcegraph/cody/pull/6502)
- chore(chat): Decompose ChatController.sendChat into handlers for different request types [pull/6469](https://github.com/sourcegraph/cody/pull/6469)
- feat(autoedit): track notebook for auto-edit [pull/6449](https://github.com/sourcegraph/cody/pull/6449)
- chore(audoedit): consistent use of the output channel logger [pull/6472](https://github.com/sourcegraph/cody/pull/6472)
- feat(audoedit): ensure inline completions are also hidden on dismiss [pull/6465](https://github.com/sourcegraph/cody/pull/6465)
- feat(audoedit): remove the auto edit experimental command [pull/6471](https://github.com/sourcegraph/cody/pull/6471)
- feat(logging): Add interactionId to header of Cody Client requests (CODY-4117) [pull/6450](https://github.com/sourcegraph/cody/pull/6450)
- chore(audoedit): decouple `codeToReplaceData` from `getPromptForModelType` [pull/6474](https://github.com/sourcegraph/cody/pull/6474)

## 1.56.0

### Added

- auto-edit e2e tests [pull/6425](https://github.com/sourcegraph/cody/pull/6425)
- feat(audoedit): extract auto-edit config from the provider [pull/6460](https://github.com/sourcegraph/cody/pull/6460)
- autoedit: address dogfooding feedback [pull/6454](https://github.com/sourcegraph/cody/pull/6454)
- feat(audoedit): implement basic analytics logger [pull/6430](https://github.com/sourcegraph/cody/pull/6430)
- feat(onebox): Use new prompt editor when onebox is enabled [pull/6288](https://github.com/sourcegraph/cody/pull/6288)
- feat(network): Support for NO_PROXY (CODY_NODE_NO_PROXY) environment variable [pull/6555](https://github.com/sourcegraph/cody/pull/6555)

### Fixed

- feat(logging): Add interactionId to header of Cody Client requests (CODY-4117) [pull/6450](https://github.com/sourcegraph/cody/pull/6450)
- fix(autoedit): fix shrink prediction logic [pull/6404](https://github.com/sourcegraph/cody/pull/6404)
- fix(modelSelectField): missing overflow scrollbar when there isn't space to show entire list [pull/6423](https://github.com/sourcegraph/cody/pull/6423)
- fix: remove trailing spaces from extracted query [pull/6432](https://github.com/sourcegraph/cody/pull/6432)
- Fix small screen filters panel opening [pull/6420](https://github.com/sourcegraph/cody/pull/6420)
- fix diff rendering for auto-edit [pull/6410](https://github.com/sourcegraph/cody/pull/6410)
- chore(agent): disable flaky test [pull/6429](https://github.com/sourcegraph/cody/pull/6429)
- fix: Prevent style leaks in cody web [pull/6427](https://github.com/sourcegraph/cody/pull/6427)
- chore(onebox/telemetry): add `billingMetadata` [pull/6426](https://github.com/sourcegraph/cody/pull/6426)
- fix(audoedit): fix renderer testing command [pull/6408](https://github.com/sourcegraph/cody/pull/6408)
- chore/release: Bump package version and update changelog for 1.52 [pull/6414](https://github.com/sourcegraph/cody/pull/6414)
- fix(logging): removed unecessary logging when requests are aborted [pull/6555](https://github.com/sourcegraph/cody/pull/6555)
- fix(network): removed dangling request handlers on network requests which could potentially cause memory leaks [pull/6555](https://github.com/sourcegraph/cody/pull/6555)

### Changed

- feat(prompt-editor): Add new ProseMirror-based implementation [pull/6272](https://github.com/sourcegraph/cody/pull/6272)
- refactor(user-menu): improve display of user menu [pull/6389](https://github.com/sourcegraph/cody/pull/6389)
- Use omnibox ff for intent detector [pull/6419](https://github.com/sourcegraph/cody/pull/6419)
- Enable repo boost for inactive editor [pull/6443](https://github.com/sourcegraph/cody/pull/6443)
- include symbol matches in search results [pull/6441](https://github.com/sourcegraph/cody/pull/6441)
- improved network logging with less verbose output [pull/6555](https://github.com/sourcegraph/cody/pull/6555)

## 1.54.0

### Added

- Auto Edit: recent edit based [pull/6383](https://github.com/sourcegraph/cody/pull/6383)
- Auto Edit: add heuristic to filter suggestion [pull/6396](https://github.com/sourcegraph/cody/pull/6396)
- Prompt Library: add keyboard nav for prompts library [pull/6388](https://github.com/sourcegraph/cody/pull/6388)
- Accounts: prevent PLG login methods for enterprise users [pull/6182](https://github.com/sourcegraph/cody/pull/6182)

### Fixed

- Omnibox: remove trailing spaces from extracted query [pull/6440](https://github.com/sourcegraph/cody/pull/6440)
- Cody Web: Fixes paper cuts for Cody Web 0.20.0 cut [pull/6412](https://github.com/sourcegraph/cody/pull/6412)
- Omnibox: Hide header labels in narrow chat [pull/6407](https://github.com/sourcegraph/cody/pull/6407)
- Prompt Library: Styling updates to prompt list [pull/6409](https://github.com/sourcegraph/cody/pull/6409)
- Omnibox: Do not focus editor when inserting/updating search results context [pull/6385](https://github.com/sourcegraph/cody/pull/6385)
- Webviews: Fix small screen filters panel opening & change sticky intent behaviour [pull/6434](https://github.com/sourcegraph/cody/pull/6434)
- Auto Edit: do not render removal decorations twice [pull/6405](https://github.com/sourcegraph/cody/pull/6405)
- Auto Edit: fix inline completion extraction when deletion [pull/6381](https://github.com/sourcegraph/cody/pull/6381)

### Changed

- Omnibox: Enable repo boost for inactive editor [pull/6444](https://github.com/sourcegraph/cody/pull/6444)
- Omnibox: include symbol matches in search results [pull/6442](https://github.com/sourcegraph/cody/pull/6442)
- Omnibox: Use omnibox ff for intent detector [pull/6421](https://github.com/sourcegraph/cody/pull/6421)
- Omnibox: boost current repo [pull/6402](https://github.com/sourcegraph/cody/pull/6402)
- Cody Web: Filters layout for Cody Web [pull/6382](https://github.com/sourcegraph/cody/pull/6382)
- Auto Edit: dismiss suggestions on selection change [pull/6406](https://github.com/sourcegraph/cody/pull/6406)
- Auto Edit: disable shrink suffix logic [pull/6398](https://github.com/sourcegraph/cody/pull/6398)

#### Tracing & Logging

- Telemetry: update `billingMetadata` [pull/6367](https://github.com/sourcegraph/cody/pull/6367)
- Omnibox: Collect telemetry [pull/6394](https://github.com/sourcegraph/cody/pull/6394)

## 1.52.0

### Added

### Fixed

### Changed

- disable command execution by default [pull/6296](https://github.com/sourcegraph/cody/pull/6296)

#### Tracing & Logging

- Remove legacy back-compat (#6265) [pull/6276](https://github.com/sourcegraph/cody/pull/6276)
- Adding Distributed Tracing and Smart Apply to cody [pull/6178](https://github.com/sourcegraph/cody/pull/6178)

### Experimental Features

- Deep Cody: remove setting Deep Cody as default model. [pull/6308](https://github.com/sourcegraph/cody/pull/6308)

## 1.50.0

### Added

- Webviews: add new CTA for Sourcegraph Teams [pull/6245](https://github.com/sourcegraph/cody/pull/6245)
- "Explain command" in context (existing conversation) [pull/5986](https://github.com/sourcegraph/cody/pull/5986)

### Fixed

- fix detecting the fireworks model [pull/6239](https://github.com/sourcegraph/cody/pull/6239)
- Fix prompt execution in existing chat [pull/6226](https://github.com/sourcegraph/cody/pull/6226)
- suppress emission of characters on emacs keybindings [pull/6210](https://github.com/sourcegraph/cody/pull/6210)
- use local storage to save repo accessibility [pull/6193](https://github.com/sourcegraph/cody/pull/6193)

### Experimental Features

- Deep Cody: wildcard should not be ignored in allow list for shell context [pull/6256](https://github.com/sourcegraph/cody/pull/6256)
- Deep Cody: loading message for context fetching step [pull/6241](https://github.com/sourcegraph/cody/pull/6241)
- Deep Cody: remove setting user model preferences [pull/6211](https://github.com/sourcegraph/cody/pull/6211)

### Changed

- Auth: new enterprise sign-in flow and improve auth UI [pull/6198](https://github.com/sourcegraph/cody/pull/6198)
- Make signout as non-blocking as possible [pull/6207](https://github.com/sourcegraph/cody/pull/6207)
- use chat client for s2 [pull/6219](https://github.com/sourcegraph/cody/pull/6219)

#### Tracing & Logging

- Telemetry support for Sourcegraph versions older than [5.2.5 (released 12/2023)](https://github.com/sourcegraph/sourcegraph-public-snapshot/releases/tag/v5.2.5) has been removed [pull/6265](https://github.com/sourcegraph/cody/pull/6265)
- Update tracing for chat [pull/6230](https://github.com/sourcegraph/cody/pull/6230)

#### Build & Release

- [Backport vscode-v1.50.x] fix(release): remove brackets around version number [pull/6311](https://github.com/sourcegraph/cody/pull/6311)
- chore/build: Merge sourcegraph/jetbrains into the Cody repo [pull/6247](https://github.com/sourcegraph/cody/pull/6247)
- Improve release process with slack notifications and automated branching [pull/6218](https://github.com/sourcegraph/cody/pull/6218)
- Add separate command to run cody web in standalone mode [pull/6227](https://github.com/sourcegraph/cody/pull/6227)
- Update changelog.sh instructions and add cody-core to backports [pull/6217](https://github.com/sourcegraph/cody/pull/6217)

## 1.48.1

### Added

### Fixed

- backport/vscode/1.48: chore(telemetry): remove legacy back-compat (#6265) [pull/6275](https://github.com/sourcegraph/cody/pull/6275)

### Changed

### Uncategorized

## 1.48.0

### Added

- Add account switcher component in the Accounts webview tab [pull/6159](https://github.com/sourcegraph/cody/pull/6159)
- Prompts Picker [pull/6160](https://github.com/sourcegraph/cody/pull/6160)
- Add Sourcegraph CLI installation description to README.md [pull/6170](https://github.com/sourcegraph/cody/pull/6170)
- Fetch standard prompts from remote prompts API [pull/6150](https://github.com/sourcegraph/cody/pull/6150)

#### Autoedits

- feat(autoedit): combine inline completion provider and selection change [pull/6147](https://github.com/sourcegraph/cody/pull/6147)
- feat(autoedit): use code completion feature for auto-edit [pull/6161](https://github.com/sourcegraph/cody/pull/6161)
- add 10 sec diff for auto-edit experiments [pull/6191](https://github.com/sourcegraph/cody/pull/6191)
- adding line level diff strategy for the recent edits diff calculation [pull/6188](https://github.com/sourcegraph/cody/pull/6188)
- Hitesh/add diff stratagies [pull/6190](https://github.com/sourcegraph/cody/pull/6190)
- Hitesh/add diff strategies logging [pull/6189](https://github.com/sourcegraph/cody/pull/6189)

### Fixed

- [Backport vscode-v1.48.x] Make signout as non-blocking as possible [pull/6213](https://github.com/sourcegraph/cody/pull/6213)
- do not block chat panel initialization or human message handling on current session save [pull/6186](https://github.com/sourcegraph/cody/pull/6186)
- patch highlight.js to address memory leak [pull/6146](https://github.com/sourcegraph/cody/pull/6146)
- fix(api): Set API identifying headers on all HTTP requests (CODY-4209) [pull/6102](https://github.com/sourcegraph/cody/pull/6102)

#### Autoedits

- feat(autoedit): fix cursor jumping issue [pull/6156](https://github.com/sourcegraph/cody/pull/6156)
- fix(autoedit): fix suffix matching logic [pull/6171](https://github.com/sourcegraph/cody/pull/6171)
- fix(audoedit): fix the scrollbar issue [pull/6158](https://github.com/sourcegraph/cody/pull/6158)
- fix added lines sorting in auto-edit [pull/6155](https://github.com/sourcegraph/cody/pull/6155)

### Changed

- Add default value for 'search.useIgnoreFiles' in agent config [pull/6202](https://github.com/sourcegraph/cody/pull/6202)
- Deep Cody: Move shell context behind feature flag [pull/6199](https://github.com/sourcegraph/cody/pull/6199)
- Add built-in prompts related fields to prompt select analytic event [pull/6180](https://github.com/sourcegraph/cody/pull/6180)

#### Autoedits

- feat(autoedit): restrict autoedit to vscode [pull/6184](https://github.com/sourcegraph/cody/pull/6184)
- chore(audoedit): test diff logic with different new line chars [pull/6176](https://github.com/sourcegraph/cody/pull/6176)
- chore(audoedit): simplify diff utils and renderer data structures [pull/6172](https://github.com/sourcegraph/cody/pull/6172)
- feat(autoedit): refactor renderer code to simplify iteration on decor… [pull/6163](https://github.com/sourcegraph/cody/pull/6163)

### Build & Test

- [Backport vscode-v1.48.x] remove last line in backport GHA [pull/6205](https://github.com/sourcegraph/cody/pull/6205)
- remove last line in backport GHA [pull/6204](https://github.com/sourcegraph/cody/pull/6204)
- add changelog templating and tooling [pull/6195](https://github.com/sourcegraph/cody/pull/6195)
- Bench: make sure to respect CODY_RECORDING_MODE [pull/6167](https://github.com/sourcegraph/cody/pull/6167)
- Revert "Update backport.yml (#6137)" [pull/6164](https://github.com/sourcegraph/cody/pull/6164)

## 1.46.0

### Added

### Fixed

### Changed

- Chat: Update keyboard shortcuts:
  - Removed `Shift+Ctrl+L` (previously created a new chat) due to conflict with Windows default shortcut
  - Updated `Shift+Alt+L` to create a new chat when the focus is not in the editor. When the focus is in the editor, the behavior remains unchanged (the current selection is added to the chat context).

### Uncategorized

- [Backport vscode-v1.46.x] Add built-in prompts related fields to prompt select analytic event [pull/6181](https://github.com/sourcegraph/cody/pull/6181)
- [Backport vscode-v1.46.x] Fetch standard prompts from remote prompts API [pull/6166](https://github.com/sourcegraph/cody/pull/6166)
- [Backport vscode-v1.46.x] Prompts Picker [pull/6168](https://github.com/sourcegraph/cody/pull/6168)
- [Backport vscode-v1.46.x] VS Code: Release v1.44.0 [pull/6169](https://github.com/sourcegraph/cody/pull/6169)
- feat(autoedit): fix cursor jumping issue [pull/6156](https://github.com/sourcegraph/cody/pull/6156)
- only activate auto-edit command when experimental setting is enabled [pull/6157](https://github.com/sourcegraph/cody/pull/6157)
- Chat: ensure ScrollDown button only takes it's width [pull/6143](https://github.com/sourcegraph/cody/pull/6143)
- autoedit: Add feature flag to enable/disable autoedit feature [pull/6145](https://github.com/sourcegraph/cody/pull/6145)
- remove ctrl+shift+L shortcut and update shift+alt+L shortcut [pull/6148](https://github.com/sourcegraph/cody/pull/6148)
- Fix various JetBrains styling issues [pull/6153](https://github.com/sourcegraph/cody/pull/6153)
- Autoedits Context Improvements [pull/6141](https://github.com/sourcegraph/cody/pull/6141)
- Better rendering for auto-edit [pull/6132](https://github.com/sourcegraph/cody/pull/6132)
- Chat: context cell improvements [pull/6115](https://github.com/sourcegraph/cody/pull/6115)
- Fix inline-edit prompts chat building [pull/6003](https://github.com/sourcegraph/cody/pull/6003)
- Cody Web: Polish cody web Prompts [pull/6135](https://github.com/sourcegraph/cody/pull/6135)
- Simplify protocol's TelemetryEvent [pull/6144](https://github.com/sourcegraph/cody/pull/6144)
- Use font size variable providd by JetBrains in webview [pull/6134](https://github.com/sourcegraph/cody/pull/6134)
- Update backport.yml [pull/6137](https://github.com/sourcegraph/cody/pull/6137)
- fix(release): Update backport action to override team_reviews [pull/6136](https://github.com/sourcegraph/cody/pull/6136)
- autoedit: add speculative decoding [pull/6130](https://github.com/sourcegraph/cody/pull/6130)
- Fix for VSCode Marketplace description getting cut-off [pull/6098](https://github.com/sourcegraph/cody/pull/6098)
- Fix prompt name generation during prompts/commands migration [pull/6126](https://github.com/sourcegraph/cody/pull/6126)

## 1.44.0

### Added

### Fixed

### Changed

### Uncategorized

- Network: CA Cert loading fixes [pull/6101](https://github.com/sourcegraph/cody/pull/6101)
- feat(rel): add backport workflow [pull/6119](https://github.com/sourcegraph/cody/pull/6119)
- Cody Chat: fixed missing syntax highlighting of CSharp files and load only one copy of highlight.js in the WebView build [pull/6118](https://github.com/sourcegraph/cody/pull/6118)
- fix rendering issue on the same line for ghost text [pull/6120](https://github.com/sourcegraph/cody/pull/6120)
- chat input: '@' -> '@ Context' toolbar button [pull/6114](https://github.com/sourcegraph/cody/pull/6114)
- feat(edit): enable predicted outputs for gpt-4o models [pull/6116](https://github.com/sourcegraph/cody/pull/6116)
- Edit: prep for the gpt-4o-mini edit a/b test [pull/6110](https://github.com/sourcegraph/cody/pull/6110)
- Trigger autoedit on the cursor movements [pull/6112](https://github.com/sourcegraph/cody/pull/6112)
- Remove old test renderer [pull/6113](https://github.com/sourcegraph/cody/pull/6113)
- Add a command for testing auto-edit examples [pull/6108](https://github.com/sourcegraph/cody/pull/6108)
- Chat: brought back syntax highlighting for most common languages [pull/5953](https://github.com/sourcegraph/cody/pull/5953)
- Chat: brought back syntax highlighting for most common languages [pull/5874](https://github.com/sourcegraph/cody/pull/5874)
- Add a command for testing auto-edit examples [pull/6108](https://github.com/sourcegraph/cody/pull/6108)
- Fail hard on errors in input context bench CSV, remove unused column [pull/6107](https://github.com/sourcegraph/cody/pull/6107)
- Add more detailed results to context benchmark [pull/5992](https://github.com/sourcegraph/cody/pull/5992)
- Edit: collect more analytics data [pull/6095](https://github.com/sourcegraph/cody/pull/6095)
- fix indentation issue [pull/6103](https://github.com/sourcegraph/cody/pull/6103)
- Cody Web: Add support running prompts from consumer [pull/6081](https://github.com/sourcegraph/cody/pull/6081)
- fix recent edits context source [pull/6071](https://github.com/sourcegraph/cody/pull/6071)
- Hitesh/auto-edit improvements [pull/5956](https://github.com/sourcegraph/cody/pull/5956)
- Agent: disable the flaky edit test [pull/6093](https://github.com/sourcegraph/cody/pull/6093)
- VS Code: point releases to `./vscode/changelog.md` [pull/6080](https://github.com/sourcegraph/cody/pull/6080)
- Fix issue with merging configs [pull/6084](https://github.com/sourcegraph/cody/pull/6084)
- Deep Cody: skip query rewrite for search tool [pull/6082](https://github.com/sourcegraph/cody/pull/6082)
- chore/build: VSCode Insiders builds are manually triggered and automatically tagged [pull/6083](https://github.com/sourcegraph/cody/pull/6083)
- Deep Cody: remove TOOL context item after review [pull/6079](https://github.com/sourcegraph/cody/pull/6079)

## 1.42.0

Hey Cody users! For those who want to track detailed technical changes, we will be updating this changelog to provide more comprehensive updates on new features, improvements, and fixes. For major releases and announcements, check out our [public changelog](https://sourcegraph.com/changelog).

### Added

- Autocomplete: Enabled completions preloading on cursor movement. [pull/6043](https://github.com/sourcegraph/cody/pull/6043)
- Telemetry: Added `cody.debug.logCharacterCounters` for debugging. [pull/6057](https://github.com/sourcegraph/cody/pull/6057)

### Fixed

- Chat: This patch updates the chat keyboard shortcuts to be as follows, thereby avoiding the tendency to "double-add" a code snippet when using the `alt+L` shortcut:
  - `Alt+L`: between chat and editor (this is unchanged)
  - `Shift+Alt+L` (previously alt+L): add selection as context:
  - `Shift+Ctrl+L` (previously shift+alt+L): new chat
- Markdown files were not bundled in the VSIX leading to onboarding views not displaying or showing an error.
- Ensured that a correct http/https agent is loaded depending on endpoint protocol and that secureConnection correclty passes CA certs via [hpagent](https://github.com/delvedor/hpagent)

### Changed

- Networking: In addition to Node and user configured manual CA certs, we now automatically attempt to load CA certs in your system's trust store. This is done using [rustls](https://github.com/rustls/rustls) via a new [napi-rs](https://napi.rs/) library `lib/noxide`. This behaviour is enabled by default but can be diasabled by setting the `experimental.noxide.enabled` to `false` in your settings. Any issues loading the library will be logged to the usual error output channels and we will fallback to the previous behaviour. This will replace the previous method of loading system CA certs using shell commands or bundled executables such as `win-ca.exe`.

### Uncategorized

- Fix issue with merging configs [pull/6084](https://github.com/sourcegraph/cody/pull/6084)
- chore/build: VSCode Insiders builds are manually triggered and automatically tagged [pull/6083](https://github.com/sourcegraph/cody/pull/6083)
- Add Deep Cody back to model list, revert button change [pull/6077](https://github.com/sourcegraph/cody/pull/6077)
- Fix configuration inspect method [pull/6075](https://github.com/sourcegraph/cody/pull/6075)
- Improve Cody logging agent protocol [pull/6069](https://github.com/sourcegraph/cody/pull/6069)
- Ensure CompletionBookkeepingEvent timestamps are not floating point [pull/6073](https://github.com/sourcegraph/cody/pull/6073)
- VS Code: Release v1.40.2 [pull/6062](https://github.com/sourcegraph/cody/pull/6062)
- Autocomplete: remove the extended language pool option [pull/6072](https://github.com/sourcegraph/cody/pull/6072)
- Deep Cody: Allow toggle in UI & implement CodyChatMemory [pull/6066](https://github.com/sourcegraph/cody/pull/6066)
- Autocomplete: add characters logger metadata to `accepted` events [pull/6068](https://github.com/sourcegraph/cody/pull/6068)
- fix: rewrite symf query only once [pull/6070](https://github.com/sourcegraph/cody/pull/6070)
- Run prompts migration only over local user commands [pull/6056](https://github.com/sourcegraph/cody/pull/6056)
- Context: make error message more concise [pull/6065](https://github.com/sourcegraph/cody/pull/6065)
- prevent double-adding selected context [pull/6059](https://github.com/sourcegraph/cody/pull/6059)
- Fix bugs in workspace::getConfiguration vscode shim [pull/6058](https://github.com/sourcegraph/cody/pull/6058)
- Autocomplete: deflake hot-streak tests [pull/6040](https://github.com/sourcegraph/cody/pull/6040)
- Remove repo chip from default context (feature flagged) [pull/6034](https://github.com/sourcegraph/cody/pull/6034)
- update insider cron schedule to MWF @ 1500 UTC [pull/6052](https://github.com/sourcegraph/cody/pull/6052)
- VS Code: Release v1.40.1 [pull/6051](https://github.com/sourcegraph/cody/pull/6051)
- Auth: UI conditional rendering logic [pull/6047](https://github.com/sourcegraph/cody/pull/6047)
- Change nested configuration object handling to match VSCode behavior. [pull/6041](https://github.com/sourcegraph/cody/pull/6041)
- Update marketplace description [pull/6046](https://github.com/sourcegraph/cody/pull/6046)
- Fix OpenCtx include initial context integeration. [pull/6045](https://github.com/sourcegraph/cody/pull/6045)
- Network: Fallback to CODY_NODE_TLS_REJECT_UNAUTHORIZED for cert auth [pull/6037](https://github.com/sourcegraph/cody/pull/6037)
- Autocomplete: cleanup the fast-path a/b test [pull/6039](https://github.com/sourcegraph/cody/pull/6039)
- fix(ci): Increase test timeout for uninstall test [pull/6038](https://github.com/sourcegraph/cody/pull/6038)
- Fix Prompts welcome screen initial state [pull/6036](https://github.com/sourcegraph/cody/pull/6036)
- VS Code: add characters logger metadata to chat code-gen events [pull/6019](https://github.com/sourcegraph/cody/pull/6019)

## 1.40.2

### Fixed

- Agent: Fixed bugs in `workspace::getConfiguration` vscode shim [pull/6058](https://github.com/sourcegraph/cody/pull/6058)

## 1.40.1

### Fixed

- Auth: Fixed UI conditional rendering logic for non VS Code clients. [pull/6047](https://github.com/sourcegraph/cody/pull/6047)

## 1.40.0

### Added

- Proxy: Support for `cody.net.proxy` settings that enable configuation a cody specific proxy server. This also supports `cody.net.proxy.path` to provide a UNIX domain socket directly. [pull/5883](https://github.com/sourcegraph/cody/pull/5883)

### Fixed

- Context Filters: fixed repo name resolution cache. [pull/5978](https://github.com/sourcegraph/cody/pull/5978)

### Uncategorized

- Fix support for merging multiple nested objects [pull/6029](https://github.com/sourcegraph/cody/pull/6029)
- Change tip text to reflect new key command [pull/6030](https://github.com/sourcegraph/cody/pull/6030)
- add code llama model for the a/b test [pull/6022](https://github.com/sourcegraph/cody/pull/6022)
- Add new custom configuration field which supports dotted names [pull/6027](https://github.com/sourcegraph/cody/pull/6027)
- Add shortcut for recently used prompts [pull/6016](https://github.com/sourcegraph/cody/pull/6016)
- Use simplified token counting method in case of the big files [pull/6014](https://github.com/sourcegraph/cody/pull/6014)
- fix: Change chat input placeholder text [pull/6011](https://github.com/sourcegraph/cody/pull/6011)
- Reduce padding of container around search input. [pull/5778](https://github.com/sourcegraph/cody/pull/5778)
- VS Code: add characters logger stats to `fixup.apply:succeeded` events [pull/6009](https://github.com/sourcegraph/cody/pull/6009)
- Don't select first prompt by default [pull/6015](https://github.com/sourcegraph/cody/pull/6015)
- fix(chat): Hide insert and new file buttons if there is no `edit` capability [pull/6018](https://github.com/sourcegraph/cody/pull/6018)
- bump openctx to incorporate HTTP provider invocation [pull/6010](https://github.com/sourcegraph/cody/pull/6010)
- Promisify PromptEditorRefAPI [pull/6006](https://github.com/sourcegraph/cody/pull/6006)

## 1.38.3

### Fixed

- Autocomplete: Fix the feature flag used for the fast-path A/B test. [pull/5998](https://github.com/sourcegraph/cody/pull/5998)

## 1.38.2

### Changed

- Telemetry: Account for visible ranges in the characters logger. [pull/5931](https://github.com/sourcegraph/cody/pull/5931)

### Fixed

- Chat: Improved handling of duplicated priority context items. [pull/5860](https://github.com/sourcegraph/cody/pull/5860)
- Chat: Improved handling of duplicated priority context items. [pull/5860](https://github.com/sourcegraph/cody/pull/5860)

### Changed

- Network: Changed configuration of network libraries to better support VSCode's patching of `http` and `https` modules. Also disabled the use of `keep-alive` headers until more robust testing is in place around VSCode's ongoing network changes. No performance changes are expected as the previous use of `keep-alive` didn't properly create re-usable connections.

## 1.38.1

### Changed

- Telemetry: Add document change reasons to characters logger. [pull/5855](https://github.com/sourcegraph/cody/pull/5855)
- Autocomplete: Prepare for the fast-path and completion-preloading A/B tests. [pull/5905](https://github.com/sourcegraph/cody/pull/5905)

## 1.38.0

### Fixed

- Chat: Improve webview performance in long chats. [pull/5866](https://github.com/sourcegraph/cody/pull/5866), [pull/5875](https://github.com/sourcegraph/cody/pull/5875), [pull/5879](https://github.com/sourcegraph/cody/pull/5879)

- Autocomplete: Remove support for the deprecated `experimental-openaicompatible` provider. Use `openaicompatible` instead. [pull/5872](https://github.com/sourcegraph/cody/pull/5872)

## 1.36.3

### Added

- Autocomplete: re-enable the agent tests. [pull/5784](https://github.com/sourcegraph/cody/pull/5784)
- Autocomplete: Using the current document instead of precalculated text to get insertion text. [pull/5812](https://github.com/sourcegraph/cody/pull/5812)

## 1.36.2

### Added

- Autocomplete: Change the feature flag names for experiment to prevent older client quering deprecated models. [pull/5805](https://github.com/sourcegraph/cody/pull/5805)

### Fixed

- Chat: Fix an issue in repository name resolution for workspaces that caused Chat to hang. [pull/5808](https://github.com/sourcegraph/cody/pull/5808)

## 1.36.1

### Fixed

- Autocomplete: The PR fixes the slowness in vscode because because of completions by using local cache instead of querying vscode localStorage. [pull/5798](https://github.com/sourcegraph/cody/pull/5798)
- Sourcegraph API GraphQL: Increase the default timeout from 6sec to 20sec. [pull/5789](https://github.com/sourcegraph/cody/pull/5789)

## 1.36.0

### Added

- The [new OpenAI models (OpenAI o1-preview & OpenAI o1-mini)](https://sourcegraph.com/blog/openai-o1-for-cody) are now available to selected Cody Pro users for early access. [pull/5508](https://github.com/sourcegraph/cody/pull/5508)
- Cody Pro users can join the waitlist for the new models by clicking the "Join Waitlist" button. [pull/5508](https://github.com/sourcegraph/cody/pull/5508)
- Chat: Support non-streaming requests. [pull/5565](https://github.com/sourcegraph/cody/pull/5565)
- Chat: Ability to execute terminal commands generated by Cody directly from the chat interface on button click. [pull/5684](https://github.com/sourcegraph/cody/pull/5684)

### Fixed

- Chat: Fixed feedback buttons not working in chat. [pull/5509](https://github.com/sourcegraph/cody/pull/5509)
- Command: Removed duplicated default commands from the Cody Commands menu that were incorrectly listed as custom commands.
- Enterprise: Smart context window is now correctly set for all Claude Sonnet models configured on the server side. [pull/5677](https://github.com/sourcegraph/cody/pull/5677)
- Chat: Display the correct loading state during codebase context retrieval instead of 0 item by default. [pull/5761](https://github.com/sourcegraph/cody/pull/5761)

### Changed

- Enterprise: Remote Repository items in the mention menu now display only the org/repo part of the title, omitting the code host name to prevent repository names from being truncated in the UI. [pull/5518](https://github.com/sourcegraph/cody/pull/5518)
- Cody Ignore: This internal experimental feature is now deprecated and the use of `.cody/ignore` file is no longer supported. [pull/5537](https://github.com/sourcegraph/cody/pull/5537)
- Autocomplete: removed the `cody.autocomplete.advanced.model` setting and updated supported values for `cody.autocomplete.advanced.provider`.

## 1.34.3

### Fixed

- Autocomplete Logging: Fix the diff for recent edits by replacing psDedent with ps to preserve the indentation. [pull/5574](https://github.com/sourcegraph/cody/pull/5574)

## 1.34.2

### Fixed

- Autocomplete Logging: The PR fixes the contextCandidates logged in the inlineCompletionItemContext. [pull/5507](https://github.com/sourcegraph/cody/pull/5507)

## 1.34.1

### Added

### Fixed

- Cody Ignore: Fixed an issue where Cody would treat Notebook cells as ignored files when .cody/ignore is enabled. [pull/5473](https://github.com/sourcegraph/cody/pull/5473)
- Command: Fixed the `Generate Commit Message` command on Windows caused by file path. [pull/5483](https://github.com/sourcegraph/cody/pull/5483)
- Dev: Fixed an issue where incorrect request parameters caused stream requests to fail when using BYOK OpenAI-compatible models. [pull/5490](https://github.com/sourcegraph/cody/pull/5490)

### Changed

## 1.34.0

### Added

### Fixed

- Command: Fixed an issue where the experimental `Generate Commit Message` command would fail on Windows due to incorrect parsing of the git diff output. [pull/5449](https://github.com/sourcegraph/cody/pull/5449)
- Chat: Model list now shows the correct icon based on the model provider. [pull/5469](https://github.com/sourcegraph/cody/pull/5469)
- Chat: Fixed an issue where local models were duplicated in the model list. [pull/5469](https://github.com/sourcegraph/cody/pull/5469)

### Changed

- Edit: Implemented cursor feedback for Generate Tests and Document Code commands to improve user experience by indicating command execution. [pull/5341](https://github.com/sourcegraph/cody/pull/5341)
- Dev: Added support for configurable "options" field in locally configured LLM providers, available behind the `cody.dev.models` setting. [pull/5467](https://github.com/sourcegraph/cody/pull/5467)
- Autocomplete Trigger Delay: Introduced a configurable setting to add a delay before returning autocomplete results, enhancing user control over completion suggestion timing. [pull/5350](https://github.com/sourcegraph/cody/pull/5350)

## 1.32.5

### Fixed

- Autocomplete: Fix autocomplete character trimming from hot-streak. [pull/5378](https://github.com/sourcegraph/cody/pull/5378)
- Autocomplete: Fix anthropic model for PLG users. [pull/5380](https://github.com/sourcegraph/cody/pull/5380)
- Chat: Adjust context windows for Mistral models configured in the site config. [pull/5434](https://github.com/sourcegraph/cody/pull/5434)

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
