package com.sourcegraph.cody.agent.protocol

import java.time.OffsetDateTime
import java.util.*

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
    override val speaker: Speaker,
    override val text: String?,
    val displayText: String? = null,
    val contextFiles: List<ContextFile>? = null,
    val error: ChatError? = null,
    // Internal ID used for identifying updates of the message
    // All partial messages which are part of the same response are required to have the same ID
    val id: UUID = UUID.randomUUID()
) : Message {
  fun actualMessage(): String = displayText ?: text ?: ""
}
