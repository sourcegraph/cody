package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag

@Tag("enhancedContext")
class EnhancedContextState : BaseState() {
  @get:OptionTag(tag = "isEnabled", nameAttribute = "") var isEnabled: Boolean by property(true)

  @get:OptionTag(tag = "remoteRepositories", nameAttribute = "")
  var remoteRepositories: MutableList<RemoteRepositoryState> by list()
}
