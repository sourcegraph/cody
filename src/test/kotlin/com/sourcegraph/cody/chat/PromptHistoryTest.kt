import com.sourcegraph.cody.chat.PromptHistory
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class PromptHistoryTest {
  private lateinit var promptHistory: PromptHistory

  @Before
  fun setUp() {
    promptHistory = PromptHistory(3)
  }

  @Test
  fun `add items to history`() {
    promptHistory.add("item1")
    promptHistory.add("item2")
    promptHistory.add("item3")

    assertEquals("item3", promptHistory.getPrevious())
    assertEquals("item2", promptHistory.getPrevious())
    assertEquals("item1", promptHistory.getPrevious())
    assertEquals("item1", promptHistory.getPrevious())
  }

  @Test
  fun `get next item`() {
    promptHistory.add("item1")
    promptHistory.add("item2")
    promptHistory.add("item3")

    assertEquals("item3", promptHistory.getPrevious())
    assertEquals("item2", promptHistory.getPrevious())
    assertEquals("item3", promptHistory.getNext())
    assertEquals(null, promptHistory.getNext())
  }

  @Test
  fun `history capacity`() {
    promptHistory.add("item1")
    promptHistory.add("item2")
    promptHistory.add("item3")
    promptHistory.add("item4")

    assertEquals("item4", promptHistory.getPrevious())
    assertEquals("item3", promptHistory.getPrevious())
    assertEquals("item2", promptHistory.getPrevious())
    assertEquals("item2", promptHistory.getPrevious())
  }

  @Test
  fun `reset history`() {
    promptHistory.add("item1")
    promptHistory.add("item2")
    promptHistory.add("item3")

    promptHistory.getPrevious()
    promptHistory.getPrevious()

    promptHistory.resetHistory()

    assertEquals("item3", promptHistory.getPrevious())
    assertEquals("item2", promptHistory.getPrevious())
    assertEquals("item1", promptHistory.getPrevious())
    assertEquals("item1", promptHistory.getPrevious())
  }

  @Test
  fun `is not empty`() {
    assertEquals(false, promptHistory.isNotEmpty())

    promptHistory.add("item1")

    assertEquals(true, promptHistory.isNotEmpty())
  }
}
