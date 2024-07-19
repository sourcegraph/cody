@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class CodyLLMSiteConfiguration(
  val chatModel: String? = null,
  val chatModelMaxTokens: Long? = null,
  val fastChatModel: String? = null,
  val fastChatModelMaxTokens: Long? = null,
  val completionModel: String? = null,
  val completionModelMaxTokens: Long? = null,
  val provider: String? = null,
  val smartContextWindow: Boolean? = null,
)

