package com.sourcegraph.cody.agent.protocol_extensions

import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol_generated.Model
import javax.swing.Icon

fun Model.getIcon(): Icon? =
    when (provider?.lowercase()) {
      "anthropic" -> Icons.LLM.Anthropic
      "openai" -> Icons.LLM.OpenAI
      "mistral" -> Icons.LLM.Mistral
      "google" -> Icons.LLM.Google
      "ollama" -> Icons.LLM.Ollama
      else -> null
    }

fun Model.displayName(): String = buildString {
  append(title)
  append(" by $provider")
}

fun Model.isCodyProOnly(): Boolean = tags?.contains("pro") == true

fun Model.isDeprecated(): Boolean = tags?.contains("deprecated") == true
