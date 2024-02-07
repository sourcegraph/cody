package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag

@Tag("remoteRepository")
class RemoteRepositoryState : BaseState() {

  @get:OptionTag(tag = "isEnabled", nameAttribute = "") var isEnabled: Boolean by property(true)

  @get:OptionTag(tag = "remoteUrl", nameAttribute = "") var remoteUrl: String? by string()

  companion object {
    fun create(remoteUrl: String, isEnabled: Boolean): RemoteRepositoryState {
      val state = RemoteRepositoryState()
      state.isEnabled = isEnabled
      state.remoteUrl = remoteUrl
      return state
    }
  }
}
