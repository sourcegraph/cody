package com.sourcegraph.config

import junit.framework.TestCase.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class FeatureFlagsTest {

  @Test
  fun `parseFeatureFlags returns empty map when input is null`() {
    val result = ConfigUtil.parseFeatureFlags(null)
    assertEquals(emptyMap<String, Boolean>(), result)
  }

  @Test
  fun `parseFeatureFlags returns empty map when input is empty`() {
    val result = ConfigUtil.parseFeatureFlags("")
    assertEquals(emptyMap<String, Boolean>(), result)
  }

  @Test
  fun `parseFeatureFlags parses single flag correctly`() {
    val result = ConfigUtil.parseFeatureFlags("feature1=true")
    assertEquals(mapOf("feature1" to true), result)
  }

  @Test
  fun `parseFeatureFlags parses multiple flags correctly`() {
    val result = ConfigUtil.parseFeatureFlags("feature1=true,feature2=false")
    assertEquals(mapOf("feature1" to true, "feature2" to false), result)
  }

  @Test
  fun `parseFeatureFlags ignores invalid entries`() {
    val result = ConfigUtil.parseFeatureFlags("feature1=true,invalidEntry,feature2=false")
    assertEquals(mapOf("feature1" to true, "feature2" to false), result)
  }

  @Test
  fun `parseFeatureFlags trims whitespace around keys and values`() {
    val result = ConfigUtil.parseFeatureFlags(" feature1 = true , feature2 =false ")
    assertEquals(mapOf("feature1" to true, "feature2" to false), result)
  }

  @Test
  fun `parseFeatureFlags handles non-boolean values as false`() {
    val result = ConfigUtil.parseFeatureFlags("feature1=notABoolean")
    assertEquals(mapOf("feature1" to false), result)
  }
}
