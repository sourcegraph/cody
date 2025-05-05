package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.testFramework.fixtures.BasePlatformTestCase
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

  fun test_toOffsetReturnsCorrectOffsetOnEmptyFile() {

    val file = myFixture.createFile("empty_file.txt", "")
    myFixture.openFileInEditor(file)
    val document = myFixture.editor.document

    assertEquals(0, Position(0, 0).toBoundedOffset(document))
    assertEquals(0, Position(0, 3).toBoundedOffset(document))
    assertEquals(0, Position(1, 1).toBoundedOffset(document))
  }

  fun test_toOffsetReturnsCorrectOffsetOnOneNewlineFile() {

    val file = myFixture.createFile("almost_empty_file.txt", "\n")
    myFixture.openFileInEditor(file)
    val document = myFixture.editor.document

    assertEquals(0, Position(0, 0).toBoundedOffset(document))
    assertEquals(0, Position(0, 3).toBoundedOffset(document))
    assertEquals(1, Position(2, 2).toBoundedOffset(document))
  }

  fun test_toOffsetReturnsCorrectOffset() {
    assertEquals(0, Position(0, 0).toBoundedOffset(document))
    assertEquals(2, Position(0, 2).toBoundedOffset(document))
    assertEquals(5, Position(0, 5).toBoundedOffset(document))
    assertEquals(6, Position(1, 0).toBoundedOffset(document))
    assertEquals(content.length, Position(12, 12).toBoundedOffset(document))
  }

  fun test_positionLastLineLastCharacter() {
    assertEquals(2, document.lineCount)
    assertEquals(0, document.getLineStartOffset(0))
    assertEquals(5, document.getLineEndOffset(0))
    assertEquals(6, document.getLineStartOffset(1))
    assertEquals(11, document.getLineEndOffset(1))

    val positionInside = Position(1, 5)
    assertEquals(11, positionInside.toBoundedOffset(document))

    val positionOutside = Position(1, 6)
    assertEquals(11, positionOutside.toBoundedOffset(document))
  }

  fun test_positionFirstLineFirstCharacter() {
    val positionInside = Position(0, 0)
    assertEquals(0, positionInside.toBoundedOffset(document))

    val positionOutside1 = Position(-1, 0)
    assertEquals(0, positionOutside1.toBoundedOffset(document))

    val positionOutside2 = Position(0, -1)
    assertEquals(0, positionOutside2.toBoundedOffset(document))
  }
}
