package com.sourcegraph.cody.agent

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.sourcegraph.cody.agent.protocol_generated.CodyAgentServer as TargetCodyAgentServer
import kotlin.reflect.full.declaredFunctions
import kotlin.test.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ProtocolCompatibilityTest : BasePlatformTestCase() {
  /**
   * I verified this works by altering one of the copied methods. interface
   * com.sourcegraph.cody.agent._SubsetGeneratedCodyAgentServer is not a subset of interface
   * com.sourcegraph.cody.agent.protocol_generated.CodyAgentServer. Incompatible methods:
   * (graphql_currentUserId, [kotlin.String]) This ensures we make no changes to the protocol while
   * we're still subsetting generated protocol methods.
   */
  private fun assertSubsetInterface(superInterface: Class<*>, subInterface: Class<*>) {
    val superMethods =
        superInterface.kotlin.declaredFunctions
            .map { it.name to it.parameters.drop(1).map { param -> param.type } }
            .toSet()
    val subMethods =
        subInterface.kotlin.declaredFunctions
            .map { it.name to it.parameters.drop(1).map { param -> param.type } }
            .toSet()

    assertTrue(
        subMethods.all { it in superMethods },
        "$subInterface is not a subset of $superInterface. Incompatible methods: \n${(subMethods - superMethods).joinToString("\n")}")
  }

  @Test
  fun `copies generated protocol verbatim`() {
    assertSubsetInterface(
        TargetCodyAgentServer::class.java, _SubsetGeneratedCodyAgentServer::class.java)
  }
}
