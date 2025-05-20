package com.sourcegraph.cody.auth

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.io.File
import org.junit.Test

class CodySecureStoreTest : BasePlatformTestCase() {
  private lateinit var secureStore: CodySecureStore

  public override fun setUp() {
    super.setUp()
    secureStore = CodySecureStore()
  }

  @Test
  fun testSecureStoreWriteAndRead() {
    // Basic test for writing and reading from the secure store
    val testKey = "testKey"
    val testValue = "testValue123"

    // Write to the store
    secureStore.writeToSecureStore(testKey, testValue)

    // Read from the store
    val retrievedValue = secureStore.getFromSecureStore(testKey)

    // Verify results
    assertEquals("Retrieved value should match what was stored", testValue, retrievedValue)
  }

  @Test
  fun testSecureStoreRemoveValue() {
    // Test removing a value from the secure store
    val testKey = "testKey"
    val testValue = "testValue123"

    // First add the value
    secureStore.writeToSecureStore(testKey, testValue)

    // Verify it was added
    val retrievedValue = secureStore.getFromSecureStore(testKey)
    assertEquals("Value should be stored correctly", testValue, retrievedValue)

    // Now remove it
    secureStore.writeToSecureStore(testKey, null)

    // Verify it was removed
    val afterRemoveValue = secureStore.getFromSecureStore(testKey)
    assertNull("Value should be null after removal", afterRemoveValue)
  }

  @Test
  fun testSecureStoreNonExistentKey() {
    // Test behavior when trying to access a non-existent key
    val nonExistentKey = "nonExistentKey${System.currentTimeMillis()}"

    // Try to read a key that doesn't exist
    val value = secureStore.getFromSecureStore(nonExistentKey)

    // Verify result
    assertNull("Non-existent key should return null", value)
  }

  @Test
  fun testSecureStoreKeyOverwrite() {
    // Test overwriting an existing value
    val testKey = "testKey"
    val initialValue = "initialValue"
    val newValue = "newValue"

    // Write initial value
    secureStore.writeToSecureStore(testKey, initialValue)

    // Verify initial value
    val initialRetrieval = secureStore.getFromSecureStore(testKey)
    assertEquals("Initial value should be stored correctly", initialValue, initialRetrieval)

    // Overwrite with new value
    secureStore.writeToSecureStore(testKey, newValue)

    // Verify new value
    val newRetrieval = secureStore.getFromSecureStore(testKey)
    assertEquals("New value should overwrite the previous value", newValue, newRetrieval)
  }

  @Test
  fun testMultipleKeysManagement() {
    // Test that multiple keys can be managed independently
    val keys = listOf("key1", "key2", "key3")
    val values = listOf("value1", "value2", "value3")

    // Store all keys
    keys.forEachIndexed { index, key -> secureStore.writeToSecureStore(key, values[index]) }

    // Verify all keys can be retrieved correctly
    keys.forEachIndexed { index, key ->
      val value = secureStore.getFromSecureStore(key)
      assertEquals("Value for key $key should match", values[index], value)
    }

    // Remove one key
    secureStore.writeToSecureStore(keys[1], null)

    // Verify the removed key returns null
    assertNull("Removed key should return null", secureStore.getFromSecureStore(keys[1]))

    // Verify other keys are still accessible
    assertEquals(
        "Unmodified key should still be accessible",
        values[0],
        secureStore.getFromSecureStore(keys[0]),
    )
    assertEquals(
        "Unmodified key should still be accessible",
        values[2],
        secureStore.getFromSecureStore(keys[2]),
    )
  }

  @Test
  fun testReinitializeStoreOnCorruption() {
    // Test the store reinitializes correctly when corrupted
    val testKey = "testKey"
    val testValue = "testValue"

    // First add a value
    secureStore.writeToSecureStore(testKey, testValue)

    // Corrupt the store file
    assertTrue(
        "Store file should exist before corruption",
        secureStore.getKeyStoreFile().exists(),
    )
    secureStore.getKeyStoreFile().writeText("This is corrupted data")

    // Previous value should be lost due to reinitialization
    val retrievedValue = secureStore.getFromSecureStore(testKey)
    assertNull("Value should be null after reinitialization", retrievedValue)

    // Verify backup file was created
    val backupFile = File(secureStore.getKeyStoreFile().absolutePath + ".bak")
    assertTrue("Backup file should exist after reinitialization", backupFile.exists())

    // Should be able to write new values to the reinitialized store
    val newTestKey = "newTestKey"
    val newTestValue = "newTestValue"
    secureStore.writeToSecureStore(newTestKey, newTestValue)

    // Verify the new value was correctly stored
    val newRetrievedValue = secureStore.getFromSecureStore(newTestKey)
    assertEquals(
        "New value should be retrievable after reinitialization", newTestValue, newRetrievedValue)
  }
}
