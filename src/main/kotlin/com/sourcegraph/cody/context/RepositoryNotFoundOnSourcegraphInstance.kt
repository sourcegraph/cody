package com.sourcegraph.cody.context

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.config.AccountType
import com.sourcegraph.cody.config.CodyAuthenticationManager
import javax.swing.Icon

class RepositoryNotFoundOnSourcegraphInstance(private val repoName: String) :
    RepoAvailableEmbeddingStatus(repoName) {
  override fun getIcon(): Icon = Icons.Repository.NotFoundOnInstance

  override fun getTooltip(project: Project): String {
    val activeAccountType = CodyAuthenticationManager.instance.getActiveAccountType(project)
    return if (activeAccountType == AccountType.DOTCOM) {
      "$repoName not found on Sourcegraph.com. Support for private repos coming soon"
    } else {
      "Repository $repoName was not found on this Sourcegraph instance"
    }
  }
}
