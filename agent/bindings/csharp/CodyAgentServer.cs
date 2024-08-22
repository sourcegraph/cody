using System.Threading.Tasks;

namespace Cody.Core.Agent.Protocol;
{

public interface CodyAgentServer
{
  // ========
  // Requests
  // ========
  [JsonRpcMethod("initialize")]
  Task<ServerInfo> initialize(ClientInfo params);
  [JsonRpcMethod("shutdown")]
  Task<Void> shutdown(Void params);
  [JsonRpcMethod("chat/new")]
  Task<string> chatnew(Void params);
  [JsonRpcMethod("chat/web/new")]
  Task<ChatWebNewResult> chatwebnew(Void params);
  [JsonRpcMethod("chat/sidebar/new")]
  Task<ChatSidebarNewResult> chatsidebarnew(Void params);
  [JsonRpcMethod("chat/delete")]
  Task<ChatExportResult[]> chatdelete(ChatDeleteParams params);
  [JsonRpcMethod("chat/restore")]
  Task<string> chatrestore(ChatRestoreParams params);
  [JsonRpcMethod("chat/models")]
  Task<ChatModelsResult> chatmodels(ChatModelsParams params);
  [JsonRpcMethod("chat/export")]
  Task<ChatExportResult[]> chatexport(ChatExportParams params);
  [JsonRpcMethod("chat/remoteRepos")]
  Task<ChatRemoteReposResult> chatremoteRepos(ChatRemoteReposParams params);
  [JsonRpcMethod("commands/explain")]
  Task<string> commandsexplain(Void params);
  [JsonRpcMethod("commands/test")]
  Task<string> commandstest(Void params);
  [JsonRpcMethod("commands/smell")]
  Task<string> commandssmell(Void params);
  [JsonRpcMethod("commands/custom")]
  Task<CustomCommandResult> commandscustom(CommandsCustomParams params);
  [JsonRpcMethod("customCommands/list")]
  Task<CodyCommand[]> customCommandslist(Void params);
  [JsonRpcMethod("editCommands/code")]
  Task<EditTask> editCommandscode(EditCommandsCodeParams params);
  [JsonRpcMethod("editCommands/test")]
  Task<EditTask> editCommandstest(Void params);
  [JsonRpcMethod("editCommands/document")]
  Task<EditTask> editCommandsdocument(Void params);
  [JsonRpcMethod("editTask/accept")]
  Task<Void> editTaskaccept(EditTaskAcceptParams params);
  [JsonRpcMethod("editTask/undo")]
  Task<Void> editTaskundo(EditTaskUndoParams params);
  [JsonRpcMethod("editTask/cancel")]
  Task<Void> editTaskcancel(EditTaskCancelParams params);
  [JsonRpcMethod("editTask/retry")]
  Task<EditTask> editTaskretry(EditTaskRetryParams params);
  [JsonRpcMethod("editTask/getTaskDetails")]
  Task<EditTask> editTaskgetTaskDetails(EditTaskGetTaskDetailsParams params);
  [JsonRpcMethod("editTask/getFoldingRanges")]
  Task<GetFoldingRangeResult> editTaskgetFoldingRanges(GetFoldingRangeParams params);
  [JsonRpcMethod("command/execute")]
  Task<Object> commandexecute(ExecuteCommandParams params);
  [JsonRpcMethod("codeActions/provide")]
  Task<CodeActionsProvideResult> codeActionsprovide(CodeActionsProvideParams params);
  [JsonRpcMethod("codeActions/trigger")]
  Task<EditTask> codeActionstrigger(CodeActionsTriggerParams params);
  [JsonRpcMethod("autocomplete/execute")]
  Task<AutocompleteResult> autocompleteexecute(AutocompleteParams params);
  [JsonRpcMethod("graphql/getRepoIds")]
  Task<GraphqlGetRepoIdsResult> graphqlgetRepoIds(GraphqlGetRepoIdsParams params);
  [JsonRpcMethod("graphql/currentUserId")]
  Task<string> graphqlcurrentUserId(Void params);
  [JsonRpcMethod("graphql/currentUserIsPro")]
  Task<bool> graphqlcurrentUserIsPro(Void params);
  [JsonRpcMethod("featureFlags/getFeatureFlag")]
  Task<bool> featureFlagsgetFeatureFlag(FeatureFlagsGetFeatureFlagParams params);
  [JsonRpcMethod("graphql/getCurrentUserCodySubscription")]
  Task<CurrentUserCodySubscription> graphqlgetCurrentUserCodySubscription(Void params);
  [JsonRpcMethod("graphql/logEvent")]
  Task<Void> graphqllogEvent(Event params);
  [JsonRpcMethod("telemetry/recordEvent")]
  Task<Void> telemetryrecordEvent(TelemetryEvent params);
  [JsonRpcMethod("graphql/getRepoIdIfEmbeddingExists")]
  Task<string> graphqlgetRepoIdIfEmbeddingExists(GraphqlGetRepoIdIfEmbeddingExistsParams params);
  [JsonRpcMethod("graphql/getRepoId")]
  Task<string> graphqlgetRepoId(GraphqlGetRepoIdParams params);
  [JsonRpcMethod("git/codebaseName")]
  Task<string> gitcodebaseName(GitCodebaseNameParams params);
  [JsonRpcMethod("webview/didDispose")]
  Task<Void> webviewdidDispose(WebviewDidDisposeParams params);
  [JsonRpcMethod("webview/resolveWebviewView")]
  Task<Void> webviewresolveWebviewView(WebviewResolveWebviewViewParams params);
  [JsonRpcMethod("webview/receiveMessageStringEncoded")]
  Task<Void> webviewreceiveMessageStringEncoded(WebviewReceiveMessageStringEncodedParams params);
  [JsonRpcMethod("diagnostics/publish")]
  Task<Void> diagnosticspublish(DiagnosticsPublishParams params);
  [JsonRpcMethod("testing/progress")]
  Task<TestingProgressResult> testingprogress(TestingProgressParams params);
  [JsonRpcMethod("testing/exportedTelemetryEvents")]
  Task<TestingExportedTelemetryEventsResult> testingexportedTelemetryEvents(Void params);
  [JsonRpcMethod("testing/networkRequests")]
  Task<TestingNetworkRequestsResult> testingnetworkRequests(Void params);
  [JsonRpcMethod("testing/requestErrors")]
  Task<TestingRequestErrorsResult> testingrequestErrors(Void params);
  [JsonRpcMethod("testing/closestPostData")]
  Task<TestingClosestPostDataResult> testingclosestPostData(TestingClosestPostDataParams params);
  [JsonRpcMethod("testing/memoryUsage")]
  Task<TestingMemoryUsageResult> testingmemoryUsage(Void params);
  [JsonRpcMethod("testing/awaitPendingPromises")]
  Task<Void> testingawaitPendingPromises(Void params);
  [JsonRpcMethod("testing/workspaceDocuments")]
  Task<GetDocumentsResult> testingworkspaceDocuments(GetDocumentsParams params);
  [JsonRpcMethod("testing/diagnostics")]
  Task<TestingDiagnosticsResult> testingdiagnostics(TestingDiagnosticsParams params);
  [JsonRpcMethod("testing/progressCancelation")]
  Task<TestingProgressCancelationResult> testingprogressCancelation(TestingProgressCancelationParams params);
  [JsonRpcMethod("testing/reset")]
  Task<Void> testingreset(Void params);
  [JsonRpcMethod("testing/autocomplete/completionEvent")]
  Task<CompletionBookkeepingEvent> testingautocompletecompletionEvent(CompletionItemParams params);
  [JsonRpcMethod("extensionConfiguration/change")]
  Task<AuthStatus> extensionConfigurationchange(ExtensionConfiguration params);
  [JsonRpcMethod("extensionConfiguration/status")]
  Task<AuthStatus> extensionConfigurationstatus(Void params);
  [JsonRpcMethod("extensionConfiguration/getSettingsSchema")]
  Task<string> extensionConfigurationgetSettingsSchema(Void params);
  [JsonRpcMethod("textDocument/change")]
  Task<TextDocumentChangeResult> textDocumentchange(ProtocolTextDocument params);
  [JsonRpcMethod("attribution/search")]
  Task<AttributionSearchResult> attributionsearch(AttributionSearchParams params);
  [JsonRpcMethod("ignore/test")]
  Task<IgnoreTestResult> ignoretest(IgnoreTestParams params);
  [JsonRpcMethod("testing/ignore/overridePolicy")]
  Task<Void> testingignoreoverridePolicy(ContextFilters params);
  [JsonRpcMethod("remoteRepo/has")]
  Task<RemoteRepoHasResult> remoteRepohas(RemoteRepoHasParams params);
  [JsonRpcMethod("remoteRepo/list")]
  Task<RemoteRepoListResult> remoteRepolist(RemoteRepoListParams params);

  // =============
  // Notifications
  // =============
  [JsonRpcMethod("initialized")]
  void initialized(Void params);
  [JsonRpcMethod("exit")]
  void exit(Void params);
  [JsonRpcMethod("extensionConfiguration/didChange")]
  void extensionConfigurationdidChange(ExtensionConfiguration params);
  [JsonRpcMethod("workspaceFolder/didChange")]
  void workspaceFolderdidChange(WorkspaceFolderDidChangeParams params);
  [JsonRpcMethod("textDocument/didOpen")]
  void textDocumentdidOpen(ProtocolTextDocument params);
  [JsonRpcMethod("textDocument/didChange")]
  void textDocumentdidChange(ProtocolTextDocument params);
  [JsonRpcMethod("textDocument/didFocus")]
  void textDocumentdidFocus(TextDocumentDidFocusParams params);
  [JsonRpcMethod("textDocument/didSave")]
  void textDocumentdidSave(TextDocumentDidSaveParams params);
  [JsonRpcMethod("textDocument/didClose")]
  void textDocumentdidClose(ProtocolTextDocument params);
  [JsonRpcMethod("workspace/didDeleteFiles")]
  void workspacedidDeleteFiles(DeleteFilesParams params);
  [JsonRpcMethod("workspace/didCreateFiles")]
  void workspacedidCreateFiles(CreateFilesParams params);
  [JsonRpcMethod("workspace/didRenameFiles")]
  void workspacedidRenameFiles(RenameFilesParams params);
  [JsonRpcMethod("$/cancelRequest")]
  void cancelRequest(CancelParams params);
  [JsonRpcMethod("autocomplete/clearLastCandidate")]
  void autocompleteclearLastCandidate(Void params);
  [JsonRpcMethod("autocomplete/completionSuggested")]
  void autocompletecompletionSuggested(CompletionItemParams params);
  [JsonRpcMethod("autocomplete/completionAccepted")]
  void autocompletecompletionAccepted(CompletionItemParams params);
  [JsonRpcMethod("progress/cancel")]
  void progresscancel(ProgressCancelParams params);
  [JsonRpcMethod("webview/didDisposeNative")]
  void webviewdidDisposeNative(WebviewDidDisposeNativeParams params);
}
}
