package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.AttributionSearchParams
import com.sourcegraph.cody.agent.protocol.AttributionSearchResponse
import com.sourcegraph.cody.agent.protocol.AutocompleteParams
import com.sourcegraph.cody.agent.protocol.AutocompleteResult
import com.sourcegraph.cody.agent.protocol.ChatHistoryResponse
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ChatRestoreParams
import com.sourcegraph.cody.agent.protocol.ChatSubmitMessageParams
import com.sourcegraph.cody.agent.protocol.ClientInfo
import com.sourcegraph.cody.agent.protocol.CompletionItemParams
import com.sourcegraph.cody.agent.protocol.CurrentUserCodySubscription
import com.sourcegraph.cody.agent.protocol.EditTask
import com.sourcegraph.cody.agent.protocol.Event
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag
import com.sourcegraph.cody.agent.protocol.GetFoldingRangeParams
import com.sourcegraph.cody.agent.protocol.GetFoldingRangeResult
import com.sourcegraph.cody.agent.protocol.GetRepoIdsParam
import com.sourcegraph.cody.agent.protocol.GetRepoIdsResponse
import com.sourcegraph.cody.agent.protocol.IgnorePolicySpec
import com.sourcegraph.cody.agent.protocol.IgnoreTestParams
import com.sourcegraph.cody.agent.protocol.IgnoreTestResponse
import com.sourcegraph.cody.agent.protocol.InlineEditParams
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.RemoteRepoHasParams
import com.sourcegraph.cody.agent.protocol.RemoteRepoHasResponse
import com.sourcegraph.cody.agent.protocol.RemoteRepoListParams
import com.sourcegraph.cody.agent.protocol.RemoteRepoListResponse
import com.sourcegraph.cody.agent.protocol.ServerInfo
import com.sourcegraph.cody.agent.protocol.TaskIdParam
import com.sourcegraph.cody.chat.ConnectionId
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

/**
 * Interface for the server-part of the Cody agent protocol. The implementation of this interface is
 * written in TypeScript in the file "cody/agent/src/agent.ts". The Eclipse LSP4J bindings create a
 * Java implementation of this interface by using a JVM-reflection feature called "Proxy", which
 * works similar to JavaScript Proxy.
 */
interface CodyAgentServer {
  // Requests
  @JsonRequest("initialize") fun initialize(clientInfo: ClientInfo): CompletableFuture<ServerInfo>

  @JsonRequest("shutdown") fun shutdown(): CompletableFuture<Void?>

  @JsonRequest("autocomplete/execute")
  fun autocompleteExecute(params: AutocompleteParams?): CompletableFuture<AutocompleteResult>

  @JsonRequest("graphql/logEvent") fun logEvent(event: Event): CompletableFuture<Void?>

  @JsonRequest("graphql/currentUserId") fun currentUserId(): CompletableFuture<String>

  @JsonRequest("graphql/getRepoIds")
  fun getRepoIds(repoName: GetRepoIdsParam): CompletableFuture<GetRepoIdsResponse>

  @JsonRequest("featureFlags/getFeatureFlag")
  fun evaluateFeatureFlag(flagName: GetFeatureFlag): CompletableFuture<Boolean?>

  @JsonRequest("graphql/currentUserIsPro") fun isCurrentUserPro(): CompletableFuture<Boolean>

  @JsonRequest("graphql/getCurrentUserCodySubscription")
  fun getCurrentUserCodySubscription(): CompletableFuture<CurrentUserCodySubscription?>

  // Notifications
  @JsonNotification("initialized") fun initialized()

  @JsonNotification("exit") fun exit()

  @JsonNotification("extensionConfiguration/didChange")
  fun configurationDidChange(document: ExtensionConfiguration)

  @JsonNotification("textDocument/didFocus")
  fun textDocumentDidFocus(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didOpen") fun textDocumentDidOpen(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didChange")
  fun textDocumentDidChange(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didClose")
  fun textDocumentDidClose(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didSave") fun textDocumentDidSave(document: ProtocolTextDocument)

  @JsonNotification("autocomplete/clearLastCandidate") fun autocompleteClearLastCandidate()

  @JsonNotification("autocomplete/completionSuggested")
  fun completionSuggested(logID: CompletionItemParams)

  @JsonNotification("autocomplete/completionAccepted")
  fun completionAccepted(logID: CompletionItemParams)

  @JsonRequest("webview/receiveMessage")
  fun webviewReceiveMessage(params: WebviewReceiveMessageParams): CompletableFuture<Any?>

  @JsonRequest("editTask/accept") fun acceptEditTask(params: TaskIdParam): CompletableFuture<Void?>

  @JsonRequest("editTask/undo") fun undoEditTask(params: TaskIdParam): CompletableFuture<Void?>

  @JsonRequest("editTask/cancel") fun cancelEditTask(params: TaskIdParam): CompletableFuture<Void?>

  @JsonRequest("editTask/getFoldingRanges")
  fun getFoldingRanges(params: GetFoldingRangeParams): CompletableFuture<GetFoldingRangeResult>

  @JsonRequest("command/execute")
  fun commandExecute(params: CommandExecuteParams): CompletableFuture<Any?>

  @JsonRequest("commands/explain") fun legacyCommandsExplain(): CompletableFuture<ConnectionId>

  @JsonRequest("commands/smell") fun legacyCommandsSmell(): CompletableFuture<ConnectionId>

  @JsonRequest("editCommands/document") fun commandsDocument(): CompletableFuture<EditTask>

  @JsonRequest("editCommands/code")
  fun commandsEdit(params: InlineEditParams): CompletableFuture<EditTask>

  @JsonRequest("editCommands/test") fun commandsTest(): CompletableFuture<EditTask>

  @JsonRequest("chat/new") fun chatNew(): CompletableFuture<String>

  @JsonRequest("chat/submitMessage")
  fun chatSubmitMessage(params: ChatSubmitMessageParams): CompletableFuture<ExtensionMessage>

  @JsonRequest("chat/models")
  fun chatModels(params: ChatModelsParams): CompletableFuture<ChatModelsResponse>

  @JsonRequest("chat/export") fun chatExport(): CompletableFuture<List<ChatHistoryResponse>>

  @JsonRequest("chat/restore")
  fun chatRestore(params: ChatRestoreParams): CompletableFuture<ConnectionId>

  @JsonRequest("attribution/search")
  fun attributionSearch(
      params: AttributionSearchParams
  ): CompletableFuture<AttributionSearchResponse>

  @JsonRequest("remoteRepo/has")
  fun remoteRepoHas(params: RemoteRepoHasParams): CompletableFuture<RemoteRepoHasResponse>

  @JsonRequest("remoteRepo/list")
  fun remoteRepoList(params: RemoteRepoListParams): CompletableFuture<RemoteRepoListResponse>

  @JsonRequest("ignore/test")
  fun ignoreTest(params: IgnoreTestParams): CompletableFuture<IgnoreTestResponse>

  @JsonRequest("testing/ignore/overridePolicy")
  fun testingIgnoreOverridePolicy(params: IgnorePolicySpec?): CompletableFuture<Unit>
}
