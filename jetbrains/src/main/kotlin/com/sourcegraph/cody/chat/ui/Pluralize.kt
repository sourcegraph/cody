package com.sourcegraph.cody.chat.ui

// Can pluralize "file", "line", "repo" and "repository"
fun String.pluralize(count: Int): String =
    when {
      count == 1 -> this
      this.endsWith("y") -> this.dropLast(1) + "ies"
      else -> this + "s"
    }
