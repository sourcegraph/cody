package com.sourcegraph.cody.edit

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker

open class DocumentMarkerSession(val document: Document) {
  protected val rangeMarkers: MutableSet<RangeMarker> = mutableSetOf()
  private val logger = Logger.getInstance(DocumentMarkerSession::class.java)

  fun removeMarker(marker: RangeMarker) {
    try {
      marker.dispose()
      rangeMarkers.remove(marker)
    } catch (x: Exception) {
      logger.debug("Error disposing marker $marker", x)
    }
  }

  fun createMarker(startOffset: Int, endOffset: Int): RangeMarker {
    return document.createRangeMarker(startOffset, endOffset).apply { rangeMarkers.add(this) }
  }

  open fun finish() {
    rangeMarkers.forEach { it.dispose() }
    rangeMarkers.clear()
  }
}
