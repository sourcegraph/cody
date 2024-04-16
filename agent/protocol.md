# Cody Agent

The Cody Agent is a JSON-RPC based protocol that allows clients written in any
programming language to interact with Cody. The Cody Agent currently powers the
JetBrains and Neovim plugins so it supports the full breadth of features that
are available in those plugins, including autocomplete, chat, chat-based
commands, and edit-based commands.

## Base protocol

[JSON-RPC](https://www.jsonrpc.org) is a specification that enables two
processes runningu to communicate with each other using JSON via stdout/stdin or
IPC sockets. The Cody Agent currently only supports communication via
stdin/stdout.

In simplified terms, JSON-RPC works like the following:

* A JSON-RPC protocol is a list of *methods*
* A *method* has a string name like `'textDocument/initialize'` or `'initialize'`
* A *method* can either be a *request* or a *notification*
* A *request* must be paired with a *response*
* A *notification* method must not be matched with a response
* Both the server and the client can send a request or a notification

At a low-level, the Cody Agent uses the exact same flavor of JSON-RPC as the Language Server
Protocol (LSP) does.  The full specification for this flavor of JSON-RPC is
documented on the [LSP
website](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol).

While we conventionally refer to the Cody agent as being the "server", it's
worth noting that JSON-RPC allows the server to initiate requests and
notifications. This attribute makes JSON-RPC a peer-to-peer architecture, more
than a traditional client/server architecture for other RPC systems (including
HTTP).


## Protocol methods

<!-- PROTOCOL START -->
<h2 id="initialize"><a href="#initialize" name="initialize"><code>initialize</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
initialize: [ClientInfo, ServerInfo]
```
<h2 id="shutdown"><a href="#shutdown" name="shutdown"><code>shutdown</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
shutdown: [null, null]
```
<h2 id="chat_new"><a href="#chat_new" name="chat_new"><code>chat/new</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/new': [null, string]
```
<h2 id="chat_restore"><a href="#chat_restore" name="chat_restore"><code>chat/restore</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/restore': [{ modelID: string; messages: ChatMessage[]; chatID: string; }, string]
```
<h2 id="chat_models"><a href="#chat_models" name="chat_models"><code>chat/models</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/models': [{ id: string; }, { models: ModelProvider[]; }]
```
<h2 id="chat_remoteRepos"><a href="#chat_remoteRepos" name="chat_remoteRepos"><code>chat/remoteRepos</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/remoteRepos': [{ id: string; }, { remoteRepos?: Repo[] | undefined; }]
```
<h2 id="chat_submitMessage"><a href="#chat_submitMessage" name="chat_submitMessage"><code>chat/submitMessage</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/submitMessage': [{ id: string; message: WebviewMessage; }, ExtensionMessage]
```
<h2 id="chat_editMessage"><a href="#chat_editMessage" name="chat_editMessage"><code>chat/editMessage</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'chat/editMessage': [{ id: string; message: WebviewMessage; }, ExtensionMessage]
```
<h2 id="commands_explain"><a href="#commands_explain" name="commands_explain"><code>commands/explain</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'commands/explain': [null, string]
```
<h2 id="commands_test"><a href="#commands_test" name="commands_test"><code>commands/test</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'commands/test': [null, string]
```
<h2 id="commands_smell"><a href="#commands_smell" name="commands_smell"><code>commands/smell</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'commands/smell': [null, string]
```
<h2 id="commands_custom"><a href="#commands_custom" name="commands_custom"><code>commands/custom</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'commands/custom': [{ key: string; }, CustomCommandResult]
```
<h2 id="editCommands_test"><a href="#editCommands_test" name="editCommands_test"><code>editCommands/test</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'editCommands/test': [null, EditTask]
```
<h2 id="commands_document"><a href="#commands_document" name="commands_document"><code>commands/document</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'commands/document': [null, EditTask]
```
<h2 id="command_execute"><a href="#command_execute" name="command_execute"><code>command/execute</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'command/execute': [ExecuteCommandParams, any]
```
<h2 id="autocomplete_execute"><a href="#autocomplete_execute" name="autocomplete_execute"><code>autocomplete/execute</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'autocomplete/execute': [AutocompleteParams, AutocompleteResult]
```
<h2 id="graphql_getRepoIds"><a href="#graphql_getRepoIds" name="graphql_getRepoIds"><code>graphql/getRepoIds</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/getRepoIds': [{ names: string[]; first: number; }, { repos: { name: string; id: string; }[]; }]
```
<h2 id="graphql_currentUserId"><a href="#graphql_currentUserId" name="graphql_currentUserId"><code>graphql/currentUserId</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/currentUserId': [null, string]
```
<h2 id="graphql_currentUserIsPro"><a href="#graphql_currentUserIsPro" name="graphql_currentUserIsPro"><code>graphql/currentUserIsPro</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/currentUserIsPro': [null, boolean]
```
<h2 id="featureFlags_getFeatureFlag"><a href="#featureFlags_getFeatureFlag" name="featureFlags_getFeatureFlag"><code>featureFlags/getFeatureFlag</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'featureFlags/getFeatureFlag': [{ flagName: string; }, boolean | null]
```
<h2 id="graphql_getCurrentUserCodySubscription"><a href="#graphql_getCurrentUserCodySubscription" name="graphql_getCurrentUserCodySubscription"><code>graphql/getCurrentUserCodySubscription</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/getCurrentUserCodySubscription': [null, CurrentUserCodySubscription | null]
```
<h2 id="graphql_logEvent"><a href="#graphql_logEvent" name="graphql_logEvent"><code>graphql/logEvent</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/logEvent': [event, null]
```
<h2 id="telemetry_recordEvent"><a href="#telemetry_recordEvent" name="telemetry_recordEvent"><code>telemetry/recordEvent</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>
<p>Description: Record telemetry events.</p>

```ts
'telemetry/recordEvent': [TelemetryEvent, null]
```
<h2 id="graphql_getRepoIdIfEmbeddingExists"><a href="#graphql_getRepoIdIfEmbeddingExists" name="graphql_getRepoIdIfEmbeddingExists"><code>graphql/getRepoIdIfEmbeddingExists</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/getRepoIdIfEmbeddingExists': [{ repoName: string; }, string | null]
```
<h2 id="graphql_getRepoId"><a href="#graphql_getRepoId" name="graphql_getRepoId"><code>graphql/getRepoId</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'graphql/getRepoId': [{ repoName: string; }, string | null]
```
<h2 id="check_isCodyIgnoredFile"><a href="#check_isCodyIgnoredFile" name="check_isCodyIgnoredFile"><code>check/isCodyIgnoredFile</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>
<p>Description: Checks if a given set of URLs includes a Cody ignored file.</p>

```ts
'check/isCodyIgnoredFile': [{ urls: string[]; }, boolean]
```
<h2 id="git_codebaseName"><a href="#git_codebaseName" name="git_codebaseName"><code>git/codebaseName</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'git/codebaseName': [{ url: string; }, string | null]
```
<h2 id="webview_didDispose"><a href="#webview_didDispose" name="webview_didDispose"><code>webview/didDispose</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'webview/didDispose': [{ id: string; }, null]
```
<h2 id="webview_receiveMessage"><a href="#webview_receiveMessage" name="webview_receiveMessage"><code>webview/receiveMessage</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'webview/receiveMessage': [{ id: string; message: WebviewMessage; }, null]
```
<h2 id="testing_progress"><a href="#testing_progress" name="testing_progress"><code>testing/progress</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'testing/progress': [{ title: string; }, { result: string; }]
```
<h2 id="testing_networkRequests"><a href="#testing_networkRequests" name="testing_networkRequests"><code>testing/networkRequests</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'testing/networkRequests': [null, { requests: NetworkRequest[]; }]
```
<h2 id="testing_requestErrors"><a href="#testing_requestErrors" name="testing_requestErrors"><code>testing/requestErrors</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'testing/requestErrors': [null, { errors: NetworkRequest[]; }]
```
<h2 id="testing_progressCancelation"><a href="#testing_progressCancelation" name="testing_progressCancelation"><code>testing/progressCancelation</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'testing/progressCancelation': [{ title: string; }, { result: string; }]
```
<h2 id="testing_reset"><a href="#testing_reset" name="testing_reset"><code>testing/reset</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'testing/reset': [null, null]
```
<h2 id="extensionConfiguration_change"><a href="#extensionConfiguration_change" name="extensionConfiguration_change"><code>extensionConfiguration/change</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'extensionConfiguration/change': [ExtensionConfiguration, AuthStatus | null]
```
<h2 id="extensionConfiguration_status"><a href="#extensionConfiguration_status" name="extensionConfiguration_status"><code>extensionConfiguration/status</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'extensionConfiguration/status': [null, AuthStatus | null]
```
<h2 id="attribution_search"><a href="#attribution_search" name="attribution_search"><code>attribution/search</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the client to client server.</p>


```ts
'attribution/search': [{ id: string; snippet: string; }, { error: string | null; repoNames: string[]; limitHit: boolean; }]
```
<h2 id="initialized"><a href="#initialized" name="initialized"><code>initialized</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
initialized: [null]
```
<h2 id="exit"><a href="#exit" name="exit"><code>exit</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
exit: [null]
```
<h2 id="extensionConfiguration_didChange"><a href="#extensionConfiguration_didChange" name="extensionConfiguration_didChange"><code>extensionConfiguration/didChange</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'extensionConfiguration/didChange': [ExtensionConfiguration]
```
<h2 id="textDocument_didOpen"><a href="#textDocument_didOpen" name="textDocument_didOpen"><code>textDocument/didOpen</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'textDocument/didOpen': [ProtocolTextDocument]
```
<h2 id="textDocument_didChange"><a href="#textDocument_didChange" name="textDocument_didChange"><code>textDocument/didChange</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'textDocument/didChange': [ProtocolTextDocument]
```
<h2 id="textDocument_didFocus"><a href="#textDocument_didFocus" name="textDocument_didFocus"><code>textDocument/didFocus</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'textDocument/didFocus': [{ uri: string; }]
```
<h2 id="textDocument_didSave"><a href="#textDocument_didSave" name="textDocument_didSave"><code>textDocument/didSave</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'textDocument/didSave': [{ uri: string; }]
```
<h2 id="textDocument_didClose"><a href="#textDocument_didClose" name="textDocument_didClose"><code>textDocument/didClose</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'textDocument/didClose': [ProtocolTextDocument]
```
<h2 id="workspace_didDeleteFiles"><a href="#workspace_didDeleteFiles" name="workspace_didDeleteFiles"><code>workspace/didDeleteFiles</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'workspace/didDeleteFiles': [DeleteFilesParams]
```
<h2 id="workspace_didCreateFiles"><a href="#workspace_didCreateFiles" name="workspace_didCreateFiles"><code>workspace/didCreateFiles</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'workspace/didCreateFiles': [CreateFilesParams]
```
<h2 id="workspace_didRenameFiles"><a href="#workspace_didRenameFiles" name="workspace_didRenameFiles"><code>workspace/didRenameFiles</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'workspace/didRenameFiles': [RenameFilesParams]
```
<h2 id="cancelRequest"><a href="#cancelRequest" name="cancelRequest"><code>$/cancelRequest</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'$/cancelRequest': [CancelParams]
```
<h2 id="autocomplete_clearLastCandidate"><a href="#autocomplete_clearLastCandidate" name="autocomplete_clearLastCandidate"><code>autocomplete/clearLastCandidate</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'autocomplete/clearLastCandidate': [null]
```
<h2 id="autocomplete_completionSuggested"><a href="#autocomplete_completionSuggested" name="autocomplete_completionSuggested"><code>autocomplete/completionSuggested</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'autocomplete/completionSuggested': [CompletionItemParams]
```
<h2 id="autocomplete_completionAccepted"><a href="#autocomplete_completionAccepted" name="autocomplete_completionAccepted"><code>autocomplete/completionAccepted</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'autocomplete/completionAccepted': [CompletionItemParams]
```
<h2 id="progress_cancel"><a href="#progress_cancel" name="progress_cancel"><code>progress/cancel</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the client to client server.</p>


```ts
'progress/cancel': [{ id: string; }]
```
<h2 id="window_showMessage"><a href="#window_showMessage" name="window_showMessage"><code>window/showMessage</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'window/showMessage': [ShowWindowMessageParams, string | null]
```
<h2 id="textDocument_edit"><a href="#textDocument_edit" name="textDocument_edit"><code>textDocument/edit</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'textDocument/edit': [TextDocumentEditParams, boolean]
```
<h2 id="textDocument_openUntitledDocument"><a href="#textDocument_openUntitledDocument" name="textDocument_openUntitledDocument"><code>textDocument/openUntitledDocument</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'textDocument/openUntitledDocument': [UntitledTextDocument, boolean]
```
<h2 id="textDocument_show"><a href="#textDocument_show" name="textDocument_show"><code>textDocument/show</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'textDocument/show': [{ uri: string; options?: TextDocumentShowOptions | undefined; }, boolean]
```
<h2 id="workspace_edit"><a href="#workspace_edit" name="workspace_edit"><code>workspace/edit</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'workspace/edit': [WorkspaceEditParams, boolean]
```
<h2 id="webview_create"><a href="#webview_create" name="webview_create"><code>webview/create</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Request sent from the server to the client.</p>


```ts
'webview/create': [{ id: string; data: any; }, null]
```
<h2 id="debug_message"><a href="#debug_message" name="debug_message"><code>debug/message</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'debug/message': [DebugMessage]
```
<h2 id="editTaskState_didChange"><a href="#editTaskState_didChange" name="editTaskState_didChange"><code>editTaskState/didChange</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'editTaskState/didChange': [EditTask]
```
<h2 id="codeLenses_display"><a href="#codeLenses_display" name="codeLenses_display"><code>codeLenses/display</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'codeLenses/display': [DisplayCodeLensParams]
```
<h2 id="webview_postMessage"><a href="#webview_postMessage" name="webview_postMessage"><code>webview/postMessage</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'webview/postMessage': [WebviewPostMessageParams]
```
<h2 id="progress_start"><a href="#progress_start" name="progress_start"><code>progress/start</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'progress/start': [ProgressStartParams]
```
<h2 id="progress_report"><a href="#progress_report" name="progress_report"><code>progress/report</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'progress/report': [ProgressReportParams]
```
<h2 id="progress_end"><a href="#progress_end" name="progress_end"><code>progress/end</code> (<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">)</a></h2>
<p>Notification sent from the server to the client.</p>


```ts
'progress/end': [{ id: string; }]

```ts
'remoteRepo/*: ...'
```

Methods and notifications related to a remote list of repositories. Only for enterprise configurations. See [agent-protocol.ts].

```
<!-- PROTOCOL END -->
