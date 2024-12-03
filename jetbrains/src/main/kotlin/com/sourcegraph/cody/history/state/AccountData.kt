package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag

class AccountData() : BaseState() {
  constructor(accountId: String) : this() {
    this.accountId = accountId
  }

  @get:OptionTag(tag = "accountId", nameAttribute = "") var accountId: String? by string()

  @get:OptionTag(tag = "chats", nameAttribute = "") var chats: MutableList<ChatState> by list()

  @get:OptionTag(tag = "defaultEnhancedContext", nameAttribute = "")
  var defaultEnhancedContext: EnhancedContextState? by property()

  @get:OptionTag(tag = "defaultLlm", nameAttribute = "") var defaultLlm: LLMState? by property()
}
