package com.sourcegraph.cody.edit

import com.intellij.openapi.command.WriteCommandAction
import com.sourcegraph.cody.edit.actions.DocumentCodeAction
import com.sourcegraph.cody.edit.lenses.LensesService
import com.sourcegraph.cody.edit.lenses.actions.EditAcceptAction
import com.sourcegraph.cody.edit.lenses.actions.EditCancelAction
import com.sourcegraph.cody.edit.lenses.actions.EditUndoAction
import com.sourcegraph.cody.edit.lenses.providers.EditAcceptCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditCancelCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditUndoCodeVisionProvider
import com.sourcegraph.cody.edit.lenses.providers.EditWorkingCodeVisionProvider
import com.sourcegraph.cody.util.CustomJunitClassRunner
import com.sourcegraph.cody.util.EditCodeFixture
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.AfterClass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Ignore
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(CustomJunitClassRunner::class)
class DocumentCodeTest {

  companion object {
    val fixture = EditCodeFixture("documentCode")

    @JvmStatic
    @AfterClass
    fun shutdown() {
      fixture.shutdown()
    }
  }

  @Before
  fun setUp() {
    fixture.openFile(relativeFilePath = "documentCode/src/main/java/Foo.java")
    LensesService.getInstance(fixture.project).addListener(fixture)
  }

  @After
  fun tearDown() {
    LensesService.getInstance(fixture.project).removeListener(fixture)
    WriteCommandAction.runWriteCommandAction(fixture.project) { fixture.file.delete(this) }
  }

  @Ignore
  @Test
  fun testGetsWorkingGroupLens() {
    val codeLenses = fixture.runAndWaitForLenses(DocumentCodeAction.ID, EditCancelAction.ID)

    assertEquals("There are 2 lenses expected, working lens and cancel lens", 2, codeLenses.size)
    // Lens group should match the expected structure.
    assertEquals(
        "First lens should be working lens",
        codeLenses[0].command?.command,
        EditWorkingCodeVisionProvider.command)
    assertEquals(
        "Second lens should be cancel lens",
        codeLenses[1].command?.command,
        EditCancelCodeVisionProvider.command)

    // We could try to Cancel the action, but there is no guarantee we can do it before edit will
    // finish. It is safer to just wait for edit to finish and then undo it.
    fixture.waitForSuccessfulEdit()

    fixture.runAndWaitForCleanState(EditUndoAction.ID)
  }

  @Test
  fun testShowsAcceptLens() {
    val codeLenses = fixture.runAndWaitForLenses(DocumentCodeAction.ID, EditAcceptAction.ID)
    assertNotNull("Lens group should be displayed", codeLenses.isNotEmpty())

    assertEquals("Lens group should have 2 lenses", 2, codeLenses.size)
    assertEquals(
        "First lens should be accept lens",
        codeLenses[0].command?.command,
        EditAcceptCodeVisionProvider.command)
    assertEquals(
        "Second lens should be undo lens",
        codeLenses[1].command?.command,
        EditUndoCodeVisionProvider.command)

    // Make sure a doc comment was inserted.
    assertTrue(fixture.hasJavadocComment(getEditorDocumentText()))

    fixture.runAndWaitForCleanState(EditUndoAction.ID)
  }

  @Test
  fun testAccept() {
    val codeLenses = fixture.runAndWaitForLenses(DocumentCodeAction.ID, EditAcceptAction.ID)
    assertNotNull("Lens group should be displayed", codeLenses.isNotEmpty())

    fixture.runAndWaitForCleanState(EditAcceptAction.ID)
    assertThat(getEditorDocumentText(), containsString("*/\n    public void foo() {"))
  }

  @Test
  fun testUndo() {
    val originalDocument = getEditorDocumentText()
    val codeLenses = fixture.runAndWaitForLenses(DocumentCodeAction.ID, EditUndoAction.ID)
    assertNotNull("Lens group should be displayed", codeLenses.isNotEmpty())
    assertNotSame("Expected document to be changed", originalDocument, getEditorDocumentText())

    fixture.runAndWaitForCleanState(EditUndoAction.ID)
    assertEquals(
        "Expected document changes to be reverted", originalDocument, getEditorDocumentText())
  }

  private fun getEditorDocumentText() = fixture.editor.document.text
}
