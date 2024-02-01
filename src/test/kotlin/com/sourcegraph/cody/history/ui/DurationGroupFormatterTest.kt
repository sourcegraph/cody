package com.sourcegraph.cody.history.ui

import java.time.LocalDateTime
import junit.framework.TestCase

class DurationGroupFormatterTest : TestCase() {

  fun `test format Yesterday-like durations`() {
    assertEquals("Today", formatSinceEpoch("1970-01-01T12:00:00"))

    assertEquals("Yesterday", formatSinceEpoch("1970-01-02T12:00:00"))
    assertEquals("2 days ago", formatSinceEpoch("1970-01-03T12:00:00"))
    assertEquals("6 days ago", formatSinceEpoch("1970-01-07T12:00:00"))

    assertEquals("Last week", formatSinceEpoch("1970-01-08T12:00:00"))
    assertEquals("2 weeks ago", formatSinceEpoch("1970-01-15T06:00:00"))
    assertEquals("2 weeks ago", formatSinceEpoch("1970-01-21T06:00:00"))
    assertEquals("3 weeks ago", formatSinceEpoch("1970-01-28T06:00:00"))
    assertEquals("4 weeks ago", formatSinceEpoch("1970-01-31T06:00:00"))

    assertEquals("Last month", formatSinceEpoch("1970-02-01T06:00:00"))
    assertEquals("7 months ago", formatSinceEpoch("1970-08-01T06:00:00"))

    assertEquals("Last year", formatSinceEpoch("1971-01-01T06:00:00"))
    assertEquals("2 years ago", formatSinceEpoch("1972-01-01T06:00:00"))
    assertEquals("1000 years ago", formatSinceEpoch("2970-01-01T12:00:00"))
  }

  private fun formatSinceEpoch(now: String) =
      DurationGroupFormatter.format(
          since = LocalDateTime.parse("1970-01-01T00:00:00"), now = LocalDateTime.parse(now))
}
