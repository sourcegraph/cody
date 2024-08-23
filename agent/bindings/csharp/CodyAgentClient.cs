using System.Threading.Tasks;

namespace Cody.Core.Agent.Protocol;
{

public interface CodyAgentClient
{
  // ========
  // Requests
  // ========
  [JsonRpcMethod("window/showMessage")]
  Task<string> WindowShowMessage(ShowWindowMessageParams params);
  [JsonRpcMethod("window/showSaveDialog")]
  Task<string> WindowShowSaveDialog(SaveDialogOptionsParams params);
  [JsonRpcMethod("textDocument/edit")]
  Task<bool> TextDocumentEdit(TextDocumentEditParams params);
  [JsonRpcMethod("textDocument/openUntitledDocument")]
  Task<ProtocolTextDocument> TextDocumentOpenUntitledDocument(UntitledTextDocument params);
  [JsonRpcMethod("textDocument/show")]
  Task<bool> TextDocumentShow(TextDocumentShowParams params);
  [JsonRpcMethod("workspace/edit")]
  Task<bool> WorkspaceEdit(WorkspaceEditParams params);
  [JsonRpcMethod("env/openExternal")]
  Task<bool> EnvOpenExternal(EnvOpenExternalParams params);

  // =============
  // Notifications
  // =============
  [JsonRpcMethod("debug/message")]
  void DebugMessage(DebugMessage params);
  [JsonRpcMethod("editTask/didUpdate")]
  void EditTaskDidUpdate(EditTask params);
  [JsonRpcMethod("editTask/didDelete")]
  void EditTaskDidDelete(EditTask params);
  [JsonRpcMethod("codeLenses/display")]
  void CodeLensesDisplay(DisplayCodeLensParams params);
  [JsonRpcMethod("ignore/didChange")]
  void IgnoreDidChange(Void params);
  [JsonRpcMethod("webview/postMessageStringEncoded")]
  void WebviewPostMessageStringEncoded(WebviewPostMessageStringEncodedParams params);
  [JsonRpcMethod("progress/start")]
  void ProgressStart(ProgressStartParams params);
  [JsonRpcMethod("progress/report")]
  void ProgressReport(ProgressReportParams params);
  [JsonRpcMethod("progress/end")]
  void ProgressEnd(ProgressEndParams params);
  [JsonRpcMethod("remoteRepo/didChange")]
  void RemoteRepoDidChange(Void params);
  [JsonRpcMethod("remoteRepo/didChangeState")]
  void RemoteRepoDidChangeState(RemoteRepoFetchState params);
  [JsonRpcMethod("webview/registerWebviewViewProvider")]
  void WebviewRegisterWebviewViewProvider(WebviewRegisterWebviewViewProviderParams params);
  [JsonRpcMethod("webview/createWebviewPanel")]
  void WebviewCreateWebviewPanel(WebviewCreateWebviewPanelParams params);
  [JsonRpcMethod("webview/dispose")]
  void WebviewDispose(WebviewDisposeParams params);
  [JsonRpcMethod("webview/reveal")]
  void WebviewReveal(WebviewRevealParams params);
  [JsonRpcMethod("webview/setTitle")]
  void WebviewSetTitle(WebviewSetTitleParams params);
  [JsonRpcMethod("webview/setIconPath")]
  void WebviewSetIconPath(WebviewSetIconPathParams params);
  [JsonRpcMethod("webview/setOptions")]
  void WebviewSetOptions(WebviewSetOptionsParams params);
  [JsonRpcMethod("webview/setHtml")]
  void WebviewSetHtml(WebviewSetHtmlParams params);
  [JsonRpcMethod("window/didChangeContext")]
  void WindowDidChangeContext(WindowDidChangeContextParams params);
}
}
