package com.sourcegraph.cody.agent.protocol

// Can't be an open class, as gson will complain with e.g.:
// java.lang.IllegalArgumentException: Class com.sourcegraph.cody.agent.protocol.ChatMessage
// declares multiple JSON fields named 'speaker'; conflict is caused by fields
// com.sourcegraph.cody.agent.protocol.ChatMessage#speaker and
// com.sourcegraph.cody.agent.protocol.Message#speaker
interface Message {
  val speaker: Speaker
  val text: String?
}
