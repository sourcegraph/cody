package com.sourcegraph.cody.vscode

import com.intellij.openapi.editor.Document

data class Position(@JvmField val line: Int, @JvmField val character: Int) {

  /** Returns zero-based document offset for this position. */
  fun toOffset(document: Document): Int {
    val lineStartOffset = document.getLineStartOffset(line)
    return lineStartOffset + character
  }
}
