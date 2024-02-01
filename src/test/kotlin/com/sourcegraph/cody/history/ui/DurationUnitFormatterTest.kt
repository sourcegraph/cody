package com.sourcegraph.cody.history.ui

import java.time.LocalDateTime
import junit.framework.TestCase

class DurationUnitFormatterTest : TestCase() {

  fun `test format 24h-like unit durations`() {
    assertEquals("0s", formatSinceEpoch("1970-01-01T00:00:00"))
    assertEquals("12s", formatSinceEpoch("1970-01-01T00:00:12"))
    assertEquals("7m", formatSinceEpoch("1970-01-01T00:07:14"))
    assertEquals("4h", formatSinceEpoch("1970-01-01T04:12:04"))
    assertEquals("12h", formatSinceEpoch("1970-01-01T12:04:17"))
    assertEquals("5d", formatSinceEpoch("1970-01-06T04:12:57"))
    assertEquals("162d", formatSinceEpoch("1970-06-12T01:23:45"))
  }

  private fun formatSinceEpoch(now: String) =
      DurationUnitFormatter.format(
          since = LocalDateTime.parse("1970-01-01T00:00:00"), now = LocalDateTime.parse(now))
}
