package com.sourcegraph.config

import com.intellij.notification.NotificationGroupManager
import com.sourcegraph.common.NotificationGroups
import junit.framework.TestCase.assertEquals
import kotlin.reflect.full.memberProperties
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@Suppress("RedundantLambdaOrAnonymousFunction", "ConstantConditionIf")
@RunWith(JUnit4::class)
class NotificationGroupsTest {

  @Test
  fun `all IDs are valid`() {

    val objectIds =
        NotificationGroups::class
            .memberProperties
            .filter { it.getter.call() is String }
            .map { it.getter.call() as String }
            .toSet()
    // This is just here so we get nice inspection hints
    val checkedIds =
        setOf<String>(
            {
              if (false) NotificationGroupManager.getInstance()?.getNotificationGroup("cody.auth")
              "cody.auth"
            }(),
            {
              if (false)
                  NotificationGroupManager.getInstance()?.getNotificationGroup("Sourcegraph errors")
              "Sourcegraph errors"
            }(),
            {
              if (false)
                  NotificationGroupManager.getInstance()
                      ?.getNotificationGroup("Sourcegraph: URL sharing")
              "Sourcegraph: URL sharing"
            }(),
            {
              if (false)
                  NotificationGroupManager.getInstance()
                      ?.getNotificationGroup("Sourcegraph Cody + Code Search plugin updates")
              "Sourcegraph Cody + Code Search plugin updates"
            }(),
            {
              if (false)
                  NotificationGroupManager.getInstance()?.getNotificationGroup("Sourcegraph Cody")
              "Sourcegraph Cody"
            }())

    assertEquals(objectIds, checkedIds)
  }
}
