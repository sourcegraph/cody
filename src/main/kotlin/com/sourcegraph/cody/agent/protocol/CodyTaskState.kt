package com.sourcegraph.cody.agent.protocol

enum class CodyTaskState(val id: Int) {
  Idle(1),
  Working(2),
  Inserting(3),
  Applying(4),
  Formatting(5),
  Applied(6),
  Finished(7),
  Error(8),
  Pending(9)
}
