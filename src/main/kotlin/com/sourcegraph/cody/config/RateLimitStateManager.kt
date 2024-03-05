package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.protocol.RateLimitError
import com.sourcegraph.cody.statusbar.CodyStatusService
import com.sourcegraph.common.UpgradeToCodyProNotification

object RateLimitStateManager {

  fun invalidateForChat(project: Project) {
    if (UpgradeToCodyProNotification.chatRateLimitError.get() != null) {
      UpgradeToCodyProNotification.chatRateLimitError.set(null)
      CodyStatusService.resetApplication(project)
      CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshMyAccountTab() }
    }
  }

  fun reportForChat(project: Project, rateLimitError: RateLimitError) {
    if (UpgradeToCodyProNotification.chatRateLimitError.get() == null) {
      UpgradeToCodyProNotification.chatRateLimitError.set(rateLimitError)
      CodyStatusService.resetApplication(project)
      CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshMyAccountTab() }
    }
  }
}
