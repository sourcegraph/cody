package com.sourcegraph.cody.chat

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgent
import com.sourcegraph.cody.agent.protocol.ChatMessage
import com.sourcegraph.cody.agent.protocol.Speaker
import com.sourcegraph.cody.chat.AgentChatSession.Companion.restoreChatSession
import com.sourcegraph.cody.config.CodyAuthenticationManager
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.MessageState
import com.sourcegraph.cody.initialization.EndOfTrialNotificationScheduler
import com.sourcegraph.cody.vscode.CancellationToken
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.NotificationGroups
import java.util.concurrent.TimeUnit

class ExportChatsBackgroundable(
    project: Project,
    private val agent: CodyAgent,
    private val internalId: String?,
    private val onSuccess: (Any) -> Unit,
    private val cancellationToken: CancellationToken
) : Task.Backgroundable(project, /* title = */ "Exporting chats...", /* canBeCancelled = */ true) {

  override fun run(indicator: ProgressIndicator) {
    indicator.isIndeterminate = false

    val accountId = CodyAuthenticationManager.getInstance(project).getActiveAccount()?.id
    val chats =
        HistoryService.getInstance(project)
            .state
            .chats
            .filter { it.accountId == accountId }
            .filter { it.messages.isNotEmpty() }
            .filter { it.internalId != null }
            .filter { chat -> if (internalId != null) chat.internalId == internalId else true }

    chats.forEachIndexed { index, chatState ->
      val chatMessages =
          chatState.messages.map { message ->
            val parsed =
                when (val speaker = message.speaker) {
                  MessageState.SpeakerState.HUMAN -> Speaker.HUMAN
                  MessageState.SpeakerState.ASSISTANT -> Speaker.ASSISTANT
                  else -> error("unrecognized speaker $speaker")
                }

            ChatMessage(speaker = parsed, message.text)
          }

      restoreChatSession(agent, chatMessages, chatModelProvider = null, chatState.internalId!!)
      indicator.fraction = ((index + 1.0) / (chats.size + 1.0))

      if (indicator.isCanceled) {
        return
      }
    }

    val result = agent.server.chatExport().completeOnTimeout(null, 15, TimeUnit.SECONDS).get()
    if (indicator.isCanceled) {
      return
    }

    if (result != null) {
      if (internalId != null) {
        val singleChatHistory = result.find { it.chatID == internalId }
        if (singleChatHistory != null) {
          onSuccess.invoke(singleChatHistory)
        } else {
          logger.warn("export failed: singleChatHistory is null")

          val notification =
              Notification(
                  NotificationGroups.TOOLWINDOW,
                  CodyBundle.getString("export.failed"),
                  "",
                  NotificationType.WARNING)
          notification.notify(project)
        }
      } else {
        onSuccess.invoke(result)
      }
    } else {
      logger.warn("export failed: result is null")

      val notification =
          Notification(
              NotificationGroups.TOOLWINDOW,
              CodyBundle.getString("export.timed-out"),
              "",
              NotificationType.WARNING)
      notification.notify(project)
    }
  }

  override fun onCancel() {
    super.onCancel()
    cancellationToken.abort()
  }

  override fun onFinished() {
    super.onFinished()
    cancellationToken.dispose()
  }

  companion object {
    private val logger = Logger.getInstance(EndOfTrialNotificationScheduler::class.java)
  }
}
