package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.sourcegraph.cody.agent.protocol_generated.Range

typealias RangePair = Pair<Long, Long>

object RangeFactory {
  fun fromRangeMarker(rm: RangeMarker): Range =
      ReadAction.compute<Range, RuntimeException> {
        Range(
            PositionFactory.fromOffset(rm.document, rm.startOffset),
            PositionFactory.fromOffset(rm.document, rm.endOffset))
      }
}

public fun Range.toIntellijRange(): RangePair =
    RangePair(this.start.line.plus(1L), this.end.line.plus(1L))

// We need to .plus(1) since the ranges use 0-based indexing
// but IntelliJ presents it as 1-based indexing.
public fun Range.intellijRange(): RangePair = RangePair(start.line.plus(1), end.line.plus(1))

// The link to Sourcegraph Search on the other hand looks like this:
fun Range.toSearchRange(): RangePair = RangePair(start.line.plus(1), end.line)

fun Range.toRangeMarker(document: Document, surviveOnExternalChange: Boolean = false): RangeMarker =
    ReadAction.compute<RangeMarker, RuntimeException> {
      document
          .createRangeMarker(
              start.toOffset(document), end.toOffset(document), surviveOnExternalChange)
          .also {
            it.isGreedyToLeft = true
            it.isGreedyToRight = true
          }
    }

fun Range.length() = end.line - start.line + 1

fun Range.toOffset() = 0
