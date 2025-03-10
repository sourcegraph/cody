package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.mock.MockDocument
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_generated.Position

class PositionTest : BasePlatformTestCase() {

  private val document = MockDocument().also { it.insertString(0, "test\ntext") }

  fun testPositionOutsideDocumentNegativeLine() {
    val position = Position(-1, 0)
    assertTrue(position.isOutsideOfDocument(document))
  }

  fun testPositionOutsideDocumentPastLastLine() {
    val position = Position(2, 0)
    assertTrue(position.isOutsideOfDocument(document))
  }

  fun testPositionOutsideDocumentNegativeCharacter() {
    val position = Position(0, -1)
    assertTrue(position.isOutsideOfDocument(document))
  }

  fun testPositionOutsideDocumentPastLineEnd() {
    val position = Position(0, 10)
    assertTrue(position.isOutsideOfDocument(document))
  }

  fun testPositionInsideDocument() {
    val position = Position(0, 2)
    assertFalse(position.isOutsideOfDocument(document))
  }
}
