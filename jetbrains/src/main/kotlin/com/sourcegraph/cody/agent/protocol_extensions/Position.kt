package com.sourcegraph.cody.agent.protocol_extensions

import com.intellij.openapi.editor.Document
import com.sourcegraph.cody.agent.protocol_generated.Position

fun Position(line: Int, character: Int): Position {
  return Position(line.toLong(), character.toLong())
}

fun Position.toBoundedOffset(document: Document): Int {
  if (line < 0) return 0
  if (line >= document.lineCount) return document.textLength
  if (character < 0) return document.getLineStartOffset(line.toInt())
  if (character >
      document.getLineEndOffset(line.toInt()) - document.getLineStartOffset(line.toInt())) {
    return document.getLineEndOffset(line.toInt())
  }
  return (document.getLineStartOffset(line.toInt()) + character).toInt()
}
