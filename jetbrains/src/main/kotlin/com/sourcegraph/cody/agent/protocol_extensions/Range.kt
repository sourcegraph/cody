package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.openapi.editor.Document
import com.sourcegraph.cody.agent.protocol_generated.Range

typealias RangePair = Pair<Long, Long>

typealias RangeOffset = Pair<Int, Int>

// We need to .plus(1) since the ranges use 0-based indexing
// but IntelliJ presents it as 1-based indexing.
public fun Range.intellijRange(): RangePair = RangePair(start.line.plus(1), end.line.plus(1))

// The link to Sourcegraph Search on the other hand looks like this:
fun Range.toSearchRange(): RangePair = RangePair(start.line.plus(1), end.line)

/**
 * Converts the range represented by this [Range] object to a pair of offsets within the given
 * [Document].
 *
 * If the start or end position of the range is outside the document, the corresponding offset will
 * be set to 0 or the document's text length, respectively.
 *
 * @param document The [Document] to use for converting the range to offsets.
 * @return A [RangeOffset] pair containing the start and end offsets of the range within the
 *   document.
 */
fun Range.toOffsetRange(document: Document): RangeOffset {
  if (start.line == end.line) {
    if (start.character > end.character) {
      throw IllegalArgumentException(
          "start.character (${start.character}) > end.character (${end.character})")
    }
  }

  val startOffset = if (start.isOutsideOfDocument(document)) 0 else start.toOffsetOrZero(document)
  val endOffset =
      if (end.isOutsideOfDocument(document)) document.textLength else end.toOffsetOrZero(document)

  return RangeOffset(startOffset, endOffset)
}

fun Range.length() = end.line - start.line + 1
