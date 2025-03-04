package com.sourcegraph.cody.config.migration

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.agent.protocol_extensions.isDeprecated
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsParams
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import com.sourcegraph.common.NotificationGroups
import java.util.concurrent.TimeUnit

object DeprecatedChatLlmMigration {

  fun migrate(project: Project) {
    CodyAgentService.withServer(project) { server ->
      val chatModels = server.chat_models(Chat_ModelsParams(ModelUsage.CHAT.value))
      val models =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get()?.models
              ?: return@withServer

      migrateHistory(
          HistoryService.getInstance(project).state.accountData,
          models.map { it.model },
          this::showLlmUpgradeNotification)
    }
  }

  fun migrateHistory(
      accountData: List<AccountData>,
      models: List<Model>,
      notify: (Set<String>) -> Unit
  ) {

    fun isDeprecated(modelState: LLMState): Boolean =
        models.firstOrNull { it.id == modelState.model }?.isDeprecated() ?: false

    val defaultModel = models.getOrNull(0) ?: return
    val migratedLlms = mutableSetOf<String>()
    accountData.forEach { accData ->
      accData.chats
          .mapNotNull { it.llm }
          .forEach { llm ->
            if (isDeprecated(llm)) {
              llm.title?.let { migratedLlms.add(it) }
              llm.model = defaultModel.id
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
