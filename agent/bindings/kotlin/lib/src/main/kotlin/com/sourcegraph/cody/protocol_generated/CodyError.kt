@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CodyError(
  val message: String? = null,
  val cause: CodyError? = null,
  val stack: String? = null,
)

