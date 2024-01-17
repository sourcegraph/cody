package com.sourcegraph.cody.context

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.agent.CodyAgentCodebase
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetRepoIDResponse
import com.sourcegraph.cody.auth.ui.EditCodebaseContextAction
import com.sourcegraph.cody.chat.ChatUIConstants
import java.awt.Dimension
import java.awt.FlowLayout
import java.util.concurrent.CompletableFuture
import javax.swing.Box
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

class EmbeddingStatusView(private val project: Project) : JPanel() {
  private val embeddingStatusContent: JBLabel
  private val codebaseSelector: JButton
  private val openedFileContent: JBLabel
  private var embeddingStatus: EmbeddingStatus

  init {
    setLayout(FlowLayout(FlowLayout.LEFT))
    val innerPanel = Box.createHorizontalBox()
    embeddingStatusContent = JBLabel()
    codebaseSelector = JButton(EditCodebaseContextAction(project))

    openedFileContent = JBLabel()
    openedFileContent.text = "No file selected"
    embeddingStatus = EmbeddingStatusNotAvailableYet()
    updateViewBasedOnStatus()
    innerPanel.add(embeddingStatusContent)
    innerPanel.add(codebaseSelector)
    innerPanel.add(Box.createHorizontalStrut(5))
    innerPanel.add(openedFileContent)
    innerPanel.setBorder(
        EmptyBorder(
            JBUI.insets(
                ChatUIConstants.TEXT_MARGIN,
                ChatUIConstants.TEXT_MARGIN,
                0,
                ChatUIConstants.TEXT_MARGIN)))
    this.add(innerPanel)
    updateEmbeddingStatus()
    project.messageBus
        .connect()
        .subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER, CurrentlyOpenFileListener(project, this))
  }

  fun updateEmbeddingStatus() {
    val repoName = CodyAgentCodebase.getInstance(project).getUrl()
    if (repoName == null) {
      setEmbeddingStatus(NoGitRepositoryEmbeddingStatus())
    } else {
      CodyAgentService.applyAgentOnBackgroundThread(project) { agent ->
        agent.server.getRepoIdIfEmbeddingExists(GetRepoIDResponse(repoName)).thenApply {
            repoIdWithEmbeddings ->
          if (repoIdWithEmbeddings != null) {
            CompletableFuture.runAsync {
              setEmbeddingStatus(RepositoryIndexedEmbeddingStatus(repoName))
            }
          } else {
            agent.server.getRepoId(GetRepoIDResponse(repoName)).thenAccept { repoId ->
              if (repoId != null) {
                setEmbeddingStatus(RepositoryMissingEmbeddingStatus(repoName))
              } else {
                setEmbeddingStatus(RepositoryNotFoundOnSourcegraphInstance(repoName))
              }
            }
          }
        }
      }
    }
  }

  private fun updateViewBasedOnStatus() {
    ApplicationManager.getApplication().invokeLater {
      val codebaseName = embeddingStatus.getMainText()
      codebaseSelector.text = codebaseName.ifEmpty { "No repository" }
      val icon = embeddingStatus.getIcon()
      if (icon != null) {
        embeddingStatusContent.icon = icon
        embeddingStatusContent.preferredSize =
            Dimension(icon.iconWidth + 10, embeddingStatusContent.height)
      }
      val tooltip = embeddingStatus.getTooltip(project)
      if (tooltip.isNotEmpty()) {
        embeddingStatusContent.setToolTipText(tooltip)
      }
    }
  }

  private fun setEmbeddingStatus(embeddingStatus: EmbeddingStatus) {
    this.embeddingStatus = embeddingStatus
    updateViewBasedOnStatus()
  }

  fun setOpenedFileName(fileName: String, filePath: String?) {
    openedFileContent.text = fileName
    openedFileContent.toolTipText = filePath
  }
}
