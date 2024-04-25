package com.sourcegraph.cody.ignore

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotificationProvider
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol.ProtocolTextDocument
import java.util.function.Function
import javax.swing.JComponent

const val CODY_IGNORE_DOCS_URL = "https://sourcegraph.com/docs/cody/capabilities/ignore-context"

class IgnoreNotificationProvider : EditorNotificationProvider, DumbAware {
  override fun collectNotificationData(
      project: Project,
      file: VirtualFile
  ): Function<in FileEditor, out JComponent?> {
    val policy =
        IgnoreOracle.getInstance(project).policyForUri(ProtocolTextDocument.uriFor(file)).get()
    if (policy == IgnorePolicy.USE) {
      return Function { null }
    }
    return Function {
      EditorNotificationPanel(it).apply {
        icon(Icons.CodyLogoSlash)
        // TODO: This message is specific to the enterprise product and needs to be changed when we
        // support cody ignore in the self-serve product
        text = "Cody ignores this file because of your admin policy"

        createActionLabel(
            "Learn more", Runnable { BrowserUtil.browse(CODY_IGNORE_DOCS_URL) }, false)
      }
    }
  }
}
