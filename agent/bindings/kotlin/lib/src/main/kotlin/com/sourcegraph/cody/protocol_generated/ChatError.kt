@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ChatError(
  var kind: String? = null,
  var name: String? = null,
  var message: String? = null,
  var retryAfter: String? = null,
  var limit: Int? = null,
  var userMessage: String? = null,
  var retryAfterDate: Date? = null,
  var retryAfterDateString: String? = null,
  var retryMessage: String? = null,
  var feature: String? = null,
  var upgradeIsAvailable: Boolean? = null,
  var isChatErrorGuard: String? = null, // Oneof: isChatErrorGuard
)

