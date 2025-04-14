package com.sourcegraph.common

import com.intellij.openapi.vfs.VfsUtil
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import kotlin.io.path.toPath

class CodyFileUri private constructor(val scheme: String, val filePath: String) {
  val isUntitled: Boolean
    get() = scheme == "untitled"

  val encodedFilePath: String
    get() = encode(filePath)

  override fun toString(): String {
    val encodedPath = encode(filePath).trimStart('/')
    val extraSlash = if (encodedPath.startsWith("wsl.localhost")) "/" else ""
    return "file:///$extraSlash$encodedPath"
  }

  private fun encode(input: String): String {
    return URLEncoder.encode(input, "UTF-8")
        .replace("+", "%20")
        .replace("%2F", "/")
        .replace("%3A", ":")
        .replace("%5C", "\\")
  }

  fun toUri(): URI? = VfsUtil.toUri(toString())

  fun toPath(): java.nio.file.Path? = toUri()?.toPath()

  companion object {
    fun parse(input: String): CodyFileUri {
      if (input.isEmpty()) throw IllegalArgumentException("input cannot be empty")

      var processedInput = input
      if (processedInput.contains("%")) {
        processedInput = URLDecoder.decode(processedInput, "UTF-8")
      }

      val regex = Regex("^(file:|untitled:|)?(/{0,3})(.+)$")
      val matchResult = regex.find(processedInput)

      if (matchResult != null) {
        val scheme = matchResult.groupValues[1].trimEnd(':')
        if (scheme.isNotEmpty() && scheme != "file" && scheme != "untitled") {
          throw IllegalArgumentException("Invalid scheme: $scheme")
        }
        val slashes = matchResult.groupValues[2]
        val path = matchResult.groupValues[3].replace('\\', '/')
        val isWindows = path.length >= 2 && path[1] == ':'
        val rootSlash = slashes.length == 3
        val extraSlash = if (!isWindows && rootSlash) "/" else ""

        return CodyFileUri(scheme.ifEmpty { "file" }, "$extraSlash$path")
      }

      throw IllegalArgumentException("Invalid input format: $input")
    }
  }
}
