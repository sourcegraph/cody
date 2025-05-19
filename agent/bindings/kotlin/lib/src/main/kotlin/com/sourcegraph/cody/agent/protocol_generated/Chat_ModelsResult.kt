@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Chat_ModelsResult(
  val readOnly: Boolean,
  val models: List<ModelAvailabilityStatus>,
)

