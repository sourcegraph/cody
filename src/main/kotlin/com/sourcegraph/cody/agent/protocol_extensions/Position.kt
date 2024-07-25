package com.sourcegraph.cody.agent.protocol_extensions

// because line / column should probably be a
// long
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.LogicalPosition
import com.sourcegraph.cody.agent.protocol_generated.Position
import kotlin.math.max
import kotlin.math.min

fun Position(line: Int, character: Int): Position {
  return Position(line.toLong(), character.toLong())
}

object PositionFactory {
  fun fromOffset(document: Document, offset: Int): Position {
    val line = document.getLineNumber(offset)
    val lineStartOffset = document.getLineStartOffset(line)
    return Position(line.toLong(), (offset - lineStartOffset).toLong())
  }
}

fun Position.isStartOrEndOfDocumentMarker(document: Document): Boolean {
  return line < 0 || line > document.lineCount
}

fun Position.getRealLine(document: Document): Int {
  return min(max(0, document.lineCount - 1), line.toInt())
}

fun Position.getRealColumn(document: Document): Int {
  val realLine = getRealLine(document)
  val lineLength = document.getLineEndOffset(realLine) - document.getLineStartOffset(realLine)
  return min(lineLength, character.toInt())
}

fun Position.toLogicalPosition(document: Document): LogicalPosition {
  return LogicalPosition(getRealLine(document), getRealColumn(document))
}

/** Return zero-based offset of this position in the document. */
fun Position.toOffset(document: Document): Int {
  val lineStartOffset = document.getLineStartOffset(getRealLine(document))
  return lineStartOffset + getRealColumn(document)
}
