package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.Icons
import javax.swing.Icon

data class ChatModelsResponse(val models: List<ChatModelProvider>) {
  data class ChatModelProvider(
      val provider: String?,
      val title: String?,
      val model: String,
      val tags: MutableList<String>? = mutableListOf(),
      val usage: MutableList<String>? = mutableListOf(),
      @Deprecated("No longer provided by agent") val default: Boolean = false,
      @Deprecated("No longer provided by agent") val codyProOnly: Boolean = false,
      @Deprecated("No longer provided by agent") val deprecated: Boolean = false
  ) {
    fun getIcon(): Icon? =
        when (provider) {
          "Anthropic" -> Icons.LLM.Anthropic
          "OpenAI" -> Icons.LLM.OpenAI
          "Mistral" -> Icons.LLM.Mistral
          "Google" -> Icons.LLM.Google
          "Ollama" -> Icons.LLM.Ollama
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

    public fun isCodyProOnly(): Boolean = tags?.contains("pro") ?: codyProOnly

    public fun isDeprecated(): Boolean = tags?.contains("deprecated") ?: deprecated
  }
}
