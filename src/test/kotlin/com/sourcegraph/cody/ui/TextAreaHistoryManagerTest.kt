import com.sourcegraph.cody.chat.PromptHistory
import com.sourcegraph.cody.ui.TextAreaHistoryManager
import java.awt.event.KeyEvent
import javax.swing.JTextArea
import kotlin.test.assertEquals
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class TextAreaHistoryManagerTest {
  private lateinit var textArea: JTextArea
  private lateinit var promptHistory: PromptHistory
  private lateinit var textAreaHistoryManager: TextAreaHistoryManager

  private val keyEventA = mock(KeyEvent::class.java)
  private val keyEventBackspace = mock(KeyEvent::class.java)
  private val keyEventUp = mock(KeyEvent::class.java)
  private val keyEventDown = mock(KeyEvent::class.java)

  @Before
  fun setup() {
    textArea = JTextArea()
    promptHistory = PromptHistory(capacity = 3)
    textAreaHistoryManager = TextAreaHistoryManager(textArea, promptHistory)

    `when`(keyEventA.keyCode).thenReturn(KeyEvent.VK_A)
    `when`(keyEventBackspace.keyCode).thenReturn(KeyEvent.VK_BACK_SPACE)
    `when`(keyEventUp.keyCode).thenReturn(KeyEvent.VK_UP)
    `when`(keyEventDown.keyCode).thenReturn(KeyEvent.VK_DOWN)
  }

  @Test
  fun `moving once back and once forth in the history should give the initial empty text area `() {
    textArea.text = ""
    promptHistory.add("some text")

    val listener = textArea.keyListeners.first()

    listener.keyPressed(keyEventUp)
    assertEquals("some text", textArea.text)

    listener.keyPressed(keyEventDown)
    assertEquals("", textArea.text)
  }

  @Test
  fun `should not enter history mode when text area is not empty and the first key event is not an arrow`() {
    textArea.text = "some text"

    val listener = textArea.keyListeners.first()
    val keySequence = listOf(keyEventA, keyEventUp, keyEventDown)
    for (k in keySequence) {
      listener.keyPressed(k)
      assertEquals("some text", textArea.text)
      assertEquals(false, promptHistory.isNotEmpty())
    }
  }

  @Test
  fun `should navigate to previous prompt when up arrow is pressed in history mode`() {
    textArea.text = ""
    promptHistory.add("previous prompt")

    val listener = textArea.keyListeners.first()
    listener.keyPressed(keyEventUp)

    assertEquals("previous prompt", textArea.text)
    assertEquals(true, promptHistory.isNotEmpty())
  }

  @Test
  fun `should navigate to next prompt when down arrow is pressed in history mode`() {
    textArea.text = ""

    promptHistory.add("previous prompt")
    promptHistory.add("next prompt")
    assertEquals(true, promptHistory.isNotEmpty())

    val listener = textArea.keyListeners.first()
    listener.keyPressed(keyEventA)
    assertEquals("", textArea.text)
    listener.keyPressed(keyEventUp)
    assertEquals("next prompt", textArea.text)
    listener.keyPressed(keyEventUp)
    assertEquals("previous prompt", textArea.text)
    listener.keyPressed(keyEventUp)
    assertEquals("previous prompt", textArea.text)
    listener.keyPressed(keyEventDown)
    assertEquals("next prompt", textArea.text)
    listener.keyPressed(keyEventDown)
    assertEquals("", textArea.text)
    listener.keyPressed(keyEventUp)
    assertEquals("next prompt", textArea.text)
  }

  @Test
  fun `should navigate to previous prompt when user wipes out the prompt while searching through history`() {
    textArea.text = ""

    promptHistory.add("previous prompt")
    assertEquals(true, promptHistory.isNotEmpty())

    val listener = textArea.keyListeners.first()
    listener.keyPressed(keyEventUp)
    assertEquals("previous prompt", textArea.text)

    textArea.text = ""
    listener.keyPressed(keyEventBackspace)
    assertEquals("", textArea.text)

    listener.keyPressed(keyEventUp)
    assertEquals("previous prompt", textArea.text)
  }
}
