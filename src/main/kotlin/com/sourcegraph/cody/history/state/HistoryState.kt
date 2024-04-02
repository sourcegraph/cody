package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag

class HistoryState : BaseState() {

  @get:OptionTag(tag = "chats", nameAttribute = "") var chats: MutableList<ChatState> by list()

  @get:OptionTag(tag = "defaultLlm", nameAttribute = "") var defaultLlm: LLMState? by property()

  @get:OptionTag(tag = "defaultEnhancedContext", nameAttribute = "")
  var defaultEnhancedContext: EnhancedContextState? by property()
}
