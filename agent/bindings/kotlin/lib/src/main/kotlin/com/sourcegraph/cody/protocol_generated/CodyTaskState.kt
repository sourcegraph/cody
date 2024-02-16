@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CodyTaskState(
  var idle: Int? = null,
  var working: Int? = null,
  var inserting: Int? = null,
  var applying: Int? = null,
  var formatting: Int? = null,
  var applied: Int? = null,
  var finished: Int? = null,
  var error: Int? = null,
  var pending: Int? = null,
)

