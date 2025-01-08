package com.sourcegraph.utils

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.URI

class CodyUriUtilTest {
    
    @Test
    fun `test standard file URIs`() {
        val expected = "file:///path/to/file.txt"
        val inputs = listOf(
            "/path/to/file.txt",
            "file:///path/to/file.txt",
            File("/path/to/file.txt").absolutePath
        )
        
        inputs.forEach { input ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(expected, result.toString())
        }
    }

    @Test
    fun `test Windows paths`() {
        val inputs = mapOf(
            "C:\\Users\\test\\file.txt" to "file:///C:/Users/test/file.txt",
            "C:/Users/test/file.txt" to "file:///C:/Users/test/file.txt",
            "file:///C:/Users/test/file.txt" to "file:///C:/Users/test/file.txt"
        )
        
        inputs.forEach { (input, expected) ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(expected, result.toString())
        }
    }

    @Test
    fun `test WSL paths`() {
        val inputs = mapOf(
            "\\\\wsl\$\\Ubuntu\\home\\user\\file.txt" to "file:////wsl$/Ubuntu/home/user/file.txt",
            "//wsl$/Ubuntu/home/user/file.txt" to "file:////wsl$/Ubuntu/home/user/file.txt"
        )
        
        inputs.forEach { (input, expected) ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(expected, result.toString())
        }
    }

    @Test
    fun `test untitled URIs`() {
        val input = "untitled:Untitled-1"
        val result = CodyUriUtil.normalizeUri(input)
        assertEquals("file:Untitled-1", result.toString())
    }

    @Test
    fun `test network paths`() {
        val inputs = mapOf(
            "\\\\server\\share\\file.txt" to "file:////server/share/file.txt",
            "//server/share/file.txt" to "file:////server/share/file.txt"
        )
        
        inputs.forEach { (input, expected) ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(expected, result.toString())
        }
    }

    @Test
    fun `test URI equivalence`() {
        val equivalentPairs = listOf(
            Pair("C:\\Users\\test\\file.txt", "file:///C:/Users/test/file.txt"),
            Pair("/path/to/file.txt", "file:///path/to/file.txt"),
            Pair("\\\\server\\share\\file.txt", "file:////server/share/file.txt")
        )
        
        equivalentPairs.forEach { (uri1, uri2) ->
            assertTrue(CodyUriUtil.areEquivalent(uri1, uri2))
        }
    }

    @Test
    fun `test path conversion`() {
        val inputs = mapOf(
            "file:///path/to/file.txt" to "/path/to/file.txt",
            "file:///C:/Users/test/file.txt" to "C:\\Users\\test\\file.txt"
        )
        
        inputs.forEach { (input, expected) ->
            val result = CodyUriUtil.toPath(input)
            assertEquals(File(expected).absolutePath, result.toFile().absolutePath)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `test empty URI string`() {
        CodyUriUtil.normalizeUri("")
    }

    @Test
    fun `test special characters in paths`() {
        val inputs = mapOf(
            "/path/with spaces/file.txt" to "file:///path/with%20spaces/file.txt",
            "/path/with#hash/file.txt" to "file:///path/with%23hash/file.txt",
            "/path/with?question/file.txt" to "file:///path/with%3Fquestion/file.txt"
        )
        
        inputs.forEach { (input, expected) ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(expected, result.toString())
        }
    }

    @Test
    fun `test remote URIs`() {
        val inputs = listOf(
            "http://example.com/file.txt",
            "https://example.com/file.txt",
            "ftp://example.com/file.txt"
        )
        
        inputs.forEach { input ->
            val result = CodyUriUtil.normalizeUri(input)
            assertEquals(input, result.toString())
        }
    }
}
