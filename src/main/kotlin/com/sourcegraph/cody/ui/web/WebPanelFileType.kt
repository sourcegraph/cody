package com.sourcegraph.cody.ui.web

import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.util.NlsContexts
import com.intellij.openapi.util.NlsSafe
import javax.swing.Icon

/// A file type which causes a WebPanelEditor to be created to 'edit' the file and present a Webview
// panel.
class WebPanelFileType : FileType {
  companion object {
    @JvmStatic val INSTANCE = WebPanelFileType()
  }

  override fun getName(): String {
    return "SourcegraphWebPanel"
  }

  override fun getDescription(): @NlsContexts.Label String {
    return "Sourcegraph Cody Web Panel"
  }

  override fun getDefaultExtension(): @NlsSafe String {
    return ""
  }

  override fun getIcon(): Icon? {
    return null
  }

  override fun isBinary(): Boolean {
    return true
  }
}
