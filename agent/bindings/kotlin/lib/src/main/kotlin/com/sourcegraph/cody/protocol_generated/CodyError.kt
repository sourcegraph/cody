@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CodyError(
  var message: String? = null,
  var cause: CodyError? = null,
  var stack: String? = null,
)

