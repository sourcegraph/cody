package com.sourcegraph.cody.initialization

import java.time.Duration
import java.time.Instant

class PrettyTimer {
  val start = Instant.now()

  fun elapsed(): Duration {
    return Duration.between(start, Instant.now())
  }

  companion object {
    @JvmStatic
    fun <T> debugTask(name: String, fn: () -> T): T {
      val timer = PrettyTimer()
      val result = fn()
      println("Task '$name' - $timer")
      return result
    }
  }

  override fun toString(): String {
    val duration = elapsed()
    val hours = duration.toHours()
    val minutes = duration.toMinutes() % 60
    val seconds = duration.seconds % 60
    val millis = duration.toMillis() % 1000

    return when {
      hours > 0 -> String.format("%dhr%02dmin%02ds", hours, minutes, seconds)
      minutes > 0 -> String.format("%dmin%02ds", minutes, seconds)
      seconds > 0 -> String.format("%ds%03dms", seconds, millis)
      else -> String.format("%dms", millis)
    }
  }
}
