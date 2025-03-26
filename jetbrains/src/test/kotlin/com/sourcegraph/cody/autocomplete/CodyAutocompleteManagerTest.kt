import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_extensions.Position
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteItem
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager.Companion.trimCommonPrefixAndSuffix
import com.sourcegraph.cody.autocomplete.render.InlayModelUtil

class CodyAutocompleteManagerTest : BasePlatformTestCase() {

  fun test_displayAgentAutocomplete_cursorBased() {
    myFixture.configureByText("CommonPrefix.kt", "// say hello\n    CommonPrefix.\n// done")
    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!
    val items =
        listOf(
            AutocompleteItem(
                id = "0",
                range = Range(Position(1, 4), Position(1, 17)),
                insertText = "CommonPrefix.sayHello(\"world\")"))
    CodyAutocompleteManager.instance.displayAgentAutocomplete(
        editor, cursorOffset = 17, items, editor.inlayModel)
    val allInlaysForEditor = InlayModelUtil.getAllInlaysForEditor(editor)
    assertEquals(1, allInlaysForEditor.size)
    val inlay = allInlaysForEditor[0]
    assertEquals(30, inlay.offset)
  }

  fun test_displayAgentAutocomplete_lineStartBased() {
    myFixture.configureByText("CommonPrefix.kt", "// say hello\n    CommonPrefix.\n// done")
    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!
    val items =
        listOf(
            AutocompleteItem(
                id = "0",
                range = Range(Position(1, 0), Position(1, 17)),
                insertText = "    CommonPrefix.sayHello(\"world\")"))
    CodyAutocompleteManager.instance.displayAgentAutocomplete(
        editor, cursorOffset = 17, items, editor.inlayModel)
    val allInlaysForEditor = InlayModelUtil.getAllInlaysForEditor(editor)
    assertEquals(1, allInlaysForEditor.size)
    val inlay = allInlaysForEditor[0]
    assertEquals(30, inlay.offset)
  }

  fun testTrimCommonPrefixAndSuffix_NoCommonParts() {
    val formatted = "Hello, World!"
    val original = "Goodbye, Universe?"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("Hello, World!", result)
  }

  fun testTrimCommonPrefixAndSuffix_CommonPrefix() {
    val formatted = "Hello, World!"
    val original = "Hello, Universe?"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(7, startIndex)
    assertEquals("World!", result)
  }

  fun testTrimCommonPrefixAndSuffix_CommonSuffix() {
    val formatted = "Hello, World!"
    val original = "Goodbye, World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("Hello", result)
  }

  fun testTrimCommonPrefixAndSuffix_CommonPrefixAndSuffix() {
    val formatted = "Hello, beautiful World!"
    val original = "Hello, amazing World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(7, startIndex)
    assertEquals("beautiful", result)
  }

  fun testTrimCommonPrefixAndSuffix_EmptyStrings() {
    val formatted = ""
    val original = ""
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(0, startIndex)
    assertEquals("", result)
  }

  fun testTrimCommonPrefixAndSuffix_FormattedShorterThanOriginal() {
    val formatted = "Hello"
    val original = "Hello, World!"
    val (startIndex, result) = trimCommonPrefixAndSuffix(formatted, original)
    assertEquals(5, startIndex)
    assertEquals("", result)
  }
}
