package com.sourcegraph.cody.agent

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.*
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.rd.util.firstOrNull
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.*
import com.sourcegraph.cody.auth.CodyAuthService
import com.sourcegraph.cody.auth.CodySecureStore
import com.sourcegraph.cody.auth.SourcegraphServerPath
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autoedit.AutoeditManager
import com.sourcegraph.cody.config.actions.OpenCodySettingsEditorAction
import com.sourcegraph.cody.edit.EditCommandPrompt
import com.sourcegraph.cody.edit.EditService
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.error.CodyConsole
import com.sourcegraph.cody.error.SentryService
import com.sourcegraph.cody.ignore.IgnoreOracle
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.cody.ui.web.NativeWebviewProvider
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind
import com.sourcegraph.common.BrowserOpener
import com.sourcegraph.common.NotificationGroups
import com.sourcegraph.common.ui.SimpleDumbAwareEDTAction
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.utils.CodyEditorUtil
import com.sourcegraph.utils.ThreadingUtil.runInBackground
import com.sourcegraph.utils.ThreadingUtil.runInEdtAndGet
import com.sourcegraph.utils.ThreadingUtil.runInEdtFuture
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture

/**
 * Implementation of the client part of the Cody agent protocol. This class dispatches the requests
 * and notifications sent by the agent.
 */
@Suppress("unused", "FunctionName")
class CodyAgentClient(private val project: Project, private val webview: NativeWebviewProvider) :
    com.sourcegraph.cody.agent.protocol_generated.CodyAgentClient {
  companion object {
    private val logger = Logger.getInstance(CodyAgentClient::class.java)
  }

  // =============
  // Requests
  // =============

  override fun env_openExternal(params: Env_OpenExternalParams): CompletableFuture<Boolean> {
    return runInEdtFuture {
      BrowserOpener.openInBrowser(project, params.uri)
      true
    }
  }

  override fun editTask_getUserInput(
      params: UserEditPromptRequest
  ): CompletableFuture<UserEditPromptResult?> {
    CodyEditorUtil.getSelectedEditors(project).firstOrNull()?.let { editor ->
      return runInEdtAndGet { EditCommandPrompt(project, editor, "Edit Code with Cody", params) }
          .getUserEditPromptResult()
    }
    return CompletableFuture.completedFuture(null)
  }

  override fun workspace_edit(params: WorkspaceEditParams): CompletableFuture<Boolean> {
    return runInEdtFuture {
      try {
        EditService.getInstance(project).performWorkspaceEdit(params)
      } catch (e: RuntimeException) {
        logger.error(e)
        false
      }
    }
  }

  override fun textDocument_edit(params: TextDocumentEditParams): CompletableFuture<Boolean> {
    return runInEdtFuture {
      try {
        EditService.getInstance(project).performTextEdits(params.uri, params.edits)
      } catch (e: RuntimeException) {
        logger.error(e)
        false
      }
    }
  }

  override fun textDocument_show(params: TextDocument_ShowParams): CompletableFuture<Boolean> {
    return runInBackground {
      val vf =
          runInEdtFuture { CodyEditorUtil.findFile(params.uri) }.get()
              ?: return@runInBackground false
      val selection = params.options?.selection
      val preserveFocus = params.options?.preserveFocus
      CodyEditorUtil.showDocument(project, vf, selection, preserveFocus)
    }
  }

  override fun textEditor_selection(params: TextEditor_SelectionParams): CompletableFuture<Null?> {
    return runInEdtFuture {
      CodyEditorUtil.selectAndScrollToRange(
          project, params.uri, params.selection, shouldScroll = false)
      return@runInEdtFuture null
    }
  }

  override fun textEditor_revealRange(
      params: TextEditor_RevealRangeParams
  ): CompletableFuture<Null?> {
    return runInEdtFuture {
      CodyEditorUtil.selectAndScrollToRange(project, params.uri, params.range, shouldScroll = true)
      return@runInEdtFuture null
    }
  }

  override fun textDocument_openUntitledDocument(
      params: UntitledTextDocument
  ): CompletableFuture<ProtocolTextDocument?> {
    return runInEdtFuture {
      val vf = CodyEditorUtil.createFileOrUseExisting(project, params.uri, params.content)
      vf?.let { ProtocolTextDocumentExt.fromVirtualFile(it) }
    }
  }

  override fun secrets_get(params: Secrets_GetParams): CompletableFuture<String?> {
    return runInBackground { CodySecureStore.getInstance().getFromSecureStore(params.key) }
  }

  override fun secrets_store(params: Secrets_StoreParams): CompletableFuture<Null?> {
    return runInBackground {
      CodySecureStore.getInstance().writeToSecureStore(params.key, params.value)
      null
    }
  }

  override fun secrets_delete(params: Secrets_DeleteParams): CompletableFuture<Null?> {
    return runInBackground {
      CodySecureStore.getInstance().writeToSecureStore(params.key, null)
      null
    }
  }

  override fun window_showSaveDialog(params: SaveDialogOptionsParams): CompletableFuture<String?> {
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

    return runInEdtFuture {
      val dialog = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
      val result = dialog.save(outputDir, fileName)
      result?.file?.path
    }
  }

  override fun window_didChangeContext(params: Window_DidChangeContextParams) {
    logger.debug("Received context change: ${params.key} = ${params.value}")
  }

  override fun window_focusSidebar(params: Null?) {
    // TODO: Implement this.
  }

  override fun authStatus_didUpdate(params: ProtocolAuthStatus) {
    if (project.isDisposed) return

    val authService = CodyAuthService.getInstance(project)
    if (params is ProtocolAuthenticatedAuthStatus) {
      SentryService.getInstance().setUser(params.primaryEmail, params.username)
      authService.setActivated(true, params.pendingValidation)
      authService.setEndpoint(SourcegraphServerPath(params.endpoint))
    } else if (params is ProtocolUnauthenticatedAuthStatus) {
      SentryService.getInstance().setUser(null, null)
      authService.setActivated(false, params.pendingValidation)
      authService.setEndpoint(SourcegraphServerPath(params.endpoint))
    }
    CodyStatusService.resetApplication(project)
  }

  override fun window_showMessage(params: ShowWindowMessageParams): CompletableFuture<String?> {
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
      notification.addAction(
          SimpleDumbAwareEDTAction(item) {
            selectedItem.complete(item)
            // The API does not allow us to handle multiple triggers of actions for the same
            // notifications
            // (either the same action, nor two different actions for a single notification).
            // Hence, we need to expire the notification on any action.
            notification.expire()
          })
    }
    notification.addAction(
        SimpleDumbAwareEDTAction("Dismiss") {
          notification.expire()
          selectedItem.complete(null)
        })

    notification.setIcon(Icons.SourcegraphLogo)
    notification.notify(project)

    return selectedItem
  }

  // =============
  // Notifications
  // =============

  override fun autocomplete_didHide(params: Null?) {
    AutoeditManager.getInstance(project).hide()
  }

  override fun autocomplete_didTrigger(params: Null?) {
    FileEditorManager.getInstance(project).selectedTextEditor?.let { editor ->
      ReadAction.run<Throwable> {
        CodyAutocompleteManager.getInstance(project)
            .triggerAutocomplete(
                editor, editor.caretModel.offset, InlineCompletionTriggerKind.AUTOMATIC)
      }
    }
  }

  override fun codeLenses_display(params: DisplayCodeLensParams) {
    runInEdt { LensesService.getInstance(project).updateLenses(params.uri, params.codeLenses) }
  }

  override fun ignore_didChange(params: Null?) {
    IgnoreOracle.getInstance(project).onIgnoreDidChange()
  }

  override fun debug_message(params: DebugMessage) {
    if (!project.isDisposed) {
      CodyConsole.getInstance(project).addMessage(params)
    }
  }

  override fun extensionConfiguration_didUpdate(params: ExtensionConfiguration_DidUpdateParams) {
    if (!project.isDisposed) {
      ConfigUtil.updateCustomConfiguration(project, params.key, params.value)
    }
  }

  override fun extensionConfiguration_openSettings(params: Null?) {
    if (!project.isDisposed) {
      val actionEvent =
          AnActionEvent(
              null,
              SimpleDataContext.getProjectContext(project),
              ActionPlaces.UNKNOWN,
              Presentation(),
              ActionManager.getInstance(),
              0)
      OpenCodySettingsEditorAction().actionPerformed(actionEvent)
    }
  }

  override fun progress_start(params: ProgressStartParams) {
    // TODO: Implement this.
  }

  override fun progress_report(params: ProgressReportParams) {
    // TODO: Implement this.
  }

  override fun progress_end(params: Progress_EndParams) {
    // TODO: Implement this.
  }

  // ================================================
  // Webviews, forwarded to the NativeWebviewProvider
  // ================================================

  override fun webview_postMessageStringEncoded(params: Webview_PostMessageStringEncodedParams) {
    webview.receivedPostMessage(params)
  }

  override fun webview_registerWebviewViewProvider(
      params: Webview_RegisterWebviewViewProviderParams
  ) {
    webview.registerViewProvider(params)
  }

  override fun webview_createWebviewPanel(params: Webview_CreateWebviewPanelParams) {
    webview.createPanel(params)
  }

  override fun webview_setHtml(params: Webview_SetHtmlParams) {
    webview.setHtml(params)
  }

  override fun webview_setIconPath(params: Webview_SetIconPathParams) {
    // TODO: Implement this.
  }

  override fun webview_setOptions(params: Webview_SetOptionsParams) {
    webview.setOptions(params)
  }

  override fun webview_setTitle(params: Webview_SetTitleParams) {
    webview.setTitle(params)
  }

  override fun webview_reveal(params: Webview_RevealParams) {
    // TODO: Implement this.
  }

  override fun webview_dispose(params: Webview_DisposeParams) {
    // TODO: Implement this.
  }
}
