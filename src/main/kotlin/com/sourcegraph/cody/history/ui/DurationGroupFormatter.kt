package com.sourcegraph.cody.history.ui

import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit

object DurationGroupFormatter {

  fun format(since: LocalDateTime, now: LocalDateTime = LocalDateTime.now()): String {
    val days = ChronoUnit.DAYS.between(since, now).toInt()
    val weeks = ChronoUnit.WEEKS.between(since, now).toInt()
    val months = ChronoUnit.MONTHS.between(since, now).toInt()
    val years = ChronoUnit.YEARS.between(since, now).toInt()
    // order of these conditions looks shuffled, but this covers edge-cases
    // for example: "last month" has higher priority than "4 weeks ago"
    return when {
      days == 0 -> CodyBundle.getString("duration.today")
      days == 1 -> CodyBundle.getString("duration.yesterday")
      days in 2..6 -> CodyBundle.getString("duration.x-days-ago").fmt(days.toString())
      weeks == 1 -> CodyBundle.getString("duration.last-week")
      months == 1 -> CodyBundle.getString("duration.last-month")
      weeks in 2..4 -> CodyBundle.getString("duration.x-weeks-ago").fmt(weeks.toString())
      years == 1 -> CodyBundle.getString("duration.last-year")
      months in 2..12 -> CodyBundle.getString("duration.x-months-ago").fmt(months.toString())
      else -> CodyBundle.getString("duration.x-years-ago").fmt(years.toString())
    }
  }
}
