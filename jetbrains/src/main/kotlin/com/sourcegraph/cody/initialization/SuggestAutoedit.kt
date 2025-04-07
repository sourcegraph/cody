package com.sourcegraph.cody.initialization

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag.CodyAutoeditJetBrainsExperimentEnabledFeatureFlag
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups
import java.util.concurrent.CompletableFuture

class SuggestAutoedit(val isDotcom: Boolean) : Activity {

  override fun runActivity(project: Project) {
    CodyAgentService.withAgent(project) {
      val isProOrEnterpriseFuture =
          if (isDotcom) {
            it.server.graphql_currentUserIsPro(null)
          } else CompletableFuture.completedFuture(true)

      it.server
          .featureFlags_getFeatureFlag(CodyAutoeditJetBrainsExperimentEnabledFeatureFlag)
          .thenCombine(isProOrEnterpriseFuture) { featureFlag, isProOrEnterprise ->
            if (isProOrEnterprise && featureFlag == true) {
              SuggestAutoeditNotification().notify(project)
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
        object : NotificationAction(CodyBundle.getString("AutoeditSuggestionNotification.button")) {
          override fun actionPerformed(anActionEvent: AnActionEvent, notification: Notification) {
            println("configure and restart")
          }
        })

    configureDoNotAskOption("autoedit-notification", "Don’t show again")
  }
}
