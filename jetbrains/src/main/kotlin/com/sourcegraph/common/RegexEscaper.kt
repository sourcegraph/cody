package com.sourcegraph.common

import java.util.regex.Pattern

object RegexEscaper {
  private val SPECIAL_REGEX_CHARS = Pattern.compile("[{}()\\[\\].+*?^$\\\\|]")!!

  fun escapeRegexChars(string: String): String {
    return SPECIAL_REGEX_CHARS.matcher(string).replaceAll("\\\\$0")
  }
}
