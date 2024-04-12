package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.editor.Document

data class Position(val line: Int, val character: Int) {

  /** Return zero-based offset of this position in the document. */
  fun toOffset(document: Document): Int {
    val lineStartOffset = document.getLineStartOffset(line)
    return lineStartOffset + character
  }

  companion object {
    fun fromOffset(document: Document, offset: Int): Position {
      val line = document.getLineNumber(offset)
      val lineStartOffset = document.getLineStartOffset(line)
      return Position(line, offset - lineStartOffset)
    }
  }
}
