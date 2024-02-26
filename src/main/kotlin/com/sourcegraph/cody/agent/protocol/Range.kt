package com.sourcegraph.cody.agent.protocol

typealias IntelliJRange = Pair<Int, Int>

data class Range(val start: Position, val end: Position) {

  // We need to .plus(1) since the ranges use 0-based indexing
  // but IntelliJ presents it as 1-based indexing.
  fun intellijRange(): IntelliJRange = IntelliJRange(start.line.plus(1), end.line.plus(1))
}
