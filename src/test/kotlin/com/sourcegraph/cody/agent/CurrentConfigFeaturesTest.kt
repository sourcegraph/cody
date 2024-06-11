package com.sourcegraph.cody.agent

import java.util.concurrent.CopyOnWriteArrayList
import org.awaitility.kotlin.await
import org.awaitility.kotlin.until
import org.hamcrest.Matchers.hasItems
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class CurrentConfigFeaturesTest {

  @Test
  fun `observer is notified`() {
    val current = CurrentConfigFeatures()
    val observer = FakeObserver()
    val expected = ConfigFeatures(attribution = true)
    current.attach(observer)
    current.update(expected)
    assertThat(observer.features, hasItems(expected))
  }

  @Test
  fun `observer is eventually not notified after cancelling`() {
    val current = CurrentConfigFeatures()
    val cancelledObserver = FakeObserver()
    current.attach(cancelledObserver).dispose()
    // dispose is async so got to await update
    // (which is synchronous) not to take effect:
    await until
        {
          val beforeCount = cancelledObserver.features.size
          current.update(ConfigFeatures(attribution = true))
          val afterCount = cancelledObserver.features.size
          afterCount == beforeCount
        }
  }

  @Test
  fun `other observers keep being notified after one is cancelled`() {
    val current = CurrentConfigFeatures()
    val cancelledObserver = FakeObserver()
    current.attach(cancelledObserver).dispose()
    val activeObserver = FakeObserver()
    current.attach(activeObserver) // No call to dispose.
    // Wait until the cancelledObserver is cancelled (like previously).
    await until
        {
          val beforeCount = cancelledObserver.features.size
          current.update(ConfigFeatures(attribution = true))
          val afterCount = cancelledObserver.features.size
          afterCount == beforeCount
        }
    val beforeCount = activeObserver.features.size
    current.update(ConfigFeatures(attribution = true))
    val afterCount = activeObserver.features.size
    assertEquals(beforeCount + 1, afterCount)
  }

  class FakeObserver : ConfigFeaturesObserver {
    val features = CopyOnWriteArrayList<ConfigFeatures?>()

    override fun update(newConfigFeatures: ConfigFeatures?) {
      features.add(newConfigFeatures)
    }

    /**
     * Using a total equality allows us to test for observing cancellation even when observer
     * objects are equal.
     */
    override fun equals(other: Any?): Boolean {
      return other is FakeObserver
    }

    /** Hash code meeting the contract of whole class being a single equality group. */
    override fun hashCode(): Int {
      return FakeObserver::class.hashCode()
    }
  }
}
