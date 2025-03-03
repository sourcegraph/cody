package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.mock.MockDocument
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_generated.Range

class RangeTest : BasePlatformTestCase() {

  private fun createDocument(text: String) = MockDocument().also { it.insertString(0, text) }

  fun `test toOffsetRange handles normal range within document`() {
    val document = createDocument("Hello World")
    val range = Range(Position(0, 0), Position(0, 5))

    val result = range.toOffsetRange(document)

    assertNotNull(result)
    assertEquals(0, result?.first)
    assertEquals(5, result?.second)
  }

  fun `test toOffsetRange handles start position outside document`() {
    val document = createDocument("Hello")
    val range = Range(Position(0, -1), Position(0, 3))

    val result = range.toOffsetRange(document)

    assertEquals(0, result?.first)
    assertEquals(3, result?.second)
  }

  fun `test toOffsetRange handles end position outside document`() {
    val document = createDocument("Hello")
    val range = Range(Position(0, 2), Position(2, 10))

    val result = range.toOffsetRange(document)

    assertNotNull(result)
    assertEquals(2, result?.first)
    assertEquals(5, result?.second)
  }

  fun `test toOffsetRange handles both positions outside document`() {
    val document = createDocument("Hello")
    val range = Range(Position(2, 10), Position(3, 20))

    val result = range.toOffsetRange(document)

    assertNotNull(result)
    assertEquals(0, result?.first)
    assertEquals(5, result?.second)
  }

  fun `test toOffsetRange handles empty document`() {
    val document = createDocument("")
    val range = Range(Position(0, 0), Position(0, 1))

    val result = range.toOffsetRange(document)

    assertNotNull(result)
    assertEquals(0, result?.first)
    assertEquals(0, result?.second)
  }

  fun `test toOffsetRange return null if start position is greater than end position`() {
    val document = createDocument("Hello")
    val range = Range(Position(0, 4), Position(0, 2))

    val result = range.toOffsetRange(document)

    assertNull(result)
  }
}
