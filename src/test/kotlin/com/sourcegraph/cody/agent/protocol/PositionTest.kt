package com.sourcegraph.cody.agent.protocol

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_extensions.getRealColumn
import com.sourcegraph.cody.agent.protocol_extensions.getRealLine
import com.sourcegraph.cody.agent.protocol_extensions.isOutsideOfDocument
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetOrZero
import com.sourcegraph.cody.agent.protocol_generated.Position

class PositionTest : BasePlatformTestCase() {

  private val content = "Hello\nWorld"
  private val filename = "position_test.txt"
  private val file by lazy { myFixture.createFile(filename, content) }
  private val document by lazy { myFixture.editor.document }

  override fun setUp() {
    super.setUp()
    myFixture.openFileInEditor(file)
  }

  fun test_isStartOrEndOfDocumentMarkerReturnsTrueWhenLineIsLessThanZero() {
    val position = Position(-1, 0)
    val result = position.isOutsideOfDocument(document)
    assertEquals(true, result)
  }

  fun test_isStartOrEndOfDocumentMarkerReturnsTrueWhenLineIsGreaterThanLineCount() {
    val position = Position(3, 0)
    val result = position.isOutsideOfDocument(document)
    assertEquals(true, result)
  }

  fun test_isStartOrEndOfDocumentMarkerReturnsFalseWhenLineIsWithinBounds() {
    val position = Position(1, 0)
    val result = position.isOutsideOfDocument(document)
    assertEquals(false, result)
  }

  fun test_getRealLineReturnsCorrectLineWhenWithinBounds() {
    val position = Position(1, 0)
    val result = position.getRealLine(document)
    assertEquals(1, result)
  }

  fun test_testGetRealLineReturnsLastLineWhenLineIsGreaterThanLineCount() {
    val position = Position(3, 0)
    val result = position.getRealLine(document)
    assertEquals(1, result)
  }

  fun test_getRealColumnReturnsCorrectColumnWhenWithinBounds() {
    val position = Position(1, 2)
    val result = position.getRealColumn(document)
    assertEquals(2, result)
  }

  fun test_getRealColumnReturnsLineLengthWhenCharacterIsGreaterThanLineLength() {
    val position = Position(1, 10)
    val result = position.getRealColumn(document)
    assertEquals(5, result)
  }

  fun test_toOffsetReturnsCorrectOffsetOnEmptyFile() {

    val file = myFixture.createFile("empty_file.txt", "")
    myFixture.openFileInEditor(file)
    val document = myFixture.editor.document

    assertEquals(0, Position(0, 0).toOffsetOrZero(document))
    assertEquals(0, Position(0, 3).toOffsetOrZero(document))
    assertEquals(0, Position(1, 1).toOffsetOrZero(document))
  }

  fun test_toOffsetReturnsCorrectOffsetOnOneNewlineFile() {

    val file = myFixture.createFile("almost_empty_file.txt", "\n")
    myFixture.openFileInEditor(file)
    val document = myFixture.editor.document

    assertEquals(0, Position(0, 0).toOffsetOrZero(document))
    assertEquals(0, Position(0, 3).toOffsetOrZero(document))
    assertEquals(1, Position(2, 2).toOffsetOrZero(document))
  }

  fun test_toOffsetReturnsCorrectOffset() {
    assertEquals(0, Position(0, 0).toOffsetOrZero(document))
    assertEquals(2, Position(0, 2).toOffsetOrZero(document))
    assertEquals(5, Position(0, 5).toOffsetOrZero(document))
    assertEquals(6, Position(1, 0).toOffsetOrZero(document))
    assertEquals(content.length, Position(12, 12).toOffsetOrZero(document))
  }
}
