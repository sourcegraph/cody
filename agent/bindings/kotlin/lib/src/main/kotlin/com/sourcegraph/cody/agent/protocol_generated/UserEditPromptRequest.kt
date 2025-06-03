@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class UserEditPromptRequest(
  val instruction: String? = null,
  val selectedModelId: String,
  val availableModels: List<ModelAvailabilityStatus>,
)

