@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatButton(
  val label: String? = null,
  val action: String? = null,
  val appearance: AppearanceEnum? = null, // Oneof: primary, secondary, icon
)

