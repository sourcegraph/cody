package com.sourcegraph.cody.edit

import com.intellij.testFramework.runInEdtAndGet
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_DISPLAY_ACCEPT_GROUP
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_DISPLAY_WORKING_GROUP
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_FOLDING_RANGES
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_PERFORM_ACCEPT
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_PERFORM_UNDO
import com.sourcegraph.cody.edit.CodyInlineEditActionNotifier.Companion.TOPIC_TASK_FINISHED
import com.sourcegraph.cody.edit.actions.DocumentCodeAction
import com.sourcegraph.cody.edit.sessions.FixupSession
import com.sourcegraph.cody.edit.widget.LensAction
import com.sourcegraph.cody.edit.widget.LensGroupFactory
import com.sourcegraph.cody.edit.widget.LensHotkey
import com.sourcegraph.cody.edit.widget.LensIcon
import com.sourcegraph.cody.edit.widget.LensLabel
import com.sourcegraph.cody.edit.widget.LensSpinner
import com.sourcegraph.cody.util.CodyIntegrationTextFixture

class DocumentCodeTest : CodyIntegrationTextFixture() {

  fun testGetsFoldingRanges() {
    runAndWaitForNotifications(DocumentCodeAction.ID, TOPIC_FOLDING_RANGES)

    val selection = activeSession().selectionRange
    assertNotNull("Selection should have been set", selection)
    // We set the selection range to whatever the protocol returns.
    // If a 0-width selection turns out to be reasonable we can adjust or remove this test.
    assertFalse(
        "Selection range should not be zero-width", selection!!.startOffset == selection.endOffset)
    // A more robust check is to see if the selection "range" is just the caret position.
    // If so, then our fallback range somehow made the round trip, which is bad. The lenses will
    // go in the wrong places, etc.
    val caret = runInEdtAndGet { myFixture.editor.caretModel.primaryCaret.offset }
    assertFalse(
        "Selection range should not equal the caret position",
        selection.startOffset == caret && selection.endOffset == caret)
  }

  fun testGetsWorkingGroupLens() {
    runAndWaitForNotifications(DocumentCodeAction.ID, TOPIC_DISPLAY_WORKING_GROUP)
    assertInlayIsShown()

    // Lens group should match the expected structure.
    val lenses = activeSession().lensGroup
    assertNotNull("Lens group should be displayed", lenses)

    val widgets = lenses!!.widgets
    assertEquals("Lens group should have 6 widgets", 8, widgets.size)
    assertTrue("Zeroth lens group should be an icon", widgets[0] is LensIcon)
    assertTrue("First lens group is space separator label", (widgets[1] as LensLabel).text == " ")
    assertTrue("Second lens group is a spinner", widgets[2] is LensSpinner)
    assertTrue("Third lens group is space separator label", (widgets[3] as LensLabel).text == " ")
    assertTrue(
        "Fourth lens group is a description label",
        (widgets[4] as LensLabel).text == "Generating Code Edits")
    assertTrue(
        "Fifth lens group is separator label",
        (widgets[5] as LensLabel).text == LensGroupFactory.SEPARATOR)
    assertTrue("Sixth lens group should be an action", widgets[6] is LensAction)
    assertTrue("Seventh lens group should be a label with a hotkey", widgets[7] is LensHotkey)
  }

  fun testShowsAcceptLens() {
    runAndWaitForNotifications(DocumentCodeAction.ID, TOPIC_DISPLAY_ACCEPT_GROUP)
    assertInlayIsShown()

    // Lens group should match the expected structure.
    val lenses = activeSession().lensGroup
    assertNotNull("Lens group should be displayed", lenses)

    val widgets = lenses!!.widgets
    // There are 13 widgets as of the time of writing, but the UX could change, so check robustly.
    assertTrue("Lens group should have at least 4 widgets", widgets.size >= 4)
    assertNotNull(
        "Lens group should contain Accept action",
        widgets.find { widget ->
          widget is LensAction && widget.actionId == FixupSession.ACTION_ACCEPT
        })
    assertNotNull(
        "Lens group should contain Show Diff action",
        widgets.find { widget ->
          widget is LensAction && widget.actionId == FixupSession.ACTION_DIFF
        })
    assertNotNull(
        "Lens group should contain Show Undo action",
        widgets.find { widget ->
          widget is LensAction && widget.actionId == FixupSession.ACTION_UNDO
        })
    assertNotNull(
        "Lens group should contain Show Retry action",
        widgets.find { widget ->
          widget is LensAction && widget.actionId == FixupSession.ACTION_RETRY
        })

    // Make sure a doc comment was inserted.
    assertTrue(hasJavadocComment(myFixture.editor.document.text))
  }

  fun testAccept() {
    assertNoActiveSession()
    assertNoInlayShown()

    runAndWaitForNotifications(DocumentCodeAction.ID, TOPIC_DISPLAY_ACCEPT_GROUP)

    assertInlayIsShown()
    assertActiveSession()

    runAndWaitForNotifications(
        FixupSession.ACTION_ACCEPT, TOPIC_PERFORM_ACCEPT, TOPIC_TASK_FINISHED)

    assertNoInlayShown()
    assertNoActiveSession()
  }

  fun testUndo() {
    val originalDocument = myFixture.editor.document.text
    runAndWaitForNotifications(DocumentCodeAction.ID, TOPIC_DISPLAY_ACCEPT_GROUP)
    assertNotSame(
        "Expected document to be changed", originalDocument, myFixture.editor.document.text)
    assertInlayIsShown()

    runAndWaitForNotifications(FixupSession.ACTION_UNDO, TOPIC_PERFORM_UNDO, TOPIC_TASK_FINISHED)
    assertEquals(
        "Expected document changes to be reverted",
        originalDocument,
        myFixture.editor.document.text)
    assertNoInlayShown()
  }
}
