package com.sourcegraph.cody.config.migration

import com.intellij.openapi.project.Project
import com.sourcegraph.cody.agent.CodyAgentService
import com.sourcegraph.cody.agent.protocol.ModelUsage
import com.sourcegraph.cody.agent.protocol_extensions.isCodyProOnly
import com.sourcegraph.cody.agent.protocol_extensions.isDeprecated
import com.sourcegraph.cody.agent.protocol_generated.Chat_ModelsParams
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.LLMState
import java.util.concurrent.TimeUnit

object ChatTagsLlmMigration {

  fun migrate(project: Project) {
    CodyAgentService.withAgent(project) { agent ->
      val chatModels = agent.server.chat_models(Chat_ModelsParams(ModelUsage.CHAT.value))
      val models =
          chatModels.completeOnTimeout(null, 10, TimeUnit.SECONDS).get()?.models ?: return@withAgent

      migrateHistory(HistoryService.getInstance(project).state.accountData, models.map { it.model })
    }
  }

  fun migrateHistory(
      accountData: List<AccountData>,
      models: List<Model>,
  ) {
    accountData.forEach { accData ->
      accData.chats
          .mapNotNull { it.llm }
          .forEach { llm ->
            val model = models.find { it.id == llm.model }
            llm.usage = model?.usage?.toMutableList() ?: mutableListOf("chat", "edit")
            llm.tags = model?.tags?.toMutableList() ?: mutableListOf()

            addTagIf(llm, "deprecated", model?.isDeprecated())
            addTagIf(llm, "pro", model?.isCodyProOnly())
          }
    }
  }

  private fun addTagIf(llm: LLMState, tag: String, condition: Boolean?) {
    if (condition == true && !llm.tags.contains(tag)) {
      llm.tags.add(tag)
    }
  }
}
