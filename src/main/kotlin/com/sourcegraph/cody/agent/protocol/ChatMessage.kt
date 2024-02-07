package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.commands.CommandId
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
    val source: Source?,
    val text: String?,

    // Internal ID used for identifying updates of the message
    // All partial messages which are part of the same response are required to have the same ID
    val id: Int,
    val displayText: String? = null,
    val contextFiles: List<ContextFile>? = null,
    val error: ChatError? = null
) {

  fun withId(newId: Int) =
      ChatMessage(
          this.speaker,
          this.source,
          this.text,
          newId,
          this.displayText,
          this.contextFiles,
          this.error)

  companion object {
    val sourceToCommandId = CommandId.values().associateBy { it.source }
  }

  fun actualMessage(): String = sourceToCommandId[source]?.displayName ?: displayText ?: text ?: ""
}
