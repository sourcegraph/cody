package com.sourcegraph.cody.agent

import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.util.concurrent.locks.ReentrantLock
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class CodyAgentClientTest : BasePlatformTestCase() {
  companion object {
    const val WEBVIEW_ID: String = "unused-webview-id"
  }

  @Volatile var lastMessage: ConfigFeatures? = null

  // Use lock/condition to synchronize between observer being invoked
  // and the test being able to assert.
  val lock = ReentrantLock()
  val condition = lock.newCondition()

  fun client(): CodyAgentClient {
    val client = CodyAgentClient()
    client.onSetConfigFeatures = ConfigFeaturesObserver {
      lock.lock()
      try {
        lastMessage = it
        condition.signal()
      } finally {
        lock.unlock()
      }
    }
    return client
  }

  @Test
  fun `notifies observer`() {
    val expected = ConfigFeatures(attribution = true)
    client()
        .webviewPostMessage(
            WebviewPostMessageParams(
                id = WEBVIEW_ID,
                message =
                    ExtensionMessage(
                        type = ExtensionMessage.Type.SET_CONFIG_FEATURES,
                        errors = null,
                        configFeatures = expected,
                    )))
    PlatformTestUtil.dispatchAllEventsInIdeEventQueue()
    lock.lock()
    try {
      if (expected != lastMessage) {
        condition.await()
      }
      assertEquals(expected, lastMessage)
    } finally {
      lock.unlock()
    }
  }
}
