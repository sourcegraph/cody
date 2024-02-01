package com.sourcegraph.cody.history.ui

import java.time.Duration
import java.time.LocalDateTime
import kotlin.time.DurationUnit.*
import kotlin.time.toKotlinDuration

object DurationUnitFormatter {

  fun format(since: LocalDateTime, now: LocalDateTime = LocalDateTime.now()): String {
    val duration = Duration.between(since, now).toKotlinDuration()
    return when {
      duration.inWholeSeconds < 60 -> duration.toString(SECONDS)
      duration.inWholeMinutes < 60 -> duration.toString(MINUTES)
      duration.inWholeHours < 24 -> duration.toString(HOURS)
      else -> duration.toString(DAYS)
    }
  }
}
