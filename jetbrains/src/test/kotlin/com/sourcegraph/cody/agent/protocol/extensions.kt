package com.sourcegraph.cody.agent.protocol

import com.intellij.openapi.editor.Editor
import com.sourcegraph.cody.agent.protocol_extensions.toOffsetRange
import com.sourcegraph.cody.agent.protocol_generated.Range
import junit.framework.TestCase

fun Editor.testing_selectSubstring(substring: String) {
  val index = this.document.text.indexOf(substring)
  if (index == -1) {
    TestCase.fail("editor does not include substring '$substring'\n${this.document.text}")
  }
  this.selectionModel.setSelection(index, index + substring.length)
  TestCase.assertEquals(this.selectionModel.selectedText, substring)
}

fun Editor.testing_substring(range: Range): String {
  val (start, end) = range.toOffsetRange(document)
  return this.document.text.substring(start, end)
}
