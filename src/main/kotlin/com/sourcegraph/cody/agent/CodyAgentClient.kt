package com.sourcegraph.cody.agent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.sourcegraph.cody.agent.protocol.DebugMessage
import com.sourcegraph.cody.agent.protocol.OpenExternalParams
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.RemoteRepoFetchState
import com.sourcegraph.cody.agent.protocol.TextDocumentShowParams
import com.sourcegraph.cody.agent.protocol.UntitledTextDocument
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol_generated.DisplayCodeLensParams
import com.sourcegraph.cody.agent.protocol_generated.EditTask
import com.sourcegraph.cody.agent.protocol_generated.TextDocumentEditParams
import com.sourcegraph.cody.agent.protocol_generated.WorkspaceEditParams
import com.sourcegraph.cody.ui.NativeWebviewProvider
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

/**
 * Implementation of the client part of the Cody agent protocol. This class dispatches the requests
 * and notifications sent by the agent.
 */
@Suppress("unused")
class CodyAgentClient(private val webview: NativeWebviewProvider) {
  companion object {
    private val logger = Logger.getInstance(CodyAgentClient::class.java)
  }

  // TODO: Remove this once we stop sniffing postMessage.
  // Callback that is invoked when the agent sends a "chat/updateMessageInProgress" notification.
  var onNewMessage: ((WebviewPostMessageParams) -> Unit)? = null

  // Callback that is invoked when the agent sends a "setConfigFeatures" message.
  var onSetConfigFeatures: ConfigFeaturesObserver? = null

  // Callback that is invoked on webview messages which aren't handled by onNewMessage or
  // onSetConfigFeatures
  var onReceivedWebviewMessageTODODeleteThis: ((WebviewPostMessageParams) -> Unit)? = null

  // Callback for the "editTask/didUpdate" notification from the agent.
  var onEditTaskDidUpdate: ((EditTask) -> Unit)? = null

  // Callback for the "editTask/didDelete" notification from the agent.
  var onEditTaskDidDelete: ((EditTask) -> Unit)? = null

  // Callback for the "editTask/codeLensesDisplay" notification from the agent.
  var onCodeLensesDisplay: ((DisplayCodeLensParams) -> Unit)? = null

  // Callback for the "textDocument/edit" request from the agent.
  var onTextDocumentEdit: ((TextDocumentEditParams) -> Boolean)? = null

  // Callback for the "textDocument/show" request from the agent.
  var onTextDocumentShow: ((TextDocumentShowParams) -> Boolean)? = null

  // Callback for the "textDocument/openUntitledDocument" request from the agent.
  var onOpenUntitledDocument: ((UntitledTextDocument) -> ProtocolTextDocument)? = null

  // Callback for the "workspace/edit" request from the agent.
  var onWorkspaceEdit: ((WorkspaceEditParams) -> Boolean)? = null

  var onDebugMessage: ((DebugMessage) -> Unit)? = null

  @JsonNotification("editTask/didUpdate")
  fun editTaskDidUpdate(params: EditTask): CompletableFuture<Unit> =
      acceptOnEventThread("editTask/didUpdate", onEditTaskDidUpdate, params)

  @JsonNotification("editTask/didDelete")
  fun editTaskDidDelete(params: EditTask): CompletableFuture<Unit> =
      acceptOnEventThread("editTask/didDelete", onEditTaskDidDelete, params)

  @JsonNotification("codeLenses/display")
  fun codeLensesDisplay(params: DisplayCodeLensParams): CompletableFuture<Unit> =
      acceptOnEventThread("codeLenses/display", onCodeLensesDisplay, params)

  var onOpenExternal: ((OpenExternalParams) -> Boolean)? = null

  @JsonRequest("env/openExternal")
  fun ignoreTest(params: OpenExternalParams): CompletableFuture<Boolean> =
      acceptOnEventThreadAndGet("env/openExternal", onOpenExternal, params)

  var onRemoteRepoDidChange: (() -> Unit)? = null

  @JsonNotification("remoteRepo/didChange")
  fun remoteRepoDidChange() {
    onRemoteRepoDidChange?.invoke()
  }

  var onRemoteRepoDidChangeState: ((RemoteRepoFetchState) -> Unit)? = null

  @JsonNotification("remoteRepo/didChangeState")
  fun remoteRepoDidChangeState(state: RemoteRepoFetchState) {
    onRemoteRepoDidChangeState?.invoke(state)
  }

  var onIgnoreDidChange: (() -> Unit)? = null

  @JsonNotification("ignore/didChange")
  fun ignoreDidChange() {
    onIgnoreDidChange?.invoke()
  }

  @JsonRequest("textDocument/edit")
  fun textDocumentEdit(params: TextDocumentEditParams): CompletableFuture<Boolean> =
      acceptOnEventThreadAndGet("textDocument/edit", onTextDocumentEdit, params)

  @JsonRequest("textDocument/show")
  fun textDocumentShow(params: TextDocumentShowParams): CompletableFuture<Boolean> =
      acceptOnEventThreadAndGet("textDocument/show", onTextDocumentShow, params)

  @JsonRequest("textDocument/openUntitledDocument")
  fun openUntitledDocument(params: UntitledTextDocument): CompletableFuture<ProtocolTextDocument> =
      if (onOpenUntitledDocument == null) {
        CompletableFuture.failedFuture(
            Exception("No callback registered for textDocument/openUntitledDocument"))
      } else {
        CompletableFuture.completedFuture(onOpenUntitledDocument!!.invoke(params))
      }

  @JsonRequest("workspace/edit")
  fun workspaceEdit(params: WorkspaceEditParams): CompletableFuture<Boolean> =
      acceptOnEventThreadAndGet("workspace/edit", onWorkspaceEdit, params)

  /**
   * Helper to run client request/notification handlers on the IntelliJ event thread. Use this
   * helper for handlers that require access to the IntelliJ editor, for example to read the text
   * contents of the open editor.
   */
  private fun <T, R> acceptOnEventThreadAndGet(
      name: String,
      callback: ((T) -> R)?,
      params: T
  ): CompletableFuture<R> {
    val result = CompletableFuture<R>()
    ApplicationManager.getApplication().invokeLater {
      try {
        if (callback != null) {
          result.complete(callback.invoke(params))
        } else {
          result.completeExceptionally(Exception("No callback registered for $name"))
        }
      } catch (e: Exception) {
        result.completeExceptionally(e)
      }
    }
    return result
  }

  private fun <T, R> acceptOnEventThread(
      name: String,
      callback: ((T) -> R)?,
      params: T
  ): CompletableFuture<R> {
    val fun1: ((T) -> R)? = callback?.let { cb -> { t: T -> cb.invoke(t) } }
    return acceptOnEventThreadAndGet(name, fun1, params)
  }

  // TODO: Delete this
  // Webviews
  @JsonRequest("webview/create")
  fun webviewCreate(params: WebviewCreateParams): CompletableFuture<Void> {
    logger.error("webview/create This request should not happen if you are using chat/new.")
    return CompletableFuture.completedFuture(null)
  }

  // =============
  // Notifications
  // =============

  @JsonNotification("debug/message")
  fun debugMessage(msg: DebugMessage) {
    logger.warn("${msg.channel}: ${msg.message}")
    onDebugMessage?.invoke(msg)
  }

  // ================================================
  // Webviews, forwarded to the NativeWebviewProvider
  // ================================================

  @JsonNotification("webview/createWebviewPanel")
  fun webviewCreateWebviewPanel(params: WebviewCreateWebviewPanelParams) {
    webview.createPanel(params)
  }

  @JsonNotification("webview/postMessageStringEncoded")
  fun webviewPostMessageStringEncoded(params: WebviewPostMessageStringEncodedParams) {
    webview.receivedPostMessage(params)
  }

  @JsonNotification("webview/registerWebviewViewProvider")
  fun webviewRegisterWebviewViewProvider(params: WebviewRegisterWebviewViewProviderParams) {
    webview.registerViewProvider(params)
  }

  @JsonNotification("webview/setHtml")
  fun webviewSetHtml(params: WebviewSetHtmlParams) {
    webview.setHtml(params)
  }

  @JsonNotification("webview/setIconPath")
  fun webviewSetIconPath(params: WebviewSetIconPathParams) {
    // TODO: Implement this.
    println("TODO, implement webview/setIconPath")
  }

  @JsonNotification("webview/setOptions")
  fun webviewSetOptions(params: WebviewSetOptionsParams) {
    webview.setOptions(params)
  }

  @JsonNotification("webview/setTitle")
  fun webviewSetTitle(params: WebviewSetTitleParams) {
    webview.setTitle(params)
  }

  @JsonNotification("webview/reveal")
  fun webviewReveal(params: WebviewRevealParams) {
    // TODO: Implement this.
    println("TODO, implement webview/reveal")
  }

  @JsonNotification("webview/dispose")
  fun webviewDispose(params: WebviewDisposeParams) {
    // TODO: Implement this.
    println("TODO, implement webview/dispose")
  }

  // TODO: Remove this
  @JsonNotification("webview/postMessage")
  fun webviewPostMessage(params: WebviewPostMessageParams) {
    val extensionMessage = params.message

    if (onNewMessage != null && extensionMessage.type == ExtensionMessage.Type.TRANSCRIPT) {
      ApplicationManager.getApplication().invokeLater { onNewMessage?.invoke(params) }
      return
    }

    if (onSetConfigFeatures != null &&
        extensionMessage.type == ExtensionMessage.Type.SET_CONFIG_FEATURES) {
      ApplicationManager.getApplication().invokeLater {
        onSetConfigFeatures?.update(extensionMessage.configFeatures)
      }
      return
    }

    if (onReceivedWebviewMessageTODODeleteThis != null) {
      ApplicationManager.getApplication().invokeLater {
        onReceivedWebviewMessageTODODeleteThis?.invoke(params)
      }
      return
    }

    logger.debug("webview/postMessage ${params.id}: ${params.message}")
  }
}
