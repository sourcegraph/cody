@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest
import java.util.concurrent.CompletableFuture

@Suppress("unused")
interface CodyAgentServer {
  // ========
  // Requests
  // ========
  @JsonRequest("initialize")
  fun initialize(params: ClientInfo): CompletableFuture<ServerInfo>
  @JsonRequest("shutdown")
  fun shutdown(params: Null): CompletableFuture<Null>
  @JsonRequest("chat/new")
  fun chat_new(params: Null): CompletableFuture<String>
  @JsonRequest("chat/restore")
  fun chat_restore(params: Chat_RestoreParams): CompletableFuture<String>
  @JsonRequest("chat/models")
  fun chat_models(params: Chat_ModelsParams): CompletableFuture<Chat_ModelsResult>
  @JsonRequest("chat/remoteRepos")
  fun chat_remoteRepos(params: Chat_RemoteReposParams): CompletableFuture<Chat_RemoteReposResult>
  @JsonRequest("chat/submitMessage")
  fun chat_submitMessage(params: Chat_SubmitMessageParams): CompletableFuture<ExtensionMessage>
  @JsonRequest("chat/editMessage")
  fun chat_editMessage(params: Chat_EditMessageParams): CompletableFuture<ExtensionMessage>
  @JsonRequest("commands/explain")
  fun commands_explain(params: Null): CompletableFuture<String>
  @JsonRequest("commands/test")
  fun commands_test(params: Null): CompletableFuture<String>
  @JsonRequest("commands/smell")
  fun commands_smell(params: Null): CompletableFuture<String>
  @JsonRequest("commands/custom")
  fun commands_custom(params: Commands_CustomParams): CompletableFuture<CustomCommandResult>
  @JsonRequest("editCommands/test")
  fun editCommands_test(params: Null): CompletableFuture<EditTask>
  @JsonRequest("commands/document")
  fun commands_document(params: Null): CompletableFuture<EditTask>
  @JsonRequest("command/execute")
  fun command_execute(params: ExecuteCommandParams): CompletableFuture<Any>
  @JsonRequest("autocomplete/execute")
  fun autocomplete_execute(params: AutocompleteParams): CompletableFuture<AutocompleteResult>
  @JsonRequest("graphql/getRepoIds")
  fun graphql_getRepoIds(params: Graphql_GetRepoIdsParams): CompletableFuture<Graphql_GetRepoIdsResult>
  @JsonRequest("graphql/currentUserId")
  fun graphql_currentUserId(params: Null): CompletableFuture<String>
  @JsonRequest("graphql/currentUserIsPro")
  fun graphql_currentUserIsPro(params: Null): CompletableFuture<Boolean>
  @JsonRequest("featureFlags/getFeatureFlag")
  fun featureFlags_getFeatureFlag(params: FeatureFlags_GetFeatureFlagParams): CompletableFuture<Boolean?>
  @JsonRequest("graphql/getCurrentUserCodySubscription")
  fun graphql_getCurrentUserCodySubscription(params: Null): CompletableFuture<CurrentUserCodySubscription?>
  @JsonRequest("graphql/logEvent")
  fun graphql_logEvent(params: Event): CompletableFuture<Null>
  @JsonRequest("telemetry/recordEvent")
  fun telemetry_recordEvent(params: TelemetryEvent): CompletableFuture<Null>
  @JsonRequest("graphql/getRepoIdIfEmbeddingExists")
  fun graphql_getRepoIdIfEmbeddingExists(params: Graphql_GetRepoIdIfEmbeddingExistsParams): CompletableFuture<String?>
  @JsonRequest("graphql/getRepoId")
  fun graphql_getRepoId(params: Graphql_GetRepoIdParams): CompletableFuture<String?>
  @JsonRequest("check/isCodyIgnoredFile")
  fun check_isCodyIgnoredFile(params: Check_IsCodyIgnoredFileParams): CompletableFuture<Boolean>
  @JsonRequest("git/codebaseName")
  fun git_codebaseName(params: Git_CodebaseNameParams): CompletableFuture<String?>
  @JsonRequest("webview/didDispose")
  fun webview_didDispose(params: Webview_DidDisposeParams): CompletableFuture<Null>
  @JsonRequest("webview/receiveMessage")
  fun webview_receiveMessage(params: Webview_ReceiveMessageParams): CompletableFuture<Null>
  @JsonRequest("testing/progress")
  fun testing_progress(params: Testing_ProgressParams): CompletableFuture<Testing_ProgressResult>
  @JsonRequest("testing/networkRequests")
  fun testing_networkRequests(params: Null): CompletableFuture<Testing_NetworkRequestsResult>
  @JsonRequest("testing/requestErrors")
  fun testing_requestErrors(params: Null): CompletableFuture<Testing_RequestErrorsResult>
  @JsonRequest("testing/closestPostData")
  fun testing_closestPostData(params: Testing_ClosestPostDataParams): CompletableFuture<Testing_ClosestPostDataResult>
  @JsonRequest("testing/progressCancelation")
  fun testing_progressCancelation(params: Testing_ProgressCancelationParams): CompletableFuture<Testing_ProgressCancelationResult>
  @JsonRequest("testing/reset")
  fun testing_reset(params: Null): CompletableFuture<Null>
  @JsonRequest("extensionConfiguration/change")
  fun extensionConfiguration_change(params: ExtensionConfiguration): CompletableFuture<AuthStatus?>
  @JsonRequest("extensionConfiguration/status")
  fun extensionConfiguration_status(params: Null): CompletableFuture<AuthStatus?>
  @JsonRequest("attribution/search")
  fun attribution_search(params: Attribution_SearchParams): CompletableFuture<Attribution_SearchResult>

  // =============
  // Notifications
  // =============
  @JsonNotification("initialized")
  fun initialized(params: Null)
  @JsonNotification("exit")
  fun exit(params: Null)
  @JsonNotification("extensionConfiguration/didChange")
  fun extensionConfiguration_didChange(params: ExtensionConfiguration)
  @JsonNotification("textDocument/didOpen")
  fun textDocument_didOpen(params: ProtocolTextDocument)
  @JsonNotification("textDocument/didChange")
  fun textDocument_didChange(params: ProtocolTextDocument)
  @JsonNotification("textDocument/didFocus")
  fun textDocument_didFocus(params: TextDocument_DidFocusParams)
  @JsonNotification("textDocument/didSave")
  fun textDocument_didSave(params: TextDocument_DidSaveParams)
  @JsonNotification("textDocument/didClose")
  fun textDocument_didClose(params: ProtocolTextDocument)
  @JsonNotification("workspace/didDeleteFiles")
  fun workspace_didDeleteFiles(params: DeleteFilesParams)
  @JsonNotification("workspace/didCreateFiles")
  fun workspace_didCreateFiles(params: CreateFilesParams)
  @JsonNotification("workspace/didRenameFiles")
  fun workspace_didRenameFiles(params: RenameFilesParams)
  @JsonNotification("$/cancelRequest")
  fun cancelRequest(params: CancelParams)
  @JsonNotification("autocomplete/clearLastCandidate")
  fun autocomplete_clearLastCandidate(params: Null)
  @JsonNotification("autocomplete/completionSuggested")
  fun autocomplete_completionSuggested(params: CompletionItemParams)
  @JsonNotification("autocomplete/completionAccepted")
  fun autocomplete_completionAccepted(params: CompletionItemParams)
  @JsonNotification("progress/cancel")
  fun progress_cancel(params: Progress_CancelParams)
}
