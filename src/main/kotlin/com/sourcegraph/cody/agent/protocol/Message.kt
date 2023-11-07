package com.sourcegraph.cody.agent.protocol

// Can't be an open class, as gson will complain with e.g.:
// java.lang.IllegalArgumentException: Class com.sourcegraph.cody.agent.protocol.ChatMessage
// declares multiple JSON fields named 'speaker'; conflict is caused by fields
// com.sourcegraph.cody.agent.protocol.ChatMessage#speaker and
// com.sourcegraph.cody.agent.protocol.Message#speaker
interface Message {
  val speaker: Speaker
  val text: String?

  companion object {
    // convenience method, only used in (the unused) Premable.java
    fun newPrimitive(speaker: Speaker, text: String?) =
        object : Message {
          override val speaker: Speaker = speaker
          override val text: String? = text
        }
  }
}
