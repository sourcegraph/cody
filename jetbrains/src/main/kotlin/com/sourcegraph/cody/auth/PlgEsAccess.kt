package com.sourcegraph.cody.auth

import java.util.*

/**
 * Utility to check if PLG ES access is disabled based on date. PLG ES access is disabled after July
 * 23, 2025 10:00 AM PST
 */
object PlgEsAccess {
  // July 23, 2025 10:00 AM PST (UTC-8) = July 23, 2025 18:00 UTC
  private val PLG_ES_ACCESS_DISABLE_DATE =
      Calendar.getInstance(TimeZone.getTimeZone("UTC"))
          .apply {
            set(2025, Calendar.JULY, 23, 18, 0, 0)
            set(Calendar.MILLISECOND, 0)
          }
          .time

  fun isDisabled(): Boolean {
    return Date() > PLG_ES_ACCESS_DISABLE_DATE
  }

  fun isWorkspaceInstance(url: String): Boolean {
    return try {
      val host = java.net.URL(url).host.lowercase()
      host.endsWith(".sourcegraph.app") ||
          host.endsWith(".sourcegraphdev.app") ||
          host.endsWith(".sourcegraphapp.test:3443")
    } catch (e: Exception) {
      false
    }
  }
}
