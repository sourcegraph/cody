package com.sourcegraph.cody.chat.ui

// Can pluralize "file", "line" and "repo" by adding -s
fun String.pluralize(count: Int): String =
    when {
      count == 1 -> this
      else -> "${this}s"
    }
