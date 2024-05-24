package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import junit.framework.TestCase

class ProtocolTextDocumentTest : BasePlatformTestCase() {
  private val content = "line 1\nline 2\nline 3\n"
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

  // TODO: assert behavior of cody selection listener
  // TODO: reproduce caret events
}
