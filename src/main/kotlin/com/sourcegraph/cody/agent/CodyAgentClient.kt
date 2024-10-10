package com.sourcegraph.cody.agent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.rd.util.firstOrNull
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import com.sourcegraph.cody.agent.protocol_generated.DebugMessage
import com.sourcegraph.cody.agent.protocol_generated.DisplayCodeLensParams
import com.sourcegraph.cody.agent.protocol_generated.Env_OpenExternalParams
import com.sourcegraph.cody.agent.protocol_generated.Null
import com.sourcegraph.cody.agent.protocol_generated.SaveDialogOptionsParams
import com.sourcegraph.cody.agent.protocol_generated.TextDocumentEditParams
import com.sourcegraph.cody.agent.protocol_generated.TextDocument_ShowParams
import com.sourcegraph.cody.agent.protocol_generated.UntitledTextDocument
import com.sourcegraph.cody.agent.protocol_generated.WorkspaceEditParams
import com.sourcegraph.cody.edit.EditService
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.error.CodyConsole
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.ui.web.NativeWebviewProvider
import com.sourcegraph.common.BrowserOpener
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
      vf?.let { ProtocolTextDocument.fromVirtualFile(it) }
    }
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
}
