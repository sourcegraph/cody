@file:Suppress("FunctionName", "ClassName", "RedundantNullable")
package com.sourcegraph.cody.agent.protocol_generated;

import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import java.util.concurrent.CompletableFuture;

@Suppress("unused")
interface CodyAgentServer {
  // ========
  // Requests
  // ========
  @JsonRequest("initialize")
  fun initialize(params: ClientInfo): CompletableFuture<ServerInfo>
  @JsonRequest("shutdown")
  fun shutdown(params: Null?): CompletableFuture<Null?>
  @JsonRequest("chat/new")
  fun chat_new(params: Null?): CompletableFuture<String>
  @JsonRequest("chat/web/new")
  fun chat_web_new(params: Null?): CompletableFuture<Chat_Web_NewResult>
  @JsonRequest("chat/delete")
  fun chat_delete(params: Chat_DeleteParams): CompletableFuture<List<ChatExportResult>>
  @JsonRequest("chat/restore")
  fun chat_restore(params: Chat_RestoreParams): CompletableFuture<String>
  @JsonRequest("chat/models")
  fun chat_models(params: Chat_ModelsParams): CompletableFuture<Chat_ModelsResult>
  @JsonRequest("chat/export")
  fun chat_export(params: Chat_ExportParams?): CompletableFuture<List<ChatExportResult>>
  @JsonRequest("chat/remoteRepos")
  fun chat_remoteRepos(params: Chat_RemoteReposParams): CompletableFuture<Chat_RemoteReposResult>
  @JsonRequest("commands/explain")
  fun commands_explain(params: Null?): CompletableFuture<String>
  @JsonRequest("commands/test")
  fun commands_test(params: Null?): CompletableFuture<String>
  @JsonRequest("commands/smell")
  fun commands_smell(params: Null?): CompletableFuture<String>
  @JsonRequest("commands/custom")
  fun commands_custom(params: Commands_CustomParams): CompletableFuture<CustomCommandResult>
  @JsonRequest("customCommands/list")
  fun customCommands_list(params: Null?): CompletableFuture<List<CodyCommand>>
  @JsonRequest("editCommands/code")
  fun editCommands_code(params: EditCommands_CodeParams): CompletableFuture<EditTask>
  @JsonRequest("editCommands/test")
  fun editCommands_test(params: Null?): CompletableFuture<EditTask>
  @JsonRequest("editCommands/document")
  fun editCommands_document(params: Null?): CompletableFuture<EditTask>
  @JsonRequest("editTask/accept")
  fun editTask_accept(params: EditTask_AcceptParams): CompletableFuture<Null?>
  @JsonRequest("editTask/undo")
  fun editTask_undo(params: EditTask_UndoParams): CompletableFuture<Null?>
  @JsonRequest("editTask/cancel")
  fun editTask_cancel(params: EditTask_CancelParams): CompletableFuture<Null?>
  @JsonRequest("editTask/retry")
  fun editTask_retry(params: EditTask_RetryParams): CompletableFuture<EditTask>
  @JsonRequest("editTask/getTaskDetails")
  fun editTask_getTaskDetails(params: EditTask_GetTaskDetailsParams): CompletableFuture<EditTask>
  @JsonRequest("editTask/getFoldingRanges")
  fun editTask_getFoldingRanges(params: GetFoldingRangeParams): CompletableFuture<GetFoldingRangeResult>
  @JsonRequest("command/execute")
  fun command_execute(params: ExecuteCommandParams): CompletableFuture<Any>
  @JsonRequest("codeActions/provide")
  fun codeActions_provide(params: CodeActions_ProvideParams): CompletableFuture<CodeActions_ProvideResult>
  @JsonRequest("codeActions/trigger")
  fun codeActions_trigger(params: CodeActions_TriggerParams): CompletableFuture<EditTask>
  @JsonRequest("autocomplete/execute")
  fun autocomplete_execute(params: AutocompleteParams): CompletableFuture<AutocompleteResult>
  @JsonRequest("graphql/getRepoIds")
  fun graphql_getRepoIds(params: Graphql_GetRepoIdsParams): CompletableFuture<Graphql_GetRepoIdsResult>
  @JsonRequest("graphql/currentUserId")
  fun graphql_currentUserId(params: Null?): CompletableFuture<String>
  @JsonRequest("graphql/currentUserIsPro")
  fun graphql_currentUserIsPro(params: Null?): CompletableFuture<Boolean>
  @JsonRequest("featureFlags/getFeatureFlag")
  fun featureFlags_getFeatureFlag(params: FeatureFlags_GetFeatureFlagParams): CompletableFuture<Boolean?>
  @JsonRequest("graphql/getCurrentUserCodySubscription")
  fun graphql_getCurrentUserCodySubscription(params: Null?): CompletableFuture<CurrentUserCodySubscription?>
  @JsonRequest("graphql/logEvent")
  fun graphql_logEvent(params: Event): CompletableFuture<Null?>
  @JsonRequest("telemetry/recordEvent")
  fun telemetry_recordEvent(params: TelemetryEvent): CompletableFuture<Null?>
  @JsonRequest("graphql/getRepoIdIfEmbeddingExists")
  fun graphql_getRepoIdIfEmbeddingExists(params: Graphql_GetRepoIdIfEmbeddingExistsParams): CompletableFuture<String?>
  @JsonRequest("graphql/getRepoId")
  fun graphql_getRepoId(params: Graphql_GetRepoIdParams): CompletableFuture<String?>
  @JsonRequest("git/codebaseName")
  fun git_codebaseName(params: Git_CodebaseNameParams): CompletableFuture<String?>
  @JsonRequest("webview/didDispose")
  fun webview_didDispose(params: Webview_DidDisposeParams): CompletableFuture<Null?>
  @JsonRequest("webview/resolveWebviewView")
  fun webview_resolveWebviewView(params: Webview_ResolveWebviewViewParams): CompletableFuture<Null?>
  @JsonRequest("webview/receiveMessageStringEncoded")
  fun webview_receiveMessageStringEncoded(params: Webview_ReceiveMessageStringEncodedParams): CompletableFuture<Null?>
  @JsonRequest("diagnostics/publish")
  fun diagnostics_publish(params: Diagnostics_PublishParams): CompletableFuture<Null?>
  @JsonRequest("testing/progress")
  fun testing_progress(params: Testing_ProgressParams): CompletableFuture<Testing_ProgressResult>
  @JsonRequest("testing/networkRequests")
  fun testing_networkRequests(params: Null?): CompletableFuture<Testing_NetworkRequestsResult>
  @JsonRequest("testing/requestErrors")
  fun testing_requestErrors(params: Null?): CompletableFuture<Testing_RequestErrorsResult>
  @JsonRequest("testing/closestPostData")
  fun testing_closestPostData(params: Testing_ClosestPostDataParams): CompletableFuture<Testing_ClosestPostDataResult>
  @JsonRequest("testing/memoryUsage")
  fun testing_memoryUsage(params: Null?): CompletableFuture<Testing_MemoryUsageResult>
  @JsonRequest("testing/awaitPendingPromises")
  fun testing_awaitPendingPromises(params: Null?): CompletableFuture<Null?>
  @JsonRequest("testing/workspaceDocuments")
  fun testing_workspaceDocuments(params: GetDocumentsParams): CompletableFuture<GetDocumentsResult>
  @JsonRequest("testing/diagnostics")
  fun testing_diagnostics(params: Testing_DiagnosticsParams): CompletableFuture<Testing_DiagnosticsResult>
  @JsonRequest("testing/progressCancelation")
  fun testing_progressCancelation(params: Testing_ProgressCancelationParams): CompletableFuture<Testing_ProgressCancelationResult>
  @JsonRequest("testing/reset")
  fun testing_reset(params: Null?): CompletableFuture<Null?>
  @JsonRequest("testing/autocomplete/completionEvent")
  fun testing_autocomplete_completionEvent(params: CompletionItemParams): CompletableFuture<CompletionBookkeepingEvent?>
  @JsonRequest("extensionConfiguration/change")
  fun extensionConfiguration_change(params: ExtensionConfiguration): CompletableFuture<AuthStatus?>
  @JsonRequest("extensionConfiguration/status")
  fun extensionConfiguration_status(params: Null?): CompletableFuture<AuthStatus?>
  @JsonRequest("extensionConfiguration/getSettingsSchema")
  fun extensionConfiguration_getSettingsSchema(params: Null?): CompletableFuture<String>
  @JsonRequest("textDocument/change")
  fun textDocument_change(params: ProtocolTextDocument): CompletableFuture<TextDocument_ChangeResult>
  @JsonRequest("attribution/search")
  fun attribution_search(params: Attribution_SearchParams): CompletableFuture<Attribution_SearchResult>
  @JsonRequest("ignore/test")
  fun ignore_test(params: Ignore_TestParams): CompletableFuture<Ignore_TestResult>
  @JsonRequest("testing/ignore/overridePolicy")
  fun testing_ignore_overridePolicy(params: ContextFilters?): CompletableFuture<Null?>
  @JsonRequest("remoteRepo/has")
  fun remoteRepo_has(params: RemoteRepo_HasParams): CompletableFuture<RemoteRepo_HasResult>
  @JsonRequest("remoteRepo/list")
  fun remoteRepo_list(params: RemoteRepo_ListParams): CompletableFuture<RemoteRepo_ListResult>

  // =============
  // Notifications
  // =============
  @JsonNotification("initialized")
  fun initialized(params: Null?)
  @JsonNotification("exit")
  fun exit(params: Null?)
  @JsonNotification("extensionConfiguration/didChange")
  fun extensionConfiguration_didChange(params: ExtensionConfiguration)
  @JsonNotification("workspaceFolder/didChange")
  fun workspaceFolder_didChange(params: WorkspaceFolder_DidChangeParams)
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
  fun autocomplete_clearLastCandidate(params: Null?)
  @JsonNotification("autocomplete/completionSuggested")
  fun autocomplete_completionSuggested(params: CompletionItemParams)
  @JsonNotification("autocomplete/completionAccepted")
  fun autocomplete_completionAccepted(params: CompletionItemParams)
  @JsonNotification("progress/cancel")
  fun progress_cancel(params: Progress_CancelParams)
  @JsonNotification("webview/didDisposeNative")
  fun webview_didDisposeNative(params: Webview_DidDisposeNativeParams)
}
