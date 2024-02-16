@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ClientCapabilities(
  var completions: String? = null, // Oneof: none
  var chat: String? = null, // Oneof: none, streaming
  var git: String? = null, // Oneof: none, disabled
  var progressBars: String? = null, // Oneof: none, enabled
  var edit: String? = null, // Oneof: none, enabled
  var editWorkspace: String? = null, // Oneof: none, enabled
  var untitledDocuments: String? = null, // Oneof: none, enabled
  var showDocument: String? = null, // Oneof: none, enabled
  var codeLenses: String? = null, // Oneof: none, enabled
  var showWindowMessage: String? = null, // Oneof: notification, request
)

