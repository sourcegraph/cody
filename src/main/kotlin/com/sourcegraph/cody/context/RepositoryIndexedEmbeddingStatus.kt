package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.Icons
import javax.swing.Icon

class RepositoryIndexedEmbeddingStatus(repoName: String) : RepoAvailableEmbeddingStatus(repoName) {
  override fun getIcon(): Icon = Icons.Repository.Indexed

  override fun getTooltip(project: Project): String {
    return "Repository is indexed"
  }
}
