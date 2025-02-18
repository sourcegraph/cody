@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class Chat_SetHandlerParams(
  val id: String,
  val handlerID: HandlerID,
  val modelID: String,
)

