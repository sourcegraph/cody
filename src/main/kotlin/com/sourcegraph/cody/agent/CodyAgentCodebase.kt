package com.sourcegraph.cody.agent

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.config.CodyProjectSettings
import com.sourcegraph.common.ProjectFileUtils
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.vcs.RepoUtil

class CodyAgentCodebase(private val underlying: CodyAgentServer, val project: Project) {

  // TODO: Support list of repository names instead of just one.
  private val application = ApplicationManager.getApplication()
  private val settings = CodyProjectSettings.getInstance(project)
  private var inferredUrl: String? = null

  init {
    application.executeOnPooledThread {
      onRepositoryNameChange(RepoUtil.findRepositoryName(project, null))
    }
  }

  fun setUrl(url: String) {
    settings.remoteUrl = url
    onPropagateConfiguration()
  }

  fun getUrl(): String? = settings.remoteUrl ?: inferredUrl

  fun onFileOpened(project: Project, file: VirtualFile) {
    application.executeOnPooledThread {
      onRepositoryNameChange(RepoUtil.findRepositoryName(project, file))
      application.runReadAction {
        val openedFileName = file.name
        val relativeFilePath: String? = ProjectFileUtils.getRelativePathToProjectRoot(project, file)
        CodyToolWindowContent.getInstance(project)
            .embeddingStatusView
            .setOpenedFileName(openedFileName, relativeFilePath)
      }
    }
  }

  private fun onPropagateConfiguration() {
    CodyToolWindowContent.getInstance(project).embeddingStatusView.updateEmbeddingStatus()
    underlying.configurationDidChange(ConfigUtil.getAgentConfiguration(project))
  }

  private fun onRepositoryNameChange(repositoryName: String?) {
    application.invokeLater {
      if (repositoryName != null && inferredUrl != repositoryName) {
        inferredUrl = repositoryName
        onPropagateConfiguration()
      }
    }
  }
}
