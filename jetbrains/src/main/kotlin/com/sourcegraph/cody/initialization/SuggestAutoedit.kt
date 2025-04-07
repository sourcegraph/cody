package com.sourcegraph.cody.initialization

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag.CodyAutoeditJetBrainsExperimentEnabledFeatureFlag
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups
import java.util.concurrent.CompletableFuture

class SuggestAutoedit(private val isDotcom: Boolean) : Activity {

  override fun runActivity(project: Project) {
    CodyAgentService.withAgent(project) {
      val isProOrEnterpriseFuture =
          if (isDotcom) {
            it.server.graphql_currentUserIsPro(null)
          } else CompletableFuture.completedFuture(true)

      isProOrEnterpriseFuture.thenAccept { isProOrEnterprise ->
        if (!isProOrEnterprise) return@thenAccept
        it.server
            .featureFlags_getFeatureFlag(CodyAutoeditJetBrainsExperimentEnabledFeatureFlag)
            .thenAccept { featureFlag ->
              if (featureFlag == true || true) {
                SuggestAutoeditNotification().notify(project)
              }
            }
      }
    }
  }
}

class SuggestAutoeditNotification :
    Notification(
        NotificationGroups.CODY_AUTH,
        CodyBundle.getString("AutoeditSuggestionNotification.title"),
        CodyBundle.getString("AutoeditSuggestionNotification.content"),
        NotificationType.INFORMATION),
    NotificationFullContent {

  init {
    icon = Icons.SourcegraphLogo

    addAction(
        NotificationAction.createExpiring(
            CodyBundle.getString("AutoeditSuggestionNotification.button")) { _, _ ->

            })
  }
}
