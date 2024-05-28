package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.LogicalPosition
import kotlin.math.max
import kotlin.math.min

data class Position(@JvmField val line: Long, @JvmField val character: Long) {
  constructor(line: Int, character: Int) : this(line.toLong(), character.toLong())

  fun isStartOrEndOfDocumentMarker(document: Document): Boolean {
    return line < 0 || line > document.lineCount
  }

  fun getRealLine(document: Document): Int {
    return min(max(0L, document.lineCount.toLong() - 1), line).toInt()
  }

  fun getRealColumn(document: Document): Int {
    val realLine = getRealLine(document)
    val lineLength = document.getLineEndOffset(realLine) - document.getLineStartOffset(realLine)
    return min(lineLength.toLong(), character).toInt()
  }

  fun toLogicalPosition(document: Document): LogicalPosition {
    return LogicalPosition(getRealLine(document), getRealColumn(document))
  }

  /** Return zero-based offset of this position in the document. */
  fun toOffset(document: Document): Int {
    val lineStartOffset = document.getLineStartOffset(getRealLine(document))
    return lineStartOffset + getRealColumn(document)
  }

  companion object {
    fun fromOffset(document: Document, offset: Int): Position {
      val line = document.getLineNumber(offset)
      val lineStartOffset = document.getLineStartOffset(line)
      return Position(line.toLong(), (offset - lineStartOffset).toLong())
    }
  }
}
