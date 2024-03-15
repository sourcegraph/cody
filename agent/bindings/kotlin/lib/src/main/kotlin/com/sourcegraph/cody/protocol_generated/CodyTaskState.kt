@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class CodyTaskState(
  val idle: Int? = null,
  val working: Int? = null,
  val inserting: Int? = null,
  val applying: Int? = null,
  val formatting: Int? = null,
  val applied: Int? = null,
  val finished: Int? = null,
  val error: Int? = null,
  val pending: Int? = null,
)

