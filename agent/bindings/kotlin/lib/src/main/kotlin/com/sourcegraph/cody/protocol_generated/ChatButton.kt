@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatButton(
  var label: String? = null,
  var action: String? = null,
  var appearance: String? = null, // Oneof: primary, secondary, icon
)

