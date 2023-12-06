package com.sourcegraph.cody.config

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.statusbar.CodyAutocompleteStatusService
import com.sourcegraph.common.UpgradeToCodyProNotification

object RateLimitStateManager {

  fun invalidateForChat(project: Project) {
    if (UpgradeToCodyProNotification.chatRateLimitError) {
      UpgradeToCodyProNotification.chatRateLimitError = false
      CodyAutocompleteStatusService.resetApplication(project)
    }
  }

  fun reportForChat(project: Project) {
    if (!UpgradeToCodyProNotification.chatRateLimitError) {
      UpgradeToCodyProNotification.chatRateLimitError = true
      CodyAutocompleteStatusService.resetApplication(project)
    }
  }
}
