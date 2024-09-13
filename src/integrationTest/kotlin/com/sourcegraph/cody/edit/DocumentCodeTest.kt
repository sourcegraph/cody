package com.sourcegraph.cody.edit

import com.sourcegraph.cody.edit.actions.DocumentCodeAction
import com.sourcegraph.cody.edit.actions.lenses.EditAcceptAction
import com.sourcegraph.cody.edit.actions.lenses.EditCancelAction
import com.sourcegraph.cody.edit.actions.lenses.EditUndoAction
import com.sourcegraph.cody.edit.widget.LensAction
import com.sourcegraph.cody.edit.widget.LensHotkey
import com.sourcegraph.cody.edit.widget.LensIcon
import com.sourcegraph.cody.edit.widget.LensLabel
import com.sourcegraph.cody.edit.widget.LensSpinner
import com.sourcegraph.cody.edit.widget.LensWidgetGroup
import com.sourcegraph.cody.util.CodyIntegrationTextFixture
import com.sourcegraph.cody.util.CustomJunitClassRunner
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.startsWith
import org.junit.Ignore
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(CustomJunitClassRunner::class)
class DocumentCodeTest : CodyIntegrationTextFixture() {

  @Test
  @Ignore
  fun testGetsWorkingGroupLens() {
    val codeLensGroup = runAndWaitForLenses(DocumentCodeAction.ID, EditCancelAction.ID)

    val inlayModel = myFixture.editor.inlayModel
    val blockElements = inlayModel.getBlockElementsInRange(0, myFixture.editor.document.textLength)
    val lensesGroups = blockElements.mapNotNull { it.renderer as? LensWidgetGroup }

    assertEquals("There should be exactly one lenses group", 1, lensesGroups.size)

    assertTrue("codeLensGroup cannot be null", codeLensGroup != null)
    // Lens group should match the expected structure.
    val theWidgets = codeLensGroup!!.widgets

    assertEquals("Lens group should have 9 widgets", 9, theWidgets.size)
    assertTrue("Zeroth lens group should be an icon", theWidgets[0] is LensIcon)
    assertTrue(
        "First lens group is space separator label", (theWidgets[1] as LensLabel).text == " ")
    assertTrue("Second lens group is a spinner", theWidgets[2] is LensSpinner)
    assertTrue(
        "Third lens group is space separator label", (theWidgets[3] as LensLabel).text == " ")
    assertTrue(
        "Fourth lens group is a description label",
        (theWidgets[4] as LensAction).text == " Cody is working...")
    assertTrue(
        "Fifth lens group is separator label",
        (theWidgets[5] as LensLabel).text == LensesService.SEPARATOR)
    assertTrue("Sixth lens group should be an action", theWidgets[6] is LensAction)
    assertTrue("Seventh lens group should be a label with a hotkey", theWidgets[7] is LensHotkey)

    runLensAction(codeLensGroup, EditCancelAction.ID)
    assertNoInlayShown()
  }

  @Test
  fun testShowsAcceptLens() {
    val codeLensGroup = runAndWaitForLenses(DocumentCodeAction.ID, EditAcceptAction.ID)
    assertInlayIsShown()

    // Lens group should match the expected structure.
    val inlayModel = myFixture.editor.inlayModel
    val blockElements = inlayModel.getBlockElementsInRange(0, myFixture.editor.document.textLength)
    val lensesGroups = blockElements.mapNotNull { it.renderer as? LensWidgetGroup }
    val lenses = lensesGroups.firstOrNull()

    assertNotNull("Lens group should be displayed", lenses)

    val widgets = lenses!!.widgets
    // There are 13 widgets as of the time of writing, but the UX could change, so check robustly.
    assertTrue("Lens group should have at least 4 widgets", widgets.size >= 4)
    assertNotNull(
        "Lens group should contain Accept action",
        widgets.find { widget -> widget is LensAction && widget.actionId == EditAcceptAction.ID })
    assertNotNull(
        "Lens group should contain Show Undo action",
        widgets.find { widget -> widget is LensAction && widget.actionId == EditUndoAction.ID })

    // Make sure a doc comment was inserted.
    assertTrue(hasJavadocComment(myFixture.editor.document.text))

    runLensAction(codeLensGroup!!, EditUndoAction.ID)
    assertNoInlayShown()
  }

  @Test
  fun testAccept() {
    assertNoInlayShown()
    val acceptLens = runAndWaitForLenses(DocumentCodeAction.ID, EditAcceptAction.ID)
    assertTrue("Accept lens should be displayed", acceptLens != null)
    assertInlayIsShown()

    runLensAction(acceptLens!!, EditAcceptAction.ID)
    assertNoInlayShown()
    assertThat(myFixture.editor.document.text, startsWith("/**"))
  }

  @Test
  fun testUndo() {
    val originalDocument = myFixture.editor.document.text
    val undoLens = runAndWaitForLenses(DocumentCodeAction.ID, EditUndoAction.ID)
    assertTrue("Undo lens should be displayed", undoLens != null)
    assertNotSame(
        "Expected document to be changed", originalDocument, myFixture.editor.document.text)
    assertInlayIsShown()

    runLensAction(undoLens!!, EditUndoAction.ID)
    assertEquals(
        "Expected document changes to be reverted",
        originalDocument,
        myFixture.editor.document.text)
    assertNoInlayShown()
  }
}
