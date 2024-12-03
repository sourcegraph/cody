package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag
import com.sourcegraph.cody.agent.protocol_generated.Model

@Tag("llm")
class LLMState : BaseState() {
  @get:OptionTag(tag = "model", nameAttribute = "") var model: String? by string()

  @get:OptionTag(tag = "title", nameAttribute = "") var title: String? by string()

  @get:OptionTag(tag = "provider", nameAttribute = "") var provider: String? by string()

  @get:OptionTag(tag = "tags", nameAttribute = "") var tags: MutableList<String> by list()

  @get:OptionTag(tag = "usage", nameAttribute = "") var usage: MutableList<String> by list()

  companion object {
    fun fromChatModel(chatModel: Model): LLMState {
      return LLMState().also {
        it.model = chatModel.id
        it.title = chatModel.title
        it.provider = chatModel.provider
        it.tags = chatModel.tags?.toMutableList() ?: mutableListOf()
        it.usage = chatModel.usage.toMutableList()
      }
    }
  }
}
