package com.sourcegraph.cody.auth

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.sourcegraph.config.ConfigUtil
import com.sourcegraph.config.ConfigUtil.isIntegrationTestModeEnabled
import com.sourcegraph.find.FindService

@Service(Service.Level.PROJECT)
class CodyAuthService(val project: Project) {

  @Volatile private var isActivated: Boolean = false
  @Volatile
  private var endpoint: SourcegraphServerPath = SourcegraphServerPath(ConfigUtil.DOTCOM_URL)

  fun isActivated(): Boolean {
    return isActivated
  }

  fun setActivated(isActivated: Boolean) {
    this.isActivated = isActivated
    if (isActivated && !isIntegrationTestModeEnabled())
        FindService.getInstance(project).refreshConfiguration()
  }

  fun getEndpoint(): SourcegraphServerPath {
    return endpoint
  }

  fun setEndpoint(endpoint: SourcegraphServerPath) {
    this.endpoint = endpoint
  }

  companion object {
    @JvmStatic
    fun getInstance(project: Project): CodyAuthService {
      return project.service<CodyAuthService>()
    }
  }
}
