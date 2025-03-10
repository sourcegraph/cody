@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class AuthError(
  val name: String,
  val message: String,
  val stack: String? = null,
  val title: String,
  val content: String,
  val showTryAgain: Boolean,
)

