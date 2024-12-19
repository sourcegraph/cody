## 0.20.0 
- Fixes problem with popover UI
- Update banner UI

## 0.19.0 
- Fixes prompts tag keyboard navigation and spacings

## 0.18.0
- Add support for `cody.notices` banners in Cody Chat UI

## 0.17.0
- Fixes runtime error with `Symbol.dispose` in Firefox
- Hides Cody Panel debug state in production mode 

## 0.16.0 
- Fixes cody chat start up on empty local storage (new users run chat for the first time case), [Linear issue](https://linear.app/sourcegraph/issue/SRCH-1456/cody-chat-fails-with-unsupported-model-error) 

## 0.15.0
- Fixes problem with not working prompts when chat has some sent messages 

## 0.14.0
- Add prompts analytics over built-in prompts

## 0.13.0
- Fix openctx mention by mocking Cody Web workspace root
- Disable non-runnable prompts in Cody Web
- Fix prompt editor placeholder 

## 0.11.0
- Support an external API for Cody Panel functionality (now you can trigger running prompts outside of Cody Web component)

## 0.10.0
- Prompts UI update (new prompts list, tab and recent prompts popover)
- Improved performance by bypassing rpc messages hydration

## 0.9.0
- Big refactoring change around authorization (see [#5221](https://github.com/sourcegraph/cody/pull/5221))

## 0.8.3 
- Fixes critical problem with auth flow on clear index db storage [#5621](https://github.com/sourcegraph/cody/pull/5621)

## 0.8.2
- Adds wait-list for OpenAI-o1 & OpenAI-o1 mini [#5508](https://github.com/sourcegraph/cody/pull/5508)

## 0.8.1
- Fix leaking highlighted code matches styles

## 0.8.0
- Add support for Cody one-box search results

## 0.7.7 
- Revert "prompts and commands" new UI 

## 0.7.6
- The "Prompts" toolbar item in chat is no longer displayed. To use a prompt from the prompt library, select it from the list shown on the chat tab or prompts tab.

## 0.7.5 
- Improve tabs UI layout for Cody Web tabs configuration 
- Fix Safari not working cursor click on mention panel problem  

## 0.7.4 
- Fix tabs UI tooltips for small screens 

## 0.7.3 
- Increase toolbar text to 12px 
- Improve textbox layout (make it partially sticky)

## 0.7.2 
- Improve Tabs UI layout for mid-size and small container width

## 0.7.1
- Add support for built-in confirmation UI for actions like Clear Chat History

## 0.7.0
- Simplifies Cody Web Chat component (it requires now using only one root CodyWebChat component)
- Adds skeleton loading state to Cody Web Chat UI 

## 0.6.1
- Adds support for directory initial context (mention) 
- Changes target build to es modules 

## 0.6.0
- Changes API for initial context (now it supports only one repository as an initial context mention)
- Fixes problem with file and symbol mention search don't respect initial repository as a context

## 0.5.2 
- Improves repository mention result ordering (for repositories, files and directories mentions)

## 0.5.1
- Fixes problem with initial context can't be removed (lexical context item text node key problem)
- Fixes rendering toolbar for Cody Web
- Fixes styles around at-mention popover menu
- Fixes create new chat command for Cody Web

## 0.5.0 
- Improves bundle size 
- Now allows you to have lazily loaded modules within cody web agent web-worker
- Changes API in a way that you have to pass agent worker yourself from the consumer

## 0.4.0 
- Updates Cody Web UI components to the most recent Tabs UI version
- Makes it so that when you go to `/cody/chat` in Cody Web, it
  autofocuses the message input for a new chat

## 0.3.7
- Adds support for the full panel (not just chat) to the CodyWebPanel component (renamed from CodyWebChat).
- Sets experimental.noodle flag to false (default).

## 0.3.6
- Adds fix that chat UI doesn't include context repository as background 
source of context (uses only mention chips as a possible source of context files)

## 0.3.5
- Adds support for URL mentions
- Adds support for ref-like API in CodyWebChatProvider level

## 0.3.4 
- Adds support for remote file ranges  

## 0.3.3
- Disables Ollama local models fetching 

## 0.3.2
- Fixes mention providers fetching as we switch between chats 

## 0.3.1
- Improves debounce logic for context item suggestions 

## 0.3.0
- Rename package to @sourcegraph/cody-web 
- Fixes problem when cody agent publishes setConfigFeatures too early 

## 0.2.10
- Add better rendering memoization (fixes problem with long-history chats) 

## 0.2.9 
- Add support for custom headers in Rest API service
(fixes problem with fetching remote LLM models for Cody Web) 

## 0.2.8
- Adds new prop to set custom client telemetry name (telemetryClientName)

## 0.2.7
- Provide api to set custom headers for any network request in Cody Web (agent worker thread)

## 0.2.6
- Don't show model-select dropdown for enterprise users who don't have server-sent models enabled

## 0.2.5
- Don't send vscode-related init telemetry events 
- Fix enterprise LLM selector appearance checks for Cody Web 

## 0.2.4
- Fix Markdown links for cody web 

## 0.2.3
- Fixes remote repository context as you switch between chats
- Adds support for context ignore for remote repositories files
- Fixes link rendering in the mention menu/suggestion panel

## 0.2.1
- Fixes remote files and remote symbols files link

## 0.2.0

Initial release includes

- React chat UI components 
- OpenCtx mentions support
- Built-in remote context sources support (files and symbols)
