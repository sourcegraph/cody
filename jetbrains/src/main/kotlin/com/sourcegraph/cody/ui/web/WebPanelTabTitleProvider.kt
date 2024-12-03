package com.sourcegraph.cody.ui.web

import com.intellij.openapi.fileEditor.impl.EditorTabTitleProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile

/// Reads the title from the webview and presents it as the editor tab title.
class WebPanelTabTitleProvider : EditorTabTitleProvider, DumbAware {
  companion object {
    val WEB_PANEL_TITLE_KEY = Key.create<String>("WebViewTitle")
  }

  override fun getEditorTabTitle(project: Project, file: VirtualFile): String? {
    return file.getUserData(WEB_PANEL_TITLE_KEY) ?: ""
  }

  override fun getEditorTabTooltipText(project: Project, virtualFile: VirtualFile): String? {
    return getEditorTabTitle(project, virtualFile)
  }
}
