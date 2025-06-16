package com.sourcegraph.common

import java.net.URI
import java.nio.file.Path
import java.nio.file.Paths
import java.util.Objects

class CodyFileUri
private constructor(
    private val originalScheme: String?,
    private val uri: URI,
) {
  fun toAbsolutePath(basePath: String?): Path {
    val path = Paths.get(uri)
    if (!path.isAbsolute && basePath != null) {
      return Paths.get(basePath).resolve(path)
    }
    return path
  }

  override fun toString(): String {
    return uri.toString()
  }

  fun isUntitled(): Boolean {
    return Objects.equals(originalScheme, "untitled")
  }

  companion object {
    @JvmStatic
    fun parse(input: String): CodyFileUri {
      val uri: URI
      val scheme: String?

      if (input.startsWith("file:") || input.startsWith("untitled:")) {
        var fixedInput = addSlashesToWinPath(input)
        fixedInput = fixedInput.replace("//wsl.localhost", "////wsl.localhost")
        uri = URI(fixedInput)
        scheme = uri.scheme

        var modifiedUri = uri
        if (!Objects.equals(scheme, "file")) {
          val uriString = modifiedUri.toString().replace(modifiedUri.scheme + ":", "file:")
          modifiedUri = URI(uriString)
        }

        if (!modifiedUri.schemeSpecificPart.startsWith("///")) {
          modifiedUri = replacePath(modifiedUri, "///" + modifiedUri.schemeSpecificPart)
        }

        return CodyFileUri(scheme, modifiedUri)
      } else {
        val processedInput = input.replace("%5C", "/").replace("\\", "/").trimStart('/')

        return CodyFileUri(originalScheme = null, URI("file:///$processedInput"))
      }
    }

    private fun replacePath(originalUri: URI, newPath: String): URI {
      val uriString = originalUri.toString()
      val schemePos = uriString.indexOf(":")
      val scheme = uriString.substring(0, schemePos + 1)
      return URI(scheme + newPath)
    }

    private fun addSlashesToWinPath(uri: String?): String {
      if (uri.isNullOrEmpty()) {
        return uri ?: ""
      }

      val processedUri = uri.replace("%3A", ":")

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
