package com.sourcegraph.cody.autoedit

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_extensions.Position
import com.sourcegraph.cody.agent.protocol_generated.AsideParams
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditItem
import com.sourcegraph.cody.agent.protocol_generated.InlineParams
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.cody.agent.protocol_generated.RenderParams

class AutoeditManagerTest : BasePlatformTestCase() {

  private fun createDefaultRenderParams() =
      RenderParams(inline = InlineParams(), aside = AsideParams())

  fun testComputeAutoedit_FindMatchAtBeginningOfDocument() {
    val text = "function hello() {\n  console.log('hello');\n}\n\nconst x = 42;"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    val item =
        AutocompleteEditItem(
            id = "test-1",
            originalText = "function hello()",
            insertText = "function hello(name: string)",
            range = Range(Position(0, 0), Position(0, 15)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should find match at beginning of document", result)
    assertEquals(
        "Should create correct replacement text",
        "function hello(name: string) {\n  console.log('hello');\n}\n\nconst x = 42;",
        result!!.first.text)
  }

  fun testComputeAutoedit_FindMatchAtEndOfDocument() {
    val text = "console.log('start');\n\nconst result = calculate();"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    val item =
        AutocompleteEditItem(
            id = "test-2",
            originalText = "const result = calculate();",
            insertText = "const result = calculate(x, y);",
            range = Range(Position(2, 0), Position(2, 27)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should find match at end of document", result)
    assertEquals(
        "Should create correct replacement text",
        "console.log('start');\n\nconst result = calculate(x, y);",
        result!!.first.text)
  }

  fun testComputeAutoedit_FindMatchInToleranceRange() {
    val text = "line1\nline2\nfunction test() {\n  return 42;\n}\nline6\nline7"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    // Item range points to line 5 (0-indexed), but actual text is on line 2
    // This should still work due to tolerance of 3 lines
    val item =
        AutocompleteEditItem(
            id = "test-3",
            originalText = "function test()",
            insertText = "function test(param)",
            range = Range(Position(5, 0), Position(5, 15)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should find match within tolerance range", result)
    assertTrue(
        "Should contain replacement text", result!!.first.text.contains("function test(param)"))
  }

  fun testComputeAutoedit_NoMatchBeyondToleranceRange() {
    val text = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nfunction test() {\n  return 42;\n}"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    // Item range points to line 1, but actual text is on line 7 (more than 3 lines away)
    val item =
        AutocompleteEditItem(
            id = "test-4",
            originalText = "function test()",
            insertText = "function test(param)",
            range = Range(Position(1, 0), Position(1, 15)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNull("Should not find match beyond tolerance range", result)
  }

  fun testComputeAutoedit_OriginalTextNotFound() {
    val text = "console.log('hello');\nconst x = 42;"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    val item =
        AutocompleteEditItem(
            id = "test-5",
            originalText = "nonexistent code",
            insertText = "replacement code",
            range = Range(Position(0, 0), Position(0, 16)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNull("Should return null when original text not found", result)
  }

  fun testComputeAutoedit_MultilineReplacement() {
    val text = "if (condition) {\n  doSomething();\n}"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    val item =
        AutocompleteEditItem(
            id = "test-6",
            originalText = "if (condition) {\n  doSomething();\n}",
            insertText = "if (condition) {\n  doSomething();\n  console.log('debug');\n}",
            range = Range(Position(0, 0), Position(2, 1)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should handle multiline replacement", result)
    assertEquals(
        "Should create correct multiline replacement",
        "if (condition) {\n  doSomething();\n  console.log('debug');\n}",
        result!!.first.text)
  }

  fun testComputeAutoedit_EmptyOriginalText() {
    val text = "console.log('hello');"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    val item =
        AutocompleteEditItem(
            id = "test-7",
            originalText = "",
            insertText = "// Added comment\n",
            range = Range(Position(0, 0), Position(0, 0)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should handle empty original text", result)
    assertEquals(
        "Should insert text at beginning",
        "// Added comment\nconsole.log('hello');",
        result!!.first.text)
  }

  fun testComputeAutoedit_SearchBackwards() {
    val text = "const x = 1;\nfunction test() {}\nconst x = 2;"
    myFixture.configureByText("test.js", text)

    val editor =
        FileEditorManager.getInstance(project)
            .openTextEditor(OpenFileDescriptor(project, myFixture.file.virtualFile), true)!!

    // Range points to line 1, should find "const x" backwards on line 0
    val item =
        AutocompleteEditItem(
            id = "test-8",
            originalText = "const x = 1;",
            insertText = "const x = 1; // modified",
            range = Range(Position(1, 0), Position(1, 12)),
            render = createDefaultRenderParams())

    val manager = AutoeditManager(project)
    val result = manager.computeAutoedit(editor, item)

    assertNotNull("Should find match using backward search", result)
    assertTrue(
        "Should contain modified text", result!!.first.text.contains("const x = 1; // modified"))
  }
}
