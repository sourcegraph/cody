package com.sourcegraph.cody.agent.protocol

import java.time.OffsetDateTime

data class ChatError(
    val kind: String? = null,
    val name: String,
    val message: String,
    val retryAfter: String? = null,
    val limit: Int? = null,
    val userMessage: String? = null,
    val retryAfterDate: OffsetDateTime? = null,
    val retryMessage: String? = null,
    val feature: String? = null,
    val upgradeIsAvailable: Boolean? = null,
) {
  fun toRateLimitError(): RateLimitError? {
    if (this.upgradeIsAvailable == null) {
      return null
    }
    return RateLimitError(
        upgradeIsAvailable = this.upgradeIsAvailable,
        limit = this.limit,
    )
  }
}

data class ChatMessage(
    val speaker: Speaker,
    val text: String?,
    val displayText: String? = null,
    val contextFiles: List<ContextItem>? = null,
    val error: ChatError? = null
) {
  fun actualMessage(): String = displayText ?: text ?: ""
}
