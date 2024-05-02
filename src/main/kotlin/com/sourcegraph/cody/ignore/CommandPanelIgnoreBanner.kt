package com.sourcegraph.cody.ignore

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.SideBorder
import com.intellij.ui.components.panels.NonOpaquePanel
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import java.awt.Dimension

class CommandPanelIgnoreBanner() : NonOpaquePanel() {
  init {
    ApplicationManager.getApplication().assertIsDispatchThread()

    add(
        EditorNotificationPanel().apply {
          text = CodyBundle.getString("ignore.sidebar-panel-ignored-file.text")
          createActionLabel(
              CodyBundle.getString("ignore.sidebar-panel-ignored-file.learn-more-cta"),
              { BrowserUtil.browse(CODY_IGNORE_DOCS_URL) },
              false)
          icon(Icons.CodyLogoSlash)
        })

    // These colors cribbed from EditorComposite, createTopBottomSideBorder
    val scheme = EditorColorsManager.getInstance().globalScheme
    val borderColor =
        scheme.getColor(EditorColors.SEPARATOR_ABOVE_COLOR)
            ?: scheme.getColor(EditorColors.TEARLINE_COLOR)
    border = SideBorder(borderColor, SideBorder.TOP or SideBorder.BOTTOM)
  }

  override fun getMaximumSize(): Dimension {
    val size = super.getMaximumSize()
    size.height = preferredSize.height
    return size
  }
}
