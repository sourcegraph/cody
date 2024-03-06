package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.Icons
import javax.swing.Icon

data class ChatModelsResponse(val models: List<ChatModelProvider>) {

  data class ChatModelProvider(
      val default: Boolean,
      val codyProOnly: Boolean,
      val provider: String?,
      val title: String?,
      val model: String
  ) {
    fun getIcon(): Icon? =
        when (provider) {
          "Anthropic" -> Icons.LLM.Anthropic
          "OpenAI" -> Icons.LLM.OpenAI
          "Mistral" -> Icons.LLM.Mistral
          else -> null
        }

    fun displayName(): String = buildString {
      if (title == null) {
        if (model.isNotBlank()) {
          append(model)
        } else {
          append("Default")
        }
      } else {
        append(title)
        provider?.let { append(" by $provider") }
      }
    }
  }
}
