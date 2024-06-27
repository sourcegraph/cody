package com.sourcegraph.cody.config.migration

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.NotificationGroups
import java.util.concurrent.TimeUnit

object DeprecatedChatLlmMigration {

  fun migrate(project: Project) {
    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chatModels(ChatModelsParams(ModelUsage.CHAT.value))
      val models =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get()?.models ?: return@withAgent
      migrateHistory(
          HistoryService.getInstance(project).state.accountData,
          models,
          this::showLlmUpgradeNotification)
    }
  }

  fun migrateHistory(
      accountData: List<AccountData>,
      models: List<ChatModelsResponse.ChatModelProvider>,
      notify: (Set<String>) -> Unit
  ) {

    val defaultModel = models.find { it.default } ?: return

    fun isDeprecated(modelState: LLMState): Boolean =
        models.firstOrNull { it.model == modelState.model }?.deprecated ?: false

    val migratedLlms = mutableSetOf<String>()
    accountData.forEach { accData ->
      accData.chats
          .mapNotNull { it.llm }
          .forEach { llm ->
            if (isDeprecated(llm)) {
              llm.title?.let { migratedLlms.add(it) }
              llm.model = defaultModel.model
              llm.title = defaultModel.title
              llm.provider = defaultModel.provider
            }
          }
    }

    if (migratedLlms.isNotEmpty()) {
      notify(migratedLlms)
    }
  }

  private fun showLlmUpgradeNotification(migratedLlms: Set<String>) {
    ApplicationManager.getApplication().invokeLater {
      val title = CodyBundle.getString("settings.migration.llm-upgrade-notification.title")
      val msg =
          CodyBundle.getString("settings.migration.llm-upgrade-notification.body")
              .fmt(migratedLlms.joinToString("</li><li>", "<li>", "</li>"))

      val notification =
          Notification(NotificationGroups.CODY_UPDATES, title, msg, NotificationType.INFORMATION)
      notification.setIcon(Icons.CodyLogo)
      Notifications.Bus.notify(notification)
    }
  }
}
