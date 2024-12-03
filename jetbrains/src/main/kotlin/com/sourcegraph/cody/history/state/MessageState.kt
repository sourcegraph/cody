package com.sourcegraph.cody.history.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.OptionTag
import com.intellij.util.xmlb.annotations.Tag

@Tag("message")
class MessageState : BaseState() {

  @get:OptionTag(tag = "text", nameAttribute = "") var text: String? by string()

  @get:OptionTag(tag = "speaker", nameAttribute = "")
  var speaker: SpeakerState? by enum<SpeakerState>()

  // todo var contextFiles by list<String>()

  enum class SpeakerState {
    HUMAN,
    ASSISTANT
  }
}
