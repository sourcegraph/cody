package com.sourcegraph.cody.config.migration

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ChatModelsParams
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.LLMState
import java.util.concurrent.TimeUnit

object ChatTagsLlmMigration {

  fun migrate(project: Project) {
    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chatModels(ChatModelsParams(ModelUsage.CHAT.value))
      val models =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get()?.models ?: return@withAgent
      migrateHistory(HistoryService.getInstance(project).state.accountData, models)
    }
  }

  fun migrateHistory(
      accountData: List<AccountData>,
      models: List<ChatModelsResponse.ChatModelProvider>,
  ) {
    accountData.forEach { accData ->
      accData.chats
          .mapNotNull { it.llm }
          .forEach { llm ->
            val model = models.find { it.model == llm.model }
            llm.usage = model?.usage ?: mutableListOf("chat", "edit")
            llm.tags = model?.tags ?: mutableListOf()

            addTagIf(llm, "deprecated", model?.deprecated)
            addTagIf(llm, "pro", model?.codyProOnly)
          }
    }
  }

  fun addTagIf(llm: LLMState, tag: String, condition: Boolean?) {
    if (condition ?: false && !llm.tags.contains(tag)) {
      llm.tags.add(tag)
    }
  }
}
