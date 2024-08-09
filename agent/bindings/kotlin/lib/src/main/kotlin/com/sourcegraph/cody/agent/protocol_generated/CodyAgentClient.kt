@file:Suppress("FunctionName", "ClassName", "RedundantNullable")
package com.sourcegraph.cody.agent.protocol_generated;

import org.eclipse.lsp4j.jsonrpc.services.JsonNotification;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import java.util.concurrent.CompletableFuture;

@Suppress("unused")
interface CodyAgentClient {
  // ========
  // Requests
  // ========
  @JsonRequest("window/showMessage")
  fun window_showMessage(params: ShowWindowMessageParams): CompletableFuture<String?>
  @JsonRequest("textDocument/edit")
  fun textDocument_edit(params: TextDocumentEditParams): CompletableFuture<Boolean>
  @JsonRequest("textDocument/openUntitledDocument")
  fun textDocument_openUntitledDocument(params: UntitledTextDocument): CompletableFuture<ProtocolTextDocument?>
  @JsonRequest("textDocument/show")
  fun textDocument_show(params: TextDocument_ShowParams): CompletableFuture<Boolean>
  @JsonRequest("workspace/edit")
  fun workspace_edit(params: WorkspaceEditParams): CompletableFuture<Boolean>
  @JsonRequest("env/openExternal")
  fun env_openExternal(params: Env_OpenExternalParams): CompletableFuture<Boolean>

  // =============
  // Notifications
  // =============
  @JsonNotification("debug/message")
  fun debug_message(params: DebugMessage)
  @JsonNotification("editTask/didUpdate")
  fun editTask_didUpdate(params: EditTask)
  @JsonNotification("editTask/didDelete")
  fun editTask_didDelete(params: EditTask)
  @JsonNotification("codeLenses/display")
  fun codeLenses_display(params: DisplayCodeLensParams)
  @JsonNotification("ignore/didChange")
  fun ignore_didChange(params: Null?)
  @JsonNotification("webview/postMessageStringEncoded")
  fun webview_postMessageStringEncoded(params: Webview_PostMessageStringEncodedParams)
  @JsonNotification("progress/start")
  fun progress_start(params: ProgressStartParams)
  @JsonNotification("progress/report")
  fun progress_report(params: ProgressReportParams)
  @JsonNotification("progress/end")
  fun progress_end(params: Progress_EndParams)
  @JsonNotification("remoteRepo/didChange")
  fun remoteRepo_didChange(params: Null?)
  @JsonNotification("remoteRepo/didChangeState")
  fun remoteRepo_didChangeState(params: RemoteRepoFetchState)
  @JsonNotification("webview/registerWebviewViewProvider")
  fun webview_registerWebviewViewProvider(params: Webview_RegisterWebviewViewProviderParams)
  @JsonNotification("webview/createWebviewPanel")
  fun webview_createWebviewPanel(params: Webview_CreateWebviewPanelParams)
  @JsonNotification("webview/dispose")
  fun webview_dispose(params: Webview_DisposeParams)
  @JsonNotification("webview/reveal")
  fun webview_reveal(params: Webview_RevealParams)
  @JsonNotification("webview/setTitle")
  fun webview_setTitle(params: Webview_SetTitleParams)
  @JsonNotification("webview/setIconPath")
  fun webview_setIconPath(params: Webview_SetIconPathParams)
  @JsonNotification("webview/setOptions")
  fun webview_setOptions(params: Webview_SetOptionsParams)
  @JsonNotification("webview/setHtml")
  fun webview_setHtml(params: Webview_SetHtmlParams)
}
