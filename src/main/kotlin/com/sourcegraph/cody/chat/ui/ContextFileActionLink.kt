package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.project.Project
import com.intellij.ui.JBColor
import com.intellij.ui.components.AnActionLink
import com.sourcegraph.cody.agent.protocol.ContextItemFile
import java.awt.Color
import java.awt.Font
import java.awt.Graphics
import java.awt.font.TextAttribute

class ContextFileActionLink(
    project: Project,
    contextItemFile: ContextItemFile,
    anAction: AnAction
) : AnActionLink("", anAction) {
  private val localFileBackground = JBColor(Color(182, 210, 242), Color(56, 85, 112))
  private val isReferringToLocalFile = contextItemFile.isLocal()

  init {
    text = contextItemFile.getLinkActionText(project.basePath)
    font =
        when {
          contextItemFile.isIgnored == true || contextItemFile.isTooLarge == true ->
              Font(
                  super.getFont().attributes +
                      (TextAttribute.STRIKETHROUGH to TextAttribute.STRIKETHROUGH_ON))
          else -> super.getFont()
        }
    toolTipText =
        when {
          contextItemFile.isIgnored == true -> "File ignored by an admin setting"
          contextItemFile.isTooLarge == true -> "Excluded due to context window limit"
          else -> contextItemFile.uri.path
        }
  }

  override fun paintComponent(g: Graphics) {
    if (isReferringToLocalFile) {
      g.color = localFileBackground

      val fm = g.fontMetrics
      val rect = fm.getStringBounds(text, g)
      val textWidth = rect.width.toInt()
      g.fillRect(0, 0, textWidth, height)
    }
    super.paintComponent(g)
  }
}
