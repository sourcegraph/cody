package com.sourcegraph.cody.agent.intellij_extensions

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.sourcegraph.cody.agent.protocol_extensions.Position
import com.sourcegraph.cody.agent.protocol_generated.Position
import com.sourcegraph.cody.agent.protocol_generated.Range

fun Document.codyPosition(offset: Int): Position {
  val line = this.getLineNumber(offset)
  val lineStartOffset = this.getLineStartOffset(line)
  val character = offset - lineStartOffset
  return Position(line, character)
}

fun Document.codyRange(startOffset: Int, endOffset: Int): Range? {
  if (startOffset < 0 ||
      startOffset > this.textLength ||
      endOffset > this.textLength ||
      startOffset > endOffset) {
      val logger = Logger.getInstance(Document::class.java)
      logger.warn("codyRange error - startOffset: $startOffset, endOffset: $endOffset, textLength: ${this.textLength}")
      return null
  }

  val startLine = this.getLineNumber(startOffset)
  val lineStartOffset1 = this.getLineStartOffset(startLine)
  val startCharacter = startOffset - lineStartOffset1

  val endLine = this.getLineNumber(endOffset)
  val lineStartOffset2 =
      if (startLine == endLine) {
        lineStartOffset1
      } else {
        this.getLineStartOffset(endLine)
      }
  val endCharacter = endOffset - lineStartOffset2

  return Range(Position(startLine, startCharacter), Position(endLine, endCharacter))
}
