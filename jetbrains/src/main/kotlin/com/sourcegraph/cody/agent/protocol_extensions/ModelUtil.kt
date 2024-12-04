package com.sourcegraph.cody.agent.protocol_extensions

import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.protocol_generated.Model
import javax.swing.Icon

fun Model.getIcon(): Icon? =
    when (provider) {
      "Anthropic" -> Icons.LLM.Anthropic
      "OpenAI" -> Icons.LLM.OpenAI
      "Mistral" -> Icons.LLM.Mistral
      "Google" -> Icons.LLM.Google
      "Ollama" -> Icons.LLM.Ollama
      else -> null
    }

fun Model.displayName(): String = buildString {
  append(title)
  append(" by $provider")
}

fun Model.isCodyProOnly(): Boolean = tags?.contains("pro") == true

fun Model.isDeprecated(): Boolean = tags?.contains("deprecated") == true
