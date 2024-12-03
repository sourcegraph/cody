package com.sourcegraph.common

import java.text.MessageFormat
import java.util.*
import org.jetbrains.annotations.PropertyKey

object CodyBundle {
  private const val BUNDLE: String = "CodyBundle"
  private val instance: ResourceBundle = ResourceBundle.getBundle(BUNDLE)

  /**
   * A more restrictive version of [MessageFormat.format]. Since each parameter must be a non-null
   * [String], we can capture the unintended parameter types (like `io.vavr.control.Option`) more
   * easily during the build (this is realized with ArchUnit; see the test against `Option#toString`
   * in the top-level project). Note that we consciously use the name "fmt" instead of "format" to
   * avoid an accidental use of [String.format] and emphasize the need to use the
   * [lombok.experimental.ExtensionMethod] annotation.
   *
   * @param this@fmt as in [MessageFormat.format]
   * @param args as in [MessageFormat.format], but each parameter must be a non-null [String] and
   *   not just a nullable [Object]
   * @return the formatted string
   */
  fun String.fmt(vararg args: String): String {
    return MessageFormat.format(this, *args)
  }

  fun getString(@PropertyKey(resourceBundle = BUNDLE) key: String): String {
    return instance.getString(key)
  }
}
