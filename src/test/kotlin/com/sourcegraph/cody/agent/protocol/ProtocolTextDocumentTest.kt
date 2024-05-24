package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.listeners.EditorChangesBus
import junit.framework.TestCase

class ProtocolTextDocumentTest : BasePlatformTestCase() {
  private val content = "Start line 1\nline 2\nline 3\nline 4\nline 5 End"
  private val filename = "test.txt"
  private val file: VirtualFile by lazy { myFixture.createFile(filename, content) }

  override fun setUp() {
    super.setUp()
    myFixture.openFileInEditor(file)
  }

  fun test_emptySelection() {
    val protocolTextFile = ProtocolTextDocument.fromVirtualFile(myFixture.editor, file)
    assertEquals("file:///src/test.txt", protocolTextFile.uri)
    assertEquals(content, protocolTextFile.content)
    assertEquals(Range(Position(0, 0), Position(0, 0)), protocolTextFile.selection)
  }

  fun test_singleLineSelection() {
    myFixture.editor.testing_selectSubstring("ine 1")
    val range = ProtocolTextDocument.fromEditor(myFixture.editor)!!.selection!!
    TestCase.assertEquals(0, range.start.line) // should be zero-based
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_multiLineSelection() {
    myFixture.editor.testing_selectSubstring("ine 1\nli")
    val range = ProtocolTextDocument.fromEditor(myFixture.editor)!!.selection!!
    TestCase.assertEquals(0, range.start.line)
    TestCase.assertEquals(1, range.end.line) // should be zero-based
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_selectEntireFile() {
    myFixture.editor.testing_selectSubstring(content)
    val range = ProtocolTextDocument.fromEditor(myFixture.editor)!!.selection!!
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_emptyFile() {
    val emptyFile = myFixture.createFile("empty.txt", "")
    myFixture.openFileInEditor(emptyFile)
    assertEquals(
        Range(Position(0, 0), Position(0, 0)),
        ProtocolTextDocument.fromVirtualFile(myFixture.editor, emptyFile).selection)
  }

  fun test_selectionListener() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    myFixture.editor.testing_selectSubstring("line 1\nl")
    assertEquals(
        myFixture.editor.selectionModel.selectedText,
        myFixture.editor.testing_substring(lastTextDocument!!.selection!!))
  }

  fun test_caretListener() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    myFixture.editor.caretModel.moveToOffset(5)
    assertEquals(Range(Position(0, 5), Position(0, 5)), lastTextDocument!!.selection!!)
  }

  fun test_openListener() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    myFixture.openFileInEditor(myFixture.createFile("newFile.txt", ""))

    assertEquals("file:///src/newFile.txt", lastTextDocument!!.uri)
  }

  fun test_documentListener_appendAndPrepend() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    fun appendOrPrepend(additionalContext: String, isAppend: Boolean) {
      val currentContent = myFixture.editor.document.text
      val newContent =
          if (isAppend) "${currentContent}$additionalContext"
          else "$additionalContext$currentContent"
      WriteAction.run<RuntimeException> { file.setBinaryContent(newContent.toByteArray()) }

      assertEquals(null, lastTextDocument!!.content)
      assertEquals(1, lastTextDocument!!.contentChanges!!.size)
      assertEquals(additionalContext, lastTextDocument!!.contentChanges!!.first().text)

      val offset = if (isAppend) currentContent.length else 0
      assertEquals(
          Range(
              Position.fromOffset(myFixture.editor.document, offset),
              Position.fromOffset(myFixture.editor.document, offset),
          ),
          lastTextDocument!!.contentChanges!!.first().range)
    }

    appendOrPrepend("appended", isAppend = true)
    appendOrPrepend("\nand moooore \n \n *** \n", isAppend = true)
    appendOrPrepend("prepended", isAppend = false)
    appendOrPrepend("and of course\nmore   \n \n \n #$% \n", isAppend = false)
  }

  fun test_documentListener_remove() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    fun remove(removedContent: String) {
      val newContent = myFixture.editor.document.text.replace(removedContent, "")

      val removalStartOffset = myFixture.editor.document.text.indexOf(removedContent)
      val removalEndOffset = removalStartOffset + removedContent.length
      val removalStartPosition = Position.fromOffset(myFixture.editor.document, removalStartOffset)
      val removalEndPosition = Position.fromOffset(myFixture.editor.document, removalEndOffset)

      WriteAction.run<RuntimeException> { file.setBinaryContent(newContent.toByteArray()) }

      assertEquals(null, lastTextDocument!!.content)
      assertEquals(1, lastTextDocument!!.contentChanges!!.size)
      assertEquals("", lastTextDocument!!.contentChanges!!.first().text)
      assertEquals(
          Range(removalStartPosition, removalEndPosition),
          lastTextDocument!!.contentChanges!!.first().range)
    }

    remove("e 3")
    remove("1\nline 2\nli")
    remove("4\nline")
    remove(" End")
    remove("Start ")
  }

  fun test_documentListener_replace() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    fun replace(oldSubstring: String, newSubstring: String) {
      val currentContent = myFixture.editor.document.text
      val newContent = currentContent.replace(oldSubstring, newSubstring)

      val startOffset = currentContent.indexOf(oldSubstring)
      val endOffset = startOffset + oldSubstring.length
      val startPosition = Position.fromOffset(myFixture.editor.document, startOffset)
      val endPosition = Position.fromOffset(myFixture.editor.document, endOffset)

      WriteAction.run<RuntimeException> { file.setBinaryContent(newContent.toByteArray()) }

      assertEquals(null, lastTextDocument!!.content)
      assertEquals(1, lastTextDocument!!.contentChanges!!.size)
      assertEquals(newSubstring, lastTextDocument!!.contentChanges!!.first().text)
      assertEquals(
          Range(startPosition, endPosition), lastTextDocument!!.contentChanges!!.first().range)
    }

    replace("e 3", "sdf")
    replace("1\nline 2\nli", "ala\n")
    replace("4\nline", "random")
    replace(" End", "\n\n\naa\n")
    replace("Start ", "")
  }

  fun test_documentListener_insert() {
    var lastTextDocument: ProtocolTextDocument? = null
    EditorChangesBus.addListener { _, textDocument -> lastTextDocument = textDocument }

    fun insert(afterSubstring: String, insertSubstring: String) {
      val currentContent = myFixture.editor.document.text
      val startOffset = currentContent.indexOf(afterSubstring)
      val endOffset = startOffset
      val startPosition = Position.fromOffset(myFixture.editor.document, startOffset)
      val endPosition = Position.fromOffset(myFixture.editor.document, endOffset)

      val newContent =
          StringBuilder(currentContent).apply { insert(startOffset, insertSubstring) }.toString()
      WriteAction.run<RuntimeException> { file.setBinaryContent(newContent.toByteArray()) }

      assertEquals(null, lastTextDocument!!.content)
      assertEquals(1, lastTextDocument!!.contentChanges!!.size)
      assertEquals(insertSubstring, lastTextDocument!!.contentChanges!!.first().text)
      assertEquals(
          Range(startPosition, endPosition), lastTextDocument!!.contentChanges!!.first().range)
    }

    insert("ne 3", "yes")
    insert("1\nline 2\n", "oooooo\n")
    insert("4\nline ", "\n\n\n\n\n\n\n")
    insert(" End", "this is the \n end\n\n\n\n")
    insert("Start ", "@@@\n\n")
  }
}
