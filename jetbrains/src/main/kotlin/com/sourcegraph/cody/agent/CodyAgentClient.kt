package com.sourcegraph.cody.agent

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.diagnostic.debug
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.rd.util.firstOrNull
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.*
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.auth.CodySecureStore
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.cody.edit.EditService
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.error.CodyConsole
import com.sourcegraph.cody.error.SentryService
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.cody.ui.web.NativeWebviewProvider
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.NotificationGroups
import com.sourcegraph.common.ui.SimpleDumbAwareEDTAction
import com.sourcegraph.utils.CodyEditorUtil
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import org.eclipse.lsp4j.jsonrpc.services.JsonNotification
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest

/**
 * Implementation of the client part of the Cody agent protocol. This class dispatches the requests
 * and notifications sent by the agent.
 */
@Suppress("unused", "FunctionName")
class CodyAgentClient(private val project: Project, private val webview: NativeWebviewProvider) {
  companion object {
    private val logger = Logger.getInstance(CodyAgentClient::class.java)
  }

  /**
   * Helper to run client request/notification handlers on the IntelliJ event thread. Use this
   * helper for handlers that require access to the IntelliJ editor, for example to read the text
   * contents of the open editor.
   */
  private fun <R> acceptOnEventThreadAndGet(
      callback: (() -> R),
  ): CompletableFuture<R> {
    val result = CompletableFuture<R>()
    ApplicationManager.getApplication().invokeLater {
      try {
        result.complete(callback.invoke())
      } catch (e: Exception) {
        result.completeExceptionally(e)
      }
    }
    return result
  }

  // =============
  // Requests
  // =============

  @JsonRequest("env/openExternal")
  fun env_openExternal(params: Env_OpenExternalParams): CompletableFuture<Boolean> {
    return acceptOnEventThreadAndGet {
      BrowserOpener.openInBrowser(project, params.uri)
      true
    }
  }

  @JsonRequest("workspace/edit")
  fun workspace_edit(params: WorkspaceEditParams): CompletableFuture<Boolean> {
    return acceptOnEventThreadAndGet {
      try {
        EditService.getInstance(project).performWorkspaceEdit(params)
      } catch (e: RuntimeException) {
        logger.error(e)
        false
      }
    }
  }

  @JsonRequest("textDocument/edit")
  fun textDocument_edit(params: TextDocumentEditParams): CompletableFuture<Boolean> {
    return acceptOnEventThreadAndGet {
      try {
        EditService.getInstance(project).performTextEdits(params.uri, params.edits)
      } catch (e: RuntimeException) {
        logger.error(e)
        false
      }
    }
  }

  @JsonRequest("textDocument/show")
  fun textDocument_show(params: TextDocument_ShowParams): CompletableFuture<Boolean> {
    val vf =
        acceptOnEventThreadAndGet { CodyEditorUtil.findFileOrScratch(project, params.uri) }.get()

    val result =
        if (vf != null) {
          val selection = params.options?.selection
          val preserveFocus = params.options?.preserveFocus
          CodyEditorUtil.showDocument(project, vf, selection, preserveFocus)
        } else {
          false
        }

    return CompletableFuture.completedFuture(result)
  }

  @JsonRequest("textDocument/openUntitledDocument")
  fun textDocument_openUntitledDocument(
      params: UntitledTextDocument
  ): CompletableFuture<ProtocolTextDocument?> {
    return acceptOnEventThreadAndGet {
      val vf = CodyEditorUtil.createFileOrScratchFromUntitled(project, params.uri, params.content)
      vf?.let { ProtocolTextDocumentExt.fromVirtualFile(it) }
    }
  }

  @JsonRequest("secrets/get")
  fun secrets_get(params: Secrets_GetParams): CompletableFuture<String?> {
    return CompletableFuture.completedFuture(
        CodySecureStore.getInstance().getFromSecureStore(params.key))
  }

  @JsonRequest("secrets/store")
  fun secrets_store(params: Secrets_StoreParams): CompletableFuture<Null?> {
    CodySecureStore.getInstance().writeToSecureStore(params.key, params.value)
    return CompletableFuture.completedFuture(null)
  }

  @JsonRequest("secrets/delete")
  fun secrets_delete(params: Secrets_DeleteParams): CompletableFuture<Null?> {
    CodySecureStore.getInstance().writeToSecureStore(params.key, null)
    return CompletableFuture.completedFuture(null)
  }

  @JsonRequest("window/showSaveDialog")
  fun window_showSaveDialog(params: SaveDialogOptionsParams): CompletableFuture<String> {
    // Let's use the first possible extension as default.
    val ext = params.filters?.firstOrNull()?.value?.firstOrNull() ?: ""
    var fileName = "Untitled.$ext".removeSuffix(".")
    var outputDir: VirtualFile? =
        if (params.defaultUri != null) {
          val defaultUriPath = Paths.get(params.defaultUri)
          fileName = defaultUriPath.fileName.toString()
          VfsUtil.findFile(defaultUriPath.parent, true)
        } else {
          project.guessProjectDir()
        }

    if (outputDir == null || !outputDir.exists()) {
      outputDir = VfsUtil.getUserHomeDir()
    }

    val title = params.title ?: "Cody: Save as New File"
    val descriptor = FileSaverDescriptor(title, "Save file")

    val saveFileFuture = CompletableFuture<String>()
    runInEdt {
      val dialog = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
      val result = dialog.save(outputDir, fileName)
      saveFileFuture.complete(result?.file?.path)
    }

    return saveFileFuture
  }

  @JsonNotification("window/didChangeContext")
  fun window_didChangeContext(params: Window_DidChangeContextParams) {
    logger.debug("Received context change: ${params.key} = ${params.value}")
  }

  @JsonNotification("authStatus/didUpdate")
  fun authStatus_didUpdate(params: ProtocolAuthStatus) {
    runInEdt {
      if (project.isDisposed) return@runInEdt

      val authService = CodyAuthService.getInstance(project)
      if (params is ProtocolAuthenticatedAuthStatus) {
        SentryService.setUser(params.primaryEmail, params.username)
        authService.setActivated(true)
        authService.setEndpoint(SourcegraphServerPath(params.endpoint))
        CodyStatusService.resetApplication(project)
      } else if (params is ProtocolUnauthenticatedAuthStatus) {
        SentryService.setUser(null, null)
        authService.setActivated(false)
        authService.setEndpoint(SourcegraphServerPath(params.endpoint))
        CodyStatusService.resetApplication(project)
      }
    }
  }

  @JsonRequest("window/showMessage")
  fun window_showMessage(params: ShowWindowMessageParams): CompletableFuture<String?> {
    val severity =
        when (params.severity) {
          ShowWindowMessageParams.SeverityEnum.Error -> NotificationType.ERROR
          ShowWindowMessageParams.SeverityEnum.Warning -> NotificationType.WARNING
          ShowWindowMessageParams.SeverityEnum.Information -> NotificationType.INFORMATION
        }
    val notification =
        if (params.options?.detail != null)
            Notification(
                NotificationGroups.SOURCEGRAPH_ERRORS,
                params.message,
                params.options.detail,
                severity)
        else {
          Notification(NotificationGroups.SOURCEGRAPH_ERRORS, params.message, severity)
        }

    val selectedItem: CompletableFuture<String?> = CompletableFuture()
    params.items?.map { item ->
      notification.addAction(SimpleDumbAwareEDTAction(item) { selectedItem.complete(item) })
    }
    notification.addAction(
        SimpleDumbAwareEDTAction("Dismiss") {
          notification.expire()
          selectedItem.complete(null)
        })

    Notifications.Bus.notify(notification)
    notification.notify(project)

    return selectedItem
  }

  // =============
  // Notifications
  // =============

  @JsonNotification("codeLenses/display")
  fun codeLenses_display(params: DisplayCodeLensParams) {
    runInEdt { LensesService.getInstance(project).updateLenses(params.uri, params.codeLenses) }
  }

  @JsonNotification("ignore/didChange")
  fun ignore_didChange(params: Null?) {
    IgnoreOracle.getInstance(project).onIgnoreDidChange()
  }

  @JsonNotification("debug/message")
  fun debug_message(params: DebugMessage) {
    if (!project.isDisposed) {
      CodyConsole.getInstance(project).addMessage(params)
    }
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
}
