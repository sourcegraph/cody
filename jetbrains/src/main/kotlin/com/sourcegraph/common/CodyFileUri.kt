package com.sourcegraph.common

import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.withPath
import java.net.URI
import java.net.URLDecoder
import java.nio.file.InvalidPathException
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.toPath

class CodyFileUri private constructor(val originalScheme: String, val uri: URI) {
  val isUntitled: Boolean
    get() = originalScheme == "untitled"

  fun toPath(basePath: String?): Path {
    var path = uri.toPath()
    if (!path.isAbsolute && basePath != null) {
      val fixedPath = Paths.get(path.toString().trimStart('/', '\\'))
      path = Paths.get(basePath).resolve(fixedPath)
    }
    return path.normalize()
  }

  fun toPath(): Path = uri.toPath()

  override fun toString() = uri.toString()

  companion object {
    private fun getPath(path: String): Path? {
      return try {
        Paths.get(path)
      } catch (e: InvalidPathException) {
        null
      }
    }

    fun parse(input: String): CodyFileUri {
      if (input.isEmpty()) throw IllegalArgumentException("Input cannot be empty")

      var processedInput = input
      if (processedInput.contains("%")) {
        processedInput = URLDecoder.decode(processedInput, "UTF-8")
      }

      var uri: URI
      val scheme: String
      val path = getPath(processedInput)
      if (path != null) {
        uri = path.toUri()
        scheme = ""
      } else {
        val colonIndex = processedInput.indexOf(':')
        scheme = processedInput.substring(0, colonIndex)
        processedInput = "file:///${processedInput.substring(colonIndex + 1).trimStart('/')}"

        uri =
            VfsUtil.toUri(processedInput)
                ?: throw IllegalArgumentException("input is not valid uri")
        if (uri.path == null) {
          uri = uri.withPath("/" + uri.schemeSpecificPart)
        }
        if (uri.path.contains("wsl.localhost")) {
          uri = uri.withPath("////" + uri.path.trimStart('/'))
        }
      }

      return CodyFileUri(scheme, uri)
    }
  }
}
