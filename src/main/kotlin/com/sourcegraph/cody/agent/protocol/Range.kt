package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.sourcegraph.cody.vscode.Position as VSCPosition
import com.sourcegraph.cody.vscode.Range as VSCRange

typealias RangePair = Pair<Int, Int>

data class Range(val start: Position, val end: Position) {

  // We need to .plus(1) since the ranges use 0-based indexing
  // but IntelliJ presents it as 1-based indexing.
  fun intellijRange(): RangePair = RangePair(start.line.plus(1), end.line.plus(1))

  // The link to Sourcegraph Search on the other hand looks like this:
  fun toSearchRange(): RangePair = RangePair(start.line.plus(1), end.line)

  fun toVSCodeRange(): VSCRange =
      VSCRange(VSCPosition(start.line, start.character), VSCPosition(end.line, end.character))

  fun toRangeMarker(document: Document, surviveOnExternalChange: Boolean = false): RangeMarker =
      ReadAction.compute<RangeMarker, RuntimeException> {
        document
            .createRangeMarker(
                start.toOffset(document), end.toOffset(document), surviveOnExternalChange)
            .also {
              it.isGreedyToLeft = true
              it.isGreedyToRight = true
            }
      }

  fun length() = end.line - start.line + 1

  companion object {

    fun fromRangeMarker(rm: RangeMarker): Range =
        ReadAction.compute<Range, RuntimeException> {
          Range(
              Position.fromOffset(rm.document, rm.startOffset),
              Position.fromOffset(rm.document, rm.endOffset))
        }
  }
}
