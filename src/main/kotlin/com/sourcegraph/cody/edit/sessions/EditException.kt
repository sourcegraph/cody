package com.sourcegraph.cody.edit.sessions

import com.intellij.openapi.editor.RangeMarker
import com.sourcegraph.cody.agent.protocol.TextEdit

class EditException(val edit: TextEdit, val marker: RangeMarker, cause: Throwable) :
    RuntimeException(cause) {
  override val message: String = "Edit failed: $edit at $marker}"
}
