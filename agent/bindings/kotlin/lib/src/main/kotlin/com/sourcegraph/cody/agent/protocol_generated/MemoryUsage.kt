@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class MemoryUsage(
  val rss: Long,
  val heapTotal: Long,
  val heapUsed: Long,
  val external: Long,
  val arrayBuffers: Long,
)

