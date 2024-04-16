package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag

class AccountData : BaseState() {

  @get:OptionTag(tag = "accountId", nameAttribute = "") var accountId: String? by string()

  @get:OptionTag(tag = "chats", nameAttribute = "") var chats: MutableList<ChatState> by list()

  @get:OptionTag(tag = "defaultEnhancedContext", nameAttribute = "")
  var defaultEnhancedContext: EnhancedContextState? by property()

  @get:OptionTag(tag = "defaultLlm", nameAttribute = "") var defaultLlm: LLMState? by property()

  companion object {
    fun create(accountId: String): AccountData {
      val accountData = AccountData()
      accountData.accountId = accountId
      return accountData
    }
  }
}
