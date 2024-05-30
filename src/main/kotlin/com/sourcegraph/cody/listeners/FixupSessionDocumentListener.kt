import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.event.BulkAwareDocumentListener
import com.intellij.openapi.editor.event.DocumentEvent
import com.sourcegraph.cody.edit.sessions.FixupSession
import java.util.concurrent.atomic.AtomicBoolean

// This is part of a workaround for https://github.com/sourcegraph/cody-issues/issues/315
// The correct solution will involve a protocol change so the Agent can know when the
// Accept lens group is shown. For now, we have it over on the client side.
class FixupSessionDocumentListener(private val session: FixupSession) : BulkAwareDocumentListener {
  private val logger = Logger.getInstance(FixupSessionDocumentListener::class.java)

  val isAcceptLensGroupShown = AtomicBoolean(false)

  override fun documentChangedNonBulk(event: DocumentEvent) {
    if (isAcceptLensGroupShown.get()) {
      logger.info("Auto-accepting current Fixup session: ${session.taskId}")
      session.accept()
    } else {
      session.resetLensGroup()
    }
  }

  fun setAcceptLensGroupShown(shown: Boolean) {
    isAcceptLensGroupShown.set(shown)
  }
}
