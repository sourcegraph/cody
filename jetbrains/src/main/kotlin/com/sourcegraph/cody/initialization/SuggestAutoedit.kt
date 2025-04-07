package com.sourcegraph.cody.initialization

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationType
import com.intellij.notification.impl.NotificationFullContent
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.GetFeatureFlag.CodyAutoeditJetBrainsExperimentEnabledFeatureFlag
import com.sourcegraph.cody.config.actions.OpenCodySettingsEditorAction
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
                SuggestAutoeditNotification(project).notify(project)
              }
            }
      }
    }
  }
}

class SuggestAutoeditNotification(project: Project) :
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
            CodyBundle.getString("AutoeditSuggestionNotification.configure")) { _, _ ->
            })

    addAction(
        NotificationAction.createSimple(
            CodyBundle.getString("AutoeditSuggestionNotification.openFile")) {
              val anActionEvent =
                  AnActionEvent(
                      null,
                      SimpleDataContext.getProjectContext(project),
                      ActionPlaces.UNKNOWN,
                      Presentation(),
                      ActionManager.getInstance(),
                      0)
              OpenCodySettingsEditorAction().actionPerformed(anActionEvent)
            })
  }
}
