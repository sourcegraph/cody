package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.intellij.util.ui.JBInsets
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.ContextItem
import com.sourcegraph.cody.agent.protocol.ContextItemFile
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.chat.ChatUIConstants.ASSISTANT_MESSAGE_GRADIENT_WIDTH
import com.sourcegraph.cody.chat.ChatUIConstants.TEXT_MARGIN
import com.sourcegraph.cody.ui.AccordionSection
import com.sourcegraph.common.BrowserOpener.openInBrowser
import java.awt.BorderLayout
import java.awt.Insets
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

class ContextFilesPanel(
    val project: Project,
    chatMessage: ChatMessage,
) : PanelWithGradientBorder(ASSISTANT_MESSAGE_GRADIENT_WIDTH, Speaker.ASSISTANT) {
  init {
    this.layout = BorderLayout()
    isVisible = false

    updateContentWith(chatMessage.contextFiles)
  }

  fun updateContentWith(contextItems: List<ContextItem>?) {
    val contextItemFiles = contextItems?.mapNotNull { it as? ContextItemFile }

    if (contextItemFiles.isNullOrEmpty()) {
      return
    }

    val title = deriveAccordionTitle(contextItemFiles)
    val margin = JBInsets.create(Insets(TEXT_MARGIN, TEXT_MARGIN, TEXT_MARGIN, TEXT_MARGIN))
    val accordionSection = AccordionSection(title)
    accordionSection.isOpaque = false
    accordionSection.border = EmptyBorder(margin)
    contextItemFiles.forEachIndexed { index, contextFile: ContextItemFile ->
      val filePanel = createFileWithLinkPanel(contextFile)
      accordionSection.contentPanel.add(filePanel, index)
    }

    this.removeAll()
    this.isVisible = true
    add(accordionSection, BorderLayout.CENTER)
  }

  private fun deriveAccordionTitle(contextItemFiles: List<ContextItemFile>): String {
    val filteredFiles = contextItemFiles.distinctBy { it.uri }
    val prefix = "✨ Context: "
    val lineCount = contextItemFiles.sumOf { it.range?.length() ?: 0 }
    val fileCount = filteredFiles.size
    val lines = "$lineCount line${if (lineCount > 1) "s" else ""}"
    val files = "$fileCount file${if (fileCount > 1) "s" else ""}"
    val title =
        if (lineCount > 0) {
          "$lines from $files"
        } else {
          files
        }

    return "$prefix $title"
  }

  @RequiresEdt
  private fun createFileWithLinkPanel(contextItemFile: ContextItemFile): JPanel {
    val anAction =
        object : DumbAwareAction() {
          override fun actionPerformed(anActionEvent: AnActionEvent) {
            if (contextItemFile.isLocal()) {
              openInEditor(contextItemFile)
            } else {
              openInBrowser(project, contextItemFile.uri)
            }
          }
        }

    val goToFile = ContextFileActionLink(project, contextItemFile, anAction)
    val panel = JPanel(BorderLayout())
    panel.isOpaque = false
    panel.border = JBUI.Borders.empty(3, 3, 0, 0)
    panel.add(goToFile, BorderLayout.PAGE_START)
    return panel
  }

  private fun openInEditor(contextItemFile: ContextItemFile) {
    val logicalLine = contextItemFile.range?.start?.line ?: 0
    val contextFilePath = contextItemFile.getPath()
    ApplicationManager.getApplication().executeOnPooledThread {
      val findFileByNioFile = LocalFileSystem.getInstance().findFileByNioFile(contextFilePath)
      if (findFileByNioFile != null) {
        ApplicationManager.getApplication().invokeLater {
          OpenFileDescriptor(project, findFileByNioFile, logicalLine, /* logicalColumn= */ 0)
              .navigate(/* requestFocus= */ true)
        }
      }
    }
  }
}
