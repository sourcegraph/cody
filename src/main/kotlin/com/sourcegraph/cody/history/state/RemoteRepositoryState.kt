package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag

@Tag("remoteRepository")
class RemoteRepositoryState : BaseState() {

  @get:OptionTag(tag = "isEnabled", nameAttribute = "") var isEnabled: Boolean by property(true)

  @get:OptionTag(tag = "remoteUrl", nameAttribute = "") var remoteUrl: String? by string()

  @get:OptionTag(tag = "codebaseName", nameAttribute = "") var codebaseName: String? by string()
}
