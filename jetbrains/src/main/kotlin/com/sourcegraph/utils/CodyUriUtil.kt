package com.sourcegraph.utils

import java.io.File
import java.net.URI
import java.nio.file.Path
import java.nio.file.Paths

object CodyUriUtil {
    /**
     * Normalizes a URI string to a consistent format across platforms.
     */
    @JvmStatic
    fun normalizeUri(uriString: String): URI {
        if (uriString.isBlank()) {
            throw IllegalArgumentException("URI string cannot be empty")
        }

        return when {
            uriString.contains("://") -> URI.create(uriString)
            uriString.startsWith("untitled:") -> URI.create(uriString).withScheme("file")
            File(uriString).isAbsolute -> File(uriString).toURI()
            else -> Paths.get(uriString).toUri()
        }
    }

    @JvmStatic
    fun toPath(uriString: String): Path = 
        Paths.get(normalizeUri(uriString))

    @JvmStatic
    fun areEquivalent(uri1: String, uri2: String): Boolean =
        normalizeUri(uri1).normalize() == normalizeUri(uri2).normalize()

    @JvmStatic
    fun toNormalizedString(uriString: String): String =
        normalizeUri(uriString).toString()
}
