package com.sourcegraph.common

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.nio.file.Path
import java.nio.file.Paths
import java.util.Objects

class CodyFileUri
private constructor(
    val originalScheme: String?,
    private val uri: URI,
    private val basePath: String?
) {
  fun toPath(): Path {
    return Paths.get(uri)
  }

  fun toAbsolutePath(): Path {
    var path = Paths.get(uri)
    if (!path.isAbsolute && basePath != null) {
      path = Paths.get(basePath).resolve(path)
    }
    return path
  }

  override fun toString(): String {
    return uri.toString()
  }

  fun toUri(): URI {
    return uri
  }

  fun isUntitled(): Boolean {
    return Objects.equals(originalScheme, "untitled")
  }

  companion object {
    @JvmStatic
    fun parse(input: String, basePath: String?): CodyFileUri {
      val uri: URI
      val scheme: String?

      if (input.startsWith("file:") || input.startsWith("untitled:")) {
        var fixedInput = addSlashesToWinPath(input)
        fixedInput = fixedInput.replace("//wsl.localhost", "////wsl.localhost")
        uri = URI(fixedInput)
        scheme = uri.scheme

        var modifiedUri = uri
        if (!Objects.equals(scheme, "file")) {
          modifiedUri = replaceScheme(modifiedUri, "file")
        }

        if (!modifiedUri.schemeSpecificPart.startsWith("///")) {
          modifiedUri = replacePath(modifiedUri, "///" + modifiedUri.schemeSpecificPart)
        }

        return CodyFileUri(scheme, modifiedUri, basePath)
      } else {
        val decodedInput = URLDecoder.decode(input, StandardCharsets.UTF_8)
        scheme = null

        var processedInput = decodedInput
        if (processedInput.length > 1 &&
            Character.isLetter(processedInput[0]) &&
            processedInput[1] == ':') {
          processedInput = processedInput.replace("\\", "/")
        }

        uri = URI("file:///" + processedInput.trimStart('/'))
      }

      return CodyFileUri(scheme, uri, basePath)
    }

    private fun replacePath(originalUri: URI, newPath: String): URI {
      val uriString = originalUri.toString()
      val schemePos = uriString.indexOf(":")
      val scheme = uriString.substring(0, schemePos + 1)
      return URI(scheme + newPath)
    }

    private fun replaceScheme(originalUri: URI, newScheme: String): URI {
      val uriString = originalUri.toString().replace(originalUri.scheme + ":", "$newScheme:")
      return URI(uriString)
    }

    private fun addSlashesToWinPath(uri: String?): String {
      if (uri.isNullOrEmpty()) {
        return uri ?: ""
      }

      var processedUri = uri.replace("%3A", ":")

      val schemePos = processedUri.indexOf(":")
      if (schemePos == -1) {
        return processedUri
      }

      // Extract the scheme part (e.g., "file:" or "untitled:")
      val scheme = processedUri.substring(0, schemePos + 1)

      // Get the rest of the URI after the scheme
      val path = processedUri.substring(schemePos + 1)

      // Check if the path starts with slashes followed by a drive letter pattern
      if (path.matches("/{0,2}[a-zA-Z]:/.*".toRegex())) {
        // Extract the drive letter part
        val drivePath = path.replaceFirst("^/+".toRegex(), "")
        // Ensure we have exactly three slashes between scheme and drive letter
        return "$scheme///$drivePath"
      }

      return processedUri
    }
  }
}
