package com.sourcegraph.cody.ui.web

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.LightVirtualFile
import com.sourcegraph.cody.agent.protocol.WebviewCreateWebviewPanelParams
import java.util.concurrent.CompletableFuture

// Responsibilities:
// - Creates Webview panels (the ones that appear in the editor tabs) and the delegates to update
// them.
// - Closes Webview panels. Used when Agent stops.
internal class WebviewPanelManager(private val project: Project) {
  fun createPanel(proxy: WebUIProxy, params: WebviewCreateWebviewPanelParams): WebviewViewDelegate {
    val file = LightVirtualFile("Cody")
    file.fileType = WebPanelFileType.INSTANCE
    file.putUserData(WebPanelTabTitleProvider.WEB_PANEL_TITLE_KEY, params.title)
    file.putUserData(WebPanelEditor.WEB_UI_PROXY_KEY, proxy)
    FileEditorManager.getInstance(project).openFile(file, !params.showOptions.preserveFocus)
    return object : WebviewViewDelegate {
      override fun setTitle(newTitle: String) {
        runInEdt {
          runWriteAction {
            file.rename(this, newTitle)
            // TODO: Need to ping... something... to update the NavBarPanel.
            // SYNC_RESET should do it but that his a heavy-handed approach.
          }
          file.putUserData(WebPanelTabTitleProvider.WEB_PANEL_TITLE_KEY, newTitle)
          FileEditorManager.getInstance(project).updateFilePresentation(file)
        }
      }
    }
  }

  fun reset(): CompletableFuture<Void> {
    val result = CompletableFuture<Void>()
    runInEdt {
      try {
        if (project.isDisposed) {
          return@runInEdt
        }
        val fileEditorManager = FileEditorManager.getInstance(project)
        val openFiles = fileEditorManager.openFiles
        for (file in openFiles) {
          if (file.fileType == WebPanelFileType.INSTANCE) {
            fileEditorManager.closeFile(file)
          }
        }
      } finally {
        result.complete(null)
      }
    }
    return result
  }
}
