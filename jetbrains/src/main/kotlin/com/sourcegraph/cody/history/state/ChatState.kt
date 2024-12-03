package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Tag("chat")
class ChatState() : BaseState() {
  constructor(internalId: String) : this() {
    this.internalId = internalId
  }

  @get:OptionTag(tag = "internalId", nameAttribute = "") var internalId: String? by string()

  @get:OptionTag(tag = "messages", nameAttribute = "")
  var messages: MutableList<MessageState> by list()

  @get:OptionTag(tag = "updatedAt", nameAttribute = "") var updatedAt: String? by string()

  @Deprecated("Use `llm` instead.")
  @get:OptionTag(tag = "model", nameAttribute = "")
  var model: String? by string()

  @get:OptionTag(tag = "llm", nameAttribute = "") var llm: LLMState? by property()

  @Deprecated("")
  @get:OptionTag(tag = "accountId", nameAttribute = "")
  var accountId: String? by string()

  @get:OptionTag(tag = "enhancedContext", nameAttribute = "")
  var enhancedContext: EnhancedContextState? by property()

  private var updatedAtDate: LocalDateTime? = null

  fun title(): String? = messages.firstOrNull()?.text?.take(48)

  fun setUpdatedTimeAt(date: LocalDateTime) {
    updatedAtDate = date
    updatedAt = date.format(DATE_FORMAT)
  }

  fun getUpdatedTimeAt(): LocalDateTime {
    if (updatedAt == null) return LocalDateTime.now()
    if (updatedAtDate == null) updatedAtDate = LocalDateTime.parse(updatedAt, DATE_FORMAT)
    return updatedAtDate ?: LocalDateTime.now()
  }

  companion object {

    private val DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE_TIME
  }
}
