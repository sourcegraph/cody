package com.sourcegraph.cody.ui

import com.sourcegraph.cody.Icons
import javax.swing.Icon

enum class ChatModel(val icon: Icon, val displayName: String, val agentName: String) {
  UNKNOWN_MODEL(Icons.CodyLogo, "", ""),
  ANTHROPIC_CLAUDE_2(Icons.LLM.Anthropic, "Claude 2.0 by Anthropic", "anthropic/claude-2"),
  ANTHROPIC_CLAUDE_2_0(Icons.LLM.Anthropic, "Claude 2.0 by Anthropic", "anthropic/claude-2.0"),
  ANTHROPIC_CLAUDE_2_1(Icons.LLM.Anthropic, "Claude 2.1 by Anthropic", "anthropic/claude-2.1"),
  ANTHROPIC_CLAUDE_INSTANT(
      Icons.LLM.Anthropic, "Claude Instant by Anthropic", "anthropic/claude-instant-1.2"),
  OPEN_AI_GPT_3_5(Icons.LLM.OpenAI, "ChatGPT 3.5 Turbo by OpenAI", "openai/gpt-3.5-turbo"),
  OPEN_AI_GPT_4(Icons.LLM.OpenAI, "ChatGPT 4 Turbo Preview by OpenAI", "openai/gpt-4-1106-preview"),
  MIXTRAL_8X_7B(
      Icons.LLM.Mistral,
      "Mixtral 8x7B by Mistral",
      "fireworks/accounts/fireworks/models/mixtral-8x7b-instruct");

  companion object {
    fun fromAgentName(agentName: String): ChatModel =
        ChatModel.values().firstOrNull { it.agentName == agentName } ?: UNKNOWN_MODEL

    fun fromDisplayName(displayName: String): ChatModel =
        ChatModel.values().firstOrNull { it.displayName == displayName } ?: UNKNOWN_MODEL

    fun fromDisplayNameNullable(displayName: String): ChatModel? =
        ChatModel.values().firstOrNull { it.displayName == displayName }
  }
}
