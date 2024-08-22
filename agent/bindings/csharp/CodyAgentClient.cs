using System.Threading.Tasks;

namespace Cody.Core.Agent.Protocol;
{

public interface CodyAgentClient
{
  // ========
  // Requests
  // ========
  [JsonRpcMethod("window/showMessage")]
  Task<string> windowshowMessage(ShowWindowMessageParams params);
  [JsonRpcMethod("window/showSaveDialog")]
  Task<string> windowshowSaveDialog(SaveDialogOptionsParams params);
  [JsonRpcMethod("textDocument/edit")]
  Task<bool> textDocumentedit(TextDocumentEditParams params);
  [JsonRpcMethod("textDocument/openUntitledDocument")]
  Task<ProtocolTextDocument> textDocumentopenUntitledDocument(UntitledTextDocument params);
  [JsonRpcMethod("textDocument/show")]
  Task<bool> textDocumentshow(TextDocumentShowParams params);
  [JsonRpcMethod("workspace/edit")]
  Task<bool> workspaceedit(WorkspaceEditParams params);
  [JsonRpcMethod("env/openExternal")]
  Task<bool> envopenExternal(EnvOpenExternalParams params);

  // =============
  // Notifications
  // =============
  [JsonRpcMethod("debug/message")]
  void debugmessage(DebugMessage params);
  [JsonRpcMethod("editTask/didUpdate")]
  void editTaskdidUpdate(EditTask params);
  [JsonRpcMethod("editTask/didDelete")]
  void editTaskdidDelete(EditTask params);
  [JsonRpcMethod("codeLenses/display")]
  void codeLensesdisplay(DisplayCodeLensParams params);
  [JsonRpcMethod("ignore/didChange")]
  void ignoredidChange(Void params);
  [JsonRpcMethod("webview/postMessageStringEncoded")]
  void webviewpostMessageStringEncoded(WebviewPostMessageStringEncodedParams params);
  [JsonRpcMethod("progress/start")]
  void progressstart(ProgressStartParams params);
  [JsonRpcMethod("progress/report")]
  void progressreport(ProgressReportParams params);
  [JsonRpcMethod("progress/end")]
  void progressend(ProgressEndParams params);
  [JsonRpcMethod("remoteRepo/didChange")]
  void remoteRepodidChange(Void params);
  [JsonRpcMethod("remoteRepo/didChangeState")]
  void remoteRepodidChangeState(RemoteRepoFetchState params);
  [JsonRpcMethod("webview/registerWebviewViewProvider")]
  void webviewregisterWebviewViewProvider(WebviewRegisterWebviewViewProviderParams params);
  [JsonRpcMethod("webview/createWebviewPanel")]
  void webviewcreateWebviewPanel(WebviewCreateWebviewPanelParams params);
  [JsonRpcMethod("webview/dispose")]
  void webviewdispose(WebviewDisposeParams params);
  [JsonRpcMethod("webview/reveal")]
  void webviewreveal(WebviewRevealParams params);
  [JsonRpcMethod("webview/setTitle")]
  void webviewsetTitle(WebviewSetTitleParams params);
  [JsonRpcMethod("webview/setIconPath")]
  void webviewsetIconPath(WebviewSetIconPathParams params);
  [JsonRpcMethod("webview/setOptions")]
  void webviewsetOptions(WebviewSetOptionsParams params);
  [JsonRpcMethod("webview/setHtml")]
  void webviewsetHtml(WebviewSetHtmlParams params);
  [JsonRpcMethod("window/didChangeContext")]
  void windowdidChangeContext(WindowDidChangeContextParams params);
}
}
