package com.sourcegraph.cody.history.state

import com.intellij.configurationStore.serialize
import com.sourcegraph.cody.history.state.MessageState.SpeakerState.ASSISTANT
import com.sourcegraph.cody.history.state.MessageState.SpeakerState.HUMAN
import junit.framework.TestCase
import org.jdom.output.Format
import org.jdom.output.XMLOutputter

class HistoryStateTest : TestCase() {

  fun `test history serialization`() {
    val history =
        HistoryState().apply {
          accountData +=
              AccountData().apply {
                accountId = "VXNlkjoxEFU3NjE="
                chats +=
                    ChatState().apply {
                      internalId = "0f8b7034-9fa8-488a-a13e-09c52677008a"
                      updatedAt = "2024-01-31T01:06:18.524621"
                      messages +=
                          MessageState().apply {
                            speaker = HUMAN
                            text = "hi"
                          }
                      messages +=
                          MessageState().apply {
                            speaker = ASSISTANT
                            text = "hello"
                          }
                    }
              }
        }

    val format = Format.getPrettyFormat().also { it.setLineSeparator("\n") }
    val serialized = XMLOutputter(format).outputString(serialize(history))
    assertEquals(
        """
      <HistoryState>
        <accountData>
          <list>
            <AccountData>
              <accountId value="VXNlkjoxEFU3NjE=" />
              <chats>
                <list>
                  <chat>
                    <internalId value="0f8b7034-9fa8-488a-a13e-09c52677008a" />
                    <messages>
                      <list>
                        <message>
                          <speaker value="HUMAN" />
                          <text value="hi" />
                        </message>
                        <message>
                          <speaker value="ASSISTANT" />
                          <text value="hello" />
                        </message>
                      </list>
                    </messages>
                    <updatedAt value="2024-01-31T01:06:18.524621" />
                  </chat>
                </list>
              </chats>
            </AccountData>
          </list>
        </accountData>
      </HistoryState>
    """
            .trimIndent(),
        serialized)
  }
}
