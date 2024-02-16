@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class EditTask(
  var id: String? = null,
  var state: CodyTaskState? = null,
  var error: CodyError? = null,
)

