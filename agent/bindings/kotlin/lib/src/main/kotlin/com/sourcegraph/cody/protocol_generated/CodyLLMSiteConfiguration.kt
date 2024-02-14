@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CodyLLMSiteConfiguration(
  var chatModel: String? = null,
  var chatModelMaxTokens: Int? = null,
  var fastChatModel: String? = null,
  var fastChatModelMaxTokens: Int? = null,
  var completionModel: String? = null,
  var completionModelMaxTokens: Int? = null,
  var provider: String? = null,
)

