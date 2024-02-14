@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class EventProperties(
  var anonymousUserID: String? = null,
  var prefix: String? = null,
  var client: String? = null,
  var source: String? = null, // Oneof: IDEEXTENSION
)

