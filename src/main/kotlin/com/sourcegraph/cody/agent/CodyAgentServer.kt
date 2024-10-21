@file:Suppress("FunctionName", "REDUNDANT_NULLABLE")

package com.sourcegraph.cody.agent

import com.sourcegraph.cody.agent.protocol.AutocompleteParams
import com.sourcegraph.cody.agent.protocol.AutocompleteResult
import com.sourcegraph.cody.agent.protocol.CompletionItemParams
import com.sourcegraph.cody.agent.protocol.CurrentUserCodySubscription
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag
import com.sourcegraph.cody.agent.protocol.IgnorePolicySpec
import com.sourcegraph.cody.agent.protocol.IgnoreTestParams
import com.sourcegraph.cody.agent.protocol.IgnoreTestResponse
import com.sourcegraph.cody.agent.protocol.InlineEditParams
import com.sourcegraph.cody.agent.protocol.NetworkRequest
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.TelemetryEvent
import com.sourcegraph.cody.agent.protocol_generated.Chat_ImportParams
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsParams
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsResult
import com.sourcegraph.cody.agent.protocol_generated.ClientInfo
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideParams
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_ProvideResult
import com.sourcegraph.cody.agent.protocol_generated.CodeActions_TriggerParams
import com.sourcegraph.cody.agent.protocol_generated.Commands_CustomParams
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
import com.sourcegraph.cody.agent.protocol_generated.Null
import com.sourcegraph.cody.agent.protocol_generated.ServerInfo
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

  @JsonRequest("editTask/retry")
  fun editTask_retry(params: EditTask_RetryParams): CompletableFuture<EditTask>

  @JsonRequest("editTask/getTaskDetails")
  fun editTask_getTaskDetails(params: EditTask_GetTaskDetailsParams): CompletableFuture<EditTask>

  @JsonRequest("diagnostics/publish")
  fun diagnostics_publish(params: Diagnostics_PublishParams): CompletableFuture<Null?>

  @JsonRequest("command/execute")
  fun command_execute(params: ExecuteCommandParams): CompletableFuture<Any>

  @JsonRequest("codeActions/provide")
  fun codeActions_provide(
      params: CodeActions_ProvideParams
  ): CompletableFuture<CodeActions_ProvideResult>

  @JsonRequest("codeActions/trigger")
  fun codeActions_trigger(params: CodeActions_TriggerParams): CompletableFuture<EditTask>

  @JsonRequest("chat/models")
  fun chat_models(params: Chat_ModelsParams): CompletableFuture<Chat_ModelsResult>

  @JsonRequest("extensionConfiguration/getSettingsSchema")
  fun extensionConfiguration_getSettingsSchema(params: Null?): CompletableFuture<String>

  //  // =============
  //  // Notifications
  //  // =============

  @JsonNotification("extensionConfiguration/didChange")
  fun extensionConfiguration_didChange(params: ExtensionConfiguration)
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
  @JsonRequest("shutdown") fun shutdown(): CompletableFuture<Void?>

  @JsonRequest("autocomplete/execute")
  fun autocompleteExecute(params: AutocompleteParams?): CompletableFuture<AutocompleteResult>

  @JsonRequest("telemetry/recordEvent")
  fun recordEvent(event: TelemetryEvent): CompletableFuture<Void?>

  // TODO(CODY-2826): Would be nice if we can generate some set of "known" feature flags from the
  // protocol
  @JsonRequest("featureFlags/getFeatureFlag")
  fun evaluateFeatureFlag(flagName: GetFeatureFlag): CompletableFuture<Boolean?>

  // TODO(CODY-2827): To avoid having to pass annoying null values we should generate a default
  // value
  @JsonRequest("graphql/getCurrentUserCodySubscription")
  fun getCurrentUserCodySubscription(): CompletableFuture<CurrentUserCodySubscription?>

  @JsonNotification("initialized") fun initialized()

  @JsonNotification("exit") fun exit()

  @JsonNotification("textDocument/didFocus")
  fun textDocumentDidFocus(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didOpen") fun textDocumentDidOpen(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didChange")
  fun textDocumentDidChange(document: ProtocolTextDocument)

  @JsonNotification("textDocument/didClose")
  fun textDocumentDidClose(document: ProtocolTextDocument)

  @JsonNotification("autocomplete/clearLastCandidate") fun autocompleteClearLastCandidate()

  @JsonNotification("autocomplete/completionSuggested")
  fun completionSuggested(logID: CompletionItemParams)

  @JsonNotification("autocomplete/completionAccepted")
  fun completionAccepted(logID: CompletionItemParams)

  @JsonRequest("editTask/accept")
  fun acceptEditTask(params: EditTask_AcceptParams): CompletableFuture<Void?>

  @JsonRequest("editTask/undo")
  fun undoEditTask(params: EditTask_UndoParams): CompletableFuture<Void?>

  @JsonRequest("editTask/cancel")
  fun cancelEditTask(params: EditTask_CancelParams): CompletableFuture<Void?>

  @JsonRequest("commands/custom")
  fun commands_custom(params: Commands_CustomParams): CompletableFuture<CustomCommandResult>

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

  @JsonRequest("chat/import") fun chat_import(params: Chat_ImportParams): CompletableFuture<Null?>

  @JsonRequest("ignore/test")
  fun ignoreTest(params: IgnoreTestParams): CompletableFuture<IgnoreTestResponse>

  @JsonRequest("testing/ignore/overridePolicy")
  fun testingIgnoreOverridePolicy(params: IgnorePolicySpec?): CompletableFuture<Unit>

  @JsonRequest("testing/requestErrors")
  fun testingRequestErrors(): CompletableFuture<List<NetworkRequest>>
}
