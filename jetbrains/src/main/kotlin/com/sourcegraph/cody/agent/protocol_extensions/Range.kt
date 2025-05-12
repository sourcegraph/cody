package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.sourcegraph.cody.agent.protocol_generated.Range

typealias RangeOffset = Pair<Int, Int>

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
fun Range.toOffsetRange(document: Document): RangeOffset? {
  if (start.line > end.line || (start.line == end.line && start.character > end.character)) {
    val logger = Logger.getInstance(Range::class.java)
    logger.warn(
        "Invalid range: start position (${start.line},${start.character}) > end position (${end.line},${end.character})")
    return null
  }

  return RangeOffset(start.toBoundedOffset(document), end.toBoundedOffset(document))
}

fun Range.length() = end.line - start.line + 1
