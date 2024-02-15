@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class EventProperties(
  val anonymousUserID: String? = null,
  val prefix: String? = null,
  val client: String? = null,
  val source: SourceEnum? = null, // Oneof: IDEEXTENSION
)

