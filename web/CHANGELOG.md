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
