using System.Threading.Tasks;

namespace Cody.Core.Agent.Protocol;
{

public interface CodyAgentServer
{
  // ========
  // Requests
  // ========
  [JsonRpcMethod("initialize")]
  Task<ServerInfo> Initialize(ClientInfo params);
  [JsonRpcMethod("shutdown")]
  Task Shutdown();
  [JsonRpcMethod("chat/new")]
  Task<string> ChatNew();
  [JsonRpcMethod("chat/web/new")]
  Task<ChatWebNewResult> ChatWebNew();
  [JsonRpcMethod("chat/sidebar/new")]
  Task<ChatSidebarNewResult> ChatSidebarNew();
  [JsonRpcMethod("chat/delete")]
  Task<ChatExportResult[]> ChatDelete(ChatDeleteParams params);
  [JsonRpcMethod("chat/restore")]
  Task<string> ChatRestore(ChatRestoreParams params);
  [JsonRpcMethod("chat/models")]
  Task<ChatModelsResult> ChatModels(ChatModelsParams params);
  [JsonRpcMethod("chat/export")]
  Task<ChatExportResult[]> ChatExport(ChatExportParams params);
  [JsonRpcMethod("chat/remoteRepos")]
  Task<ChatRemoteReposResult> ChatRemoteRepos(ChatRemoteReposParams params);
  [JsonRpcMethod("commands/explain")]
  Task<string> CommandsExplain();
  [JsonRpcMethod("commands/test")]
  Task<string> CommandsTest();
  [JsonRpcMethod("commands/smell")]
  Task<string> CommandsSmell();
  [JsonRpcMethod("commands/custom")]
  Task<CustomCommandResult> CommandsCustom(CommandsCustomParams params);
  [JsonRpcMethod("customCommands/list")]
  Task<CodyCommand[]> CustomCommandsList();
  [JsonRpcMethod("editCommands/code")]
  Task<EditTask> EditCommandsCode(EditCommandsCodeParams params);
  [JsonRpcMethod("editCommands/test")]
  Task<EditTask> EditCommandsTest();
  [JsonRpcMethod("editCommands/document")]
  Task<EditTask> EditCommandsDocument();
  [JsonRpcMethod("editTask/accept")]
  Task EditTaskAccept(EditTaskAcceptParams params);
  [JsonRpcMethod("editTask/undo")]
  Task EditTaskUndo(EditTaskUndoParams params);
  [JsonRpcMethod("editTask/cancel")]
  Task EditTaskCancel(EditTaskCancelParams params);
  [JsonRpcMethod("editTask/retry")]
  Task<EditTask> EditTaskRetry(EditTaskRetryParams params);
  [JsonRpcMethod("editTask/getTaskDetails")]
  Task<EditTask> EditTaskGetTaskDetails(EditTaskGetTaskDetailsParams params);
  [JsonRpcMethod("editTask/getFoldingRanges")]
  Task<GetFoldingRangeResult> EditTaskGetFoldingRanges(GetFoldingRangeParams params);
  [JsonRpcMethod("command/execute")]
  Task<Object> CommandExecute(ExecuteCommandParams params);
  [JsonRpcMethod("codeActions/provide")]
  Task<CodeActionsProvideResult> CodeActionsProvide(CodeActionsProvideParams params);
  [JsonRpcMethod("codeActions/trigger")]
  Task<EditTask> CodeActionsTrigger(CodeActionsTriggerParams params);
  [JsonRpcMethod("autocomplete/execute")]
  Task<AutocompleteResult> AutocompleteExecute(AutocompleteParams params);
  [JsonRpcMethod("graphql/getRepoIds")]
  Task<GraphqlGetRepoIdsResult> GraphqlGetRepoIds(GraphqlGetRepoIdsParams params);
  [JsonRpcMethod("graphql/currentUserId")]
  Task<string> GraphqlCurrentUserId();
  [JsonRpcMethod("graphql/currentUserIsPro")]
  Task<bool> GraphqlCurrentUserIsPro();
  [JsonRpcMethod("featureFlags/getFeatureFlag")]
  Task<bool> FeatureFlagsGetFeatureFlag(FeatureFlagsGetFeatureFlagParams params);
  [JsonRpcMethod("graphql/getCurrentUserCodySubscription")]
  Task<CurrentUserCodySubscription> GraphqlGetCurrentUserCodySubscription();
  [JsonRpcMethod("graphql/logEvent")]
  Task GraphqlLogEvent(Event params);
  [JsonRpcMethod("telemetry/recordEvent")]
  Task TelemetryRecordEvent(TelemetryEvent params);
  [JsonRpcMethod("graphql/getRepoIdIfEmbeddingExists")]
  Task<string> GraphqlGetRepoIdIfEmbeddingExists(GraphqlGetRepoIdIfEmbeddingExistsParams params);
  [JsonRpcMethod("graphql/getRepoId")]
  Task<string> GraphqlGetRepoId(GraphqlGetRepoIdParams params);
  [JsonRpcMethod("git/codebaseName")]
  Task<string> GitCodebaseName(GitCodebaseNameParams params);
  [JsonRpcMethod("webview/didDispose")]
  Task WebviewDidDispose(WebviewDidDisposeParams params);
  [JsonRpcMethod("webview/resolveWebviewView")]
  Task WebviewResolveWebviewView(WebviewResolveWebviewViewParams params);
  [JsonRpcMethod("webview/receiveMessageStringEncoded")]
  Task WebviewReceiveMessageStringEncoded(WebviewReceiveMessageStringEncodedParams params);
  [JsonRpcMethod("diagnostics/publish")]
  Task DiagnosticsPublish(DiagnosticsPublishParams params);
  [JsonRpcMethod("testing/progress")]
  Task<TestingProgressResult> TestingProgress(TestingProgressParams params);
  [JsonRpcMethod("testing/exportedTelemetryEvents")]
  Task<TestingExportedTelemetryEventsResult> TestingExportedTelemetryEvents();
  [JsonRpcMethod("testing/networkRequests")]
  Task<TestingNetworkRequestsResult> TestingNetworkRequests();
  [JsonRpcMethod("testing/requestErrors")]
  Task<TestingRequestErrorsResult> TestingRequestErrors();
  [JsonRpcMethod("testing/closestPostData")]
  Task<TestingClosestPostDataResult> TestingClosestPostData(TestingClosestPostDataParams params);
  [JsonRpcMethod("testing/memoryUsage")]
  Task<TestingMemoryUsageResult> TestingMemoryUsage();
  [JsonRpcMethod("testing/awaitPendingPromises")]
  Task TestingAwaitPendingPromises();
  [JsonRpcMethod("testing/workspaceDocuments")]
  Task<GetDocumentsResult> TestingWorkspaceDocuments(GetDocumentsParams params);
  [JsonRpcMethod("testing/diagnostics")]
  Task<TestingDiagnosticsResult> TestingDiagnostics(TestingDiagnosticsParams params);
  [JsonRpcMethod("testing/progressCancelation")]
  Task<TestingProgressCancelationResult> TestingProgressCancelation(TestingProgressCancelationParams params);
  [JsonRpcMethod("testing/reset")]
  Task TestingReset();
  [JsonRpcMethod("testing/autocomplete/completionEvent")]
  Task<CompletionBookkeepingEvent> TestingAutocompleteCompletionEvent(CompletionItemParams params);
  [JsonRpcMethod("extensionConfiguration/change")]
  Task<AuthStatus> ExtensionConfigurationChange(ExtensionConfiguration params);
  [JsonRpcMethod("extensionConfiguration/status")]
  Task<AuthStatus> ExtensionConfigurationStatus();
  [JsonRpcMethod("extensionConfiguration/getSettingsSchema")]
  Task<string> ExtensionConfigurationGetSettingsSchema();
  [JsonRpcMethod("textDocument/change")]
  Task<TextDocumentChangeResult> TextDocumentChange(ProtocolTextDocument params);
  [JsonRpcMethod("attribution/search")]
  Task<AttributionSearchResult> AttributionSearch(AttributionSearchParams params);
  [JsonRpcMethod("ignore/test")]
  Task<IgnoreTestResult> IgnoreTest(IgnoreTestParams params);
  [JsonRpcMethod("testing/ignore/overridePolicy")]
  Task TestingIgnoreOverridePolicy(ContextFilters params);
  [JsonRpcMethod("remoteRepo/has")]
  Task<RemoteRepoHasResult> RemoteRepoHas(RemoteRepoHasParams params);
  [JsonRpcMethod("remoteRepo/list")]
  Task<RemoteRepoListResult> RemoteRepoList(RemoteRepoListParams params);

  // =============
  // Notifications
  // =============
  [JsonRpcMethod("initialized")]
  void Initialized(Void params);
  [JsonRpcMethod("exit")]
  void Exit(Void params);
  [JsonRpcMethod("extensionConfiguration/didChange")]
  void ExtensionConfigurationDidChange(ExtensionConfiguration params);
  [JsonRpcMethod("workspaceFolder/didChange")]
  void WorkspaceFolderDidChange(WorkspaceFolderDidChangeParams params);
  [JsonRpcMethod("textDocument/didOpen")]
  void TextDocumentDidOpen(ProtocolTextDocument params);
  [JsonRpcMethod("textDocument/didChange")]
  void TextDocumentDidChange(ProtocolTextDocument params);
  [JsonRpcMethod("textDocument/didFocus")]
  void TextDocumentDidFocus(TextDocumentDidFocusParams params);
  [JsonRpcMethod("textDocument/didSave")]
  void TextDocumentDidSave(TextDocumentDidSaveParams params);
  [JsonRpcMethod("textDocument/didClose")]
  void TextDocumentDidClose(ProtocolTextDocument params);
  [JsonRpcMethod("workspace/didDeleteFiles")]
  void WorkspaceDidDeleteFiles(DeleteFilesParams params);
  [JsonRpcMethod("workspace/didCreateFiles")]
  void WorkspaceDidCreateFiles(CreateFilesParams params);
  [JsonRpcMethod("workspace/didRenameFiles")]
  void WorkspaceDidRenameFiles(RenameFilesParams params);
  [JsonRpcMethod("$/cancelRequest")]
  void CancelRequest(CancelParams params);
  [JsonRpcMethod("autocomplete/clearLastCandidate")]
  void AutocompleteClearLastCandidate(Void params);
  [JsonRpcMethod("autocomplete/completionSuggested")]
  void AutocompleteCompletionSuggested(CompletionItemParams params);
  [JsonRpcMethod("autocomplete/completionAccepted")]
  void AutocompleteCompletionAccepted(CompletionItemParams params);
  [JsonRpcMethod("progress/cancel")]
  void ProgressCancel(ProgressCancelParams params);
  [JsonRpcMethod("webview/didDisposeNative")]
  void WebviewDidDisposeNative(WebviewDidDisposeNativeParams params);
}
}
