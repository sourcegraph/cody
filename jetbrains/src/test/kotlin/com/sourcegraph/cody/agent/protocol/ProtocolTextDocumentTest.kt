package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_extensions.ProtocolTextDocumentExt
import com.sourcegraph.cody.agent.protocol_generated.Position
import com.sourcegraph.cody.agent.protocol_generated.ProtocolTextDocument
import com.sourcegraph.cody.agent.protocol_generated.Range
import com.sourcegraph.cody.listeners.EditorChangesBus
import java.io.File

class ProtocolTextDocumentTest : BasePlatformTestCase() {
  private val defaultContent = "Start line 1\nline 2\nline 3\nline 4\nline 5 End"
  private val file: VirtualFile by lazy { createCodyTempFile() }

  private fun createCodyTempFile(content: String = defaultContent): VirtualFile {
    val tempFile = File.createTempFile("cody-test", ".txt")
    tempFile.writeText(content)
    tempFile.deleteOnExit()
    return VfsUtil.findFileByIoFile(tempFile, false)!!
  }

  private fun fromOffset(document: Document, offset: Int): Position {
    val line = document.getLineNumber(offset)
    val lineStartOffset = document.getLineStartOffset(line)
    return Position(line.toLong(), (offset - lineStartOffset).toLong())
  }

  override fun setUp() {
    super.setUp()
    file.putUserData(FileEditorProvider.KEY, TextEditorProvider.getInstance())
    myFixture.openFileInEditor(file)
  }

  override fun tearDown() {
    EditorChangesBus.listeners = emptyList()
    super.tearDown()
  }

  fun test_emptySelection() {
    val protocolTextFile = ProtocolTextDocumentExt.fromVirtualEditorFile(myFixture.editor, file)
    assert(protocolTextFile!!.uri.startsWith("file://"))
    assert(protocolTextFile.uri.contains("/cody-test"))
    assertEquals(defaultContent, protocolTextFile.content)
    assertEquals(Range(Position(0, 0), Position(0, 0)), protocolTextFile.selection)
  }

  fun test_singleLineSelection() {
    myFixture.editor.testing_selectSubstring("ine 1")
    val range = ProtocolTextDocumentExt.fromEditor(myFixture.editor)!!.selection!!
    assertEquals(0, range.start.line) // should be zero-based
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_multiLineSelection() {
    myFixture.editor.testing_selectSubstring("ine 1\nli")
    val range = ProtocolTextDocumentExt.fromEditor(myFixture.editor)!!.selection!!
    assertEquals(0, range.start.line)
    assertEquals(1, range.end.line) // should be zero-based
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_selectEntireFile() {
    myFixture.editor.testing_selectSubstring(defaultContent)
    val range = ProtocolTextDocumentExt.fromEditor(myFixture.editor)!!.selection!!
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_evil_emojis() {
    WriteAction.run<RuntimeException> {
      myFixture.editor.document.setText("This is an evil range test\nHello 🤦🏿‍ bugs")
    }
    myFixture.editor.testing_selectSubstring("bugs")
    val range = ProtocolTextDocumentExt.fromEditor(myFixture.editor)!!.selection!!
    assertEquals(
        myFixture.editor.selectionModel.selectedText, myFixture.editor.testing_substring(range))
  }

  fun test_emptyFile() {
    val emptyFile = createCodyTempFile(content = "")
    myFixture.openFileInEditor(emptyFile)
    assertEquals(
        Range(Position(0, 0), Position(0, 0)),
        ProtocolTextDocumentExt.fromVirtualEditorFile(myFixture.editor, emptyFile)?.selection)
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

    myFixture.openFileInEditor(createCodyTempFile())

    assert(lastTextDocument!!.uri.startsWith("file://"))
    assert(lastTextDocument!!.uri.contains("/cody-test"))
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
              fromOffset(myFixture.editor.document, offset),
              fromOffset(myFixture.editor.document, offset),
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
      val removalStartPosition = fromOffset(myFixture.editor.document, removalStartOffset)
      val removalEndPosition = fromOffset(myFixture.editor.document, removalEndOffset)

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
      val startPosition = fromOffset(myFixture.editor.document, startOffset)
      val endPosition = fromOffset(myFixture.editor.document, endOffset)

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
      val startPosition = fromOffset(myFixture.editor.document, startOffset)
      val endPosition = fromOffset(myFixture.editor.document, startOffset)

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

  fun test_normalized_uri_or_path() {
    val testCases =
        listOf(
            "\\\\wsl$\\Ubuntu\\home\\person" to "//wsl.localhost/Ubuntu/home/person",
            "//wsl$/Ubuntu/home/person" to "//wsl.localhost/Ubuntu/home/person",
            "c:/home/person" to "c:/home/person",
            "D:/home/person" to "d:/home/person",
            "file://\\\\wsl$\\Ubuntu\\home\\person" to "file:////wsl.localhost/Ubuntu/home/person",
            "file://c:/home/person" to "file:///c:/home/person",
            "file://Z:/home/PERSON" to "file:///z:/home/PERSON",
            "file:///C:/Users/person" to "file:///c:/Users/person",
            "/home/person/documents" to "/home/person/documents",
            "file:///home/person/documents" to "file:///home/person/documents")

    for ((input, expected) in testCases) {
      assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
    }
  }

  fun test_wsl_path_with_backslashes() {
    val input = "\\\\wsl$\\Ubuntu\\home\\person"
    val expected = "//wsl.localhost/Ubuntu/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun test_wsl_path_with_forward_slashes() {
    val input = "//wsl$/Ubuntu/home/person"
    val expected = "//wsl.localhost/Ubuntu/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testWindowsPathLowerCase() {
    val input = "c:/home/person"
    val expected = "c:/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testWindowsPathUpperCase() {
    val input = "D:/home/person"
    val expected = "d:/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testWslPathWithFileScheme() {
    val input = "file://\\\\wsl$\\Ubuntu\\home\\person"
    val expected = "file:////wsl.localhost/Ubuntu/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testWindowsPathWithFileScheme() {
    val input = "file://c:/home/person"
    val expected = "file:///c:/home/person"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testLinuxPath() {
    val input = "/home/person/documents"
    val expected = "/home/person/documents"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun testLinuxPathWithFileScheme() {
    val input = "file:///home/person/documents"
    val expected = "file:///home/person/documents"
    assertEquals(expected, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun test_unsupportedNonFileScheme() {
    val input = "jar://temp/home/person"
    assertEquals(null, ProtocolTextDocumentExt.normalizeFileUri(input))
  }

  fun test_conversionFromUnsupportedTempVirtualFile() {
    val vf = myFixture.createFile("virtualTempFile.txt", defaultContent)
    assertEquals(null, ProtocolTextDocumentExt.fileUriFor(vf))
  }
}
