package com.sourcegraph.cody.config

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.CodyToolWindowContent
import com.sourcegraph.cody.agent.protocol.RateLimitError
import com.sourcegraph.cody.statusbar.CodyAutocompleteStatusService
import com.sourcegraph.common.UpgradeToCodyProNotification

object RateLimitStateManager {

  fun invalidateForChat(project: Project) {
    if (UpgradeToCodyProNotification.chatRateLimitError.get() != null) {
      UpgradeToCodyProNotification.chatRateLimitError.set(null)
      CodyAutocompleteStatusService.resetApplication(project)
      ApplicationManager.getApplication().executeOnPooledThread {
        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshSubscriptionTab() }
      }
    }
  }

  fun reportForChat(project: Project, rateLimitError: RateLimitError) {
    if (UpgradeToCodyProNotification.chatRateLimitError.get() == null) {
      UpgradeToCodyProNotification.chatRateLimitError.set(rateLimitError)
      CodyAutocompleteStatusService.resetApplication(project)
      ApplicationManager.getApplication().executeOnPooledThread {
        CodyToolWindowContent.executeOnInstanceIfNotDisposed(project) { refreshSubscriptionTab() }
      }
    }
  }
}
