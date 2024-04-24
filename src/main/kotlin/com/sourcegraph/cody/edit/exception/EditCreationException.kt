package com.sourcegraph.cody.edit.exception

import com.sourcegraph.cody.agent.protocol.TextEdit

class EditCreationException(val edit: TextEdit, cause: Throwable) : RuntimeException(cause) {
  override val message: String = "Failed to create the action for: $edit"
}
