package com.sourcegraph.cody.test

import com.intellij.testFramework.fixtures.IdeaTestExecutionPolicy

/**
 * Used for all Cody JetBrains integration tests. You have to specify it via the System property
 * `idea.test.execution.policy` in order to run the tests.
 */
@Suppress("unused")
class NonEdtIdeaTestExecutionPolicy : IdeaTestExecutionPolicy() {

  override fun getName(): String = javaClass.name

  /**
   * This setting enables our integration tests. If they use the default policy and run on the EDT,
   * then they either deadlock or finish prematurely, because they cannot block on our long-running
   * multithreaded async backend operations. With this set to false, we run on the JUnit runner
   * thread, which can block.
   */
  override fun runInDispatchThread() = false
}
