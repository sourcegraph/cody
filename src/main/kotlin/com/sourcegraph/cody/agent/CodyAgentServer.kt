@file:Suppress("FunctionName", "REDUNDANT_NULLABLE")

package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.IgnorePolicySpec
import com.sourcegraph.cody.agent.protocol.IgnoreTestParams
import com.sourcegraph.cody.agent.protocol.IgnoreTestResponse
import com.sourcegraph.cody.agent.protocol.InlineEditParams
import com.sourcegraph.cody.agent.protocol.NetworkRequest
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.TelemetryEvent
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteParams
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteResult
import com.sourcegraph.cody.agent.protocol_generated.Chat_ImportParams
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsParams
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsResult
import com.sourcegraph.cody.agent.protocol_generated.ClientInfo
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideResult
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_TriggerParams
import com.sourcegraph.cody.agent.protocol_generated.Commands_CustomParams
import com.sourcegraph.cody.agent.protocol_generated.CurrentUserCodySubscription
import com.sourcegraph.cody.agent.protocol_generated.CustomCommandResult
import com.sourcegraph.cody.agent.protocol_generated.Diagnostics_PublishParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask
import com.sourcegraph.cody.agent.protocol_generated.EditTask_AcceptParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask_CancelParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask_GetTaskDetailsParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask_RetryParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask_UndoParams
import com.sourcegraph.cody.agent.protocol_generated.ExecuteCommandParams
import com.sourcegraph.cody.agent.protocol_generated.ExtensionConfiguration
import com.sourcegraph.cody.agent.protocol_generated.FeatureFlags_GetFeatureFlagParams
import com.sourcegraph.cody.agent.protocol_generated.Null
import com.sourcegraph.cody.agent.protocol_generated.ProtocolAuthStatus
import com.sourcegraph.cody.agent.protocol_generated.ServerInfo
import com.sourcegraph.cody.agent.protocol_generated.Window_DidChangeFocusParams
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

interface CodyAgentServer : _LegacyAgentServer, _SubsetGeneratedCodyAgentServer

// This is subset of the generated protocol bindings.
// This is only temporary until all legacy bindings are made redundant.
// Make sure to copy from the generated bindings verbatim!
interface _SubsetGeneratedCodyAgentServer {
  // ========
  // Requests
  // ========
  @JsonRequest("initialize") fun initialize(params: ClientInfo): CompletableFuture<ServerInfo>

  @JsonRequest("shutdown") fun shutdown(params: Null?): CompletableFuture<Null?>

  @JsonRequest("autocomplete/execute")
  fun autocomplete_execute(params: AutocompleteParams): CompletableFuture<AutocompleteResult>

  @JsonRequest("editTask/retry")
  fun editTask_retry(params: EditTask_RetryParams): CompletableFuture<EditTask>

  @JsonRequest("editTask/getTaskDetails")
  fun editTask_getTaskDetails(params: EditTask_GetTaskDetailsParams): CompletableFuture<EditTask>

  @JsonRequest("diagnostics/publish")
  fun diagnostics_publish(params: Diagnostics_PublishParams): CompletableFuture<Null?>

  @JsonRequest("command/execute")
  fun command_execute(params: ExecuteCommandParams): CompletableFuture<Any>

  @JsonRequest("commands/custom")
  fun commands_custom(params: Commands_CustomParams): CompletableFuture<CustomCommandResult>

  @JsonRequest("codeActions/provide")
  fun codeActions_provide(
      params: CodeActions_ProvideParams
  ): CompletableFuture<CodeActions_ProvideResult>

  @JsonRequest("codeActions/trigger")
  fun codeActions_trigger(params: CodeActions_TriggerParams): CompletableFuture<EditTask>

  @JsonRequest("chat/import") fun chat_import(params: Chat_ImportParams): CompletableFuture<Null?>

  @JsonRequest("chat/models")
  fun chat_models(params: Chat_ModelsParams): CompletableFuture<Chat_ModelsResult>

  @JsonRequest("extensionConfiguration/getSettingsSchema")
  fun extensionConfiguration_getSettingsSchema(params: Null?): CompletableFuture<String>

  @JsonRequest("extensionConfiguration/change")
  fun extensionConfiguration_change(
      params: ExtensionConfiguration
  ): CompletableFuture<ProtocolAuthStatus?>

  @JsonRequest("featureFlags/getFeatureFlag")
  fun featureFlags_getFeatureFlag(
      params: FeatureFlags_GetFeatureFlagParams
  ): CompletableFuture<Boolean?>

  @JsonRequest("graphql/getCurrentUserCodySubscription")
  fun graphql_getCurrentUserCodySubscription(
      params: Null?
  ): CompletableFuture<CurrentUserCodySubscription?>

  //  // =============
  //  // Notifications
  //  // =============

  @JsonNotification("initialized") fun initialized(params: Null?)

  @JsonNotification("exit") fun exit(params: Null?)

  @JsonNotification("autocomplete/clearLastCandidate")
  fun autocomplete_clearLastCandidate(params: Null?)

  @JsonNotification("autocomplete/completionSuggested")
  fun autocomplete_completionSuggested(
      params: com.sourcegraph.cody.agent.protocol_generated.CompletionItemParams
  )

  @JsonNotification("autocomplete/completionAccepted")
  fun autocomplete_completionAccepted(
      params: com.sourcegraph.cody.agent.protocol_generated.CompletionItemParams
  )

  @JsonNotification("window/didChangeFocus")
  fun window_didChangeFocus(params: Window_DidChangeFocusParams)
}

// TODO: Requests waiting to be migrated & tested for compatibility. Avoid placing new protocol
// messages here.
/**
 * Interface for the server-part of the Cody agent protocol. The implementation of this interface is
 * written in TypeScript in the file "cody/agent/src/agent.ts". The Eclipse LSP4J bindings create a
 * Java implementation of this interface by using a JVM-reflection feature called "Proxy", which
 * works similar to JavaScript Proxy.
 */
interface _LegacyAgentServer {

  @JsonRequest("telemetry/recordEvent")
  fun recordEvent(event: TelemetryEvent): CompletableFuture<Void?>

  @JsonNotification("textDocument/didFocus")
  fun textDocumentDidFocus(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didOpen") fun textDocumentDidOpen(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didChange")
  fun textDocumentDidChange(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didClose")
  fun textDocumentDidClose(document: ProtocolTextDocument)

  @JsonRequest("editTask/accept")
  fun acceptEditTask(params: EditTask_AcceptParams): CompletableFuture<Void?>

  @JsonRequest("editTask/undo")
  fun undoEditTask(params: EditTask_UndoParams): CompletableFuture<Void?>

  @JsonRequest("editTask/cancel")
  fun cancelEditTask(params: EditTask_CancelParams): CompletableFuture<Void?>

  @JsonRequest("editCommands/code")
  fun commandsEdit(params: InlineEditParams): CompletableFuture<EditTask>

  @JsonRequest("chat/web/new") fun chatNew(): CompletableFuture<Any>

  @JsonRequest("webview/receiveMessageStringEncoded")
  fun webviewReceiveMessageStringEncoded(
      params: WebviewReceiveMessageStringEncodedParams
  ): CompletableFuture<Void?>

  @JsonNotification("webview/didDisposeNative")
  fun webviewDidDisposeNative(webviewDidDisposeParams: WebviewDidDisposeParams)

  @JsonRequest("webview/resolveWebviewView")
  fun webviewResolveWebviewView(params: WebviewResolveWebviewViewParams): CompletableFuture<Any>

  @JsonRequest("ignore/test")
  fun ignoreTest(params: IgnoreTestParams): CompletableFuture<IgnoreTestResponse>

  @JsonRequest("testing/ignore/overridePolicy")
  fun testingIgnoreOverridePolicy(params: IgnorePolicySpec?): CompletableFuture<Unit>

  @JsonRequest("testing/requestErrors")
  fun testingRequestErrors(): CompletableFuture<List<NetworkRequest>>
}
