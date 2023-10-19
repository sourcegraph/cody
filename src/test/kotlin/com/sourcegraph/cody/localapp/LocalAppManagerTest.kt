package com.sourcegraph.cody.localapp

import junit.framework.TestCase

class LocalAppManagerTest : TestCase() {

  // These tests are just a sanity check to make sure the LocalAppManager API doesn't throw random
  // exceptions, not verifying if they actually work for now.

  fun `test isLocalAppInstalled works`() {
    LocalAppManager.isLocalAppInstalled()
  }

  fun `test isLocalAppRunning works`() {
    LocalAppManager.isLocalAppRunning()
  }

  fun `test getLocalAppInfo works`() {
    LocalAppManager.getLocalAppInfo()
  }

  fun `test getLocalAppAccessToken works`() {
    LocalAppManager.getLocalAppAccessToken()
  }

  fun `test getLocalAppUrl works`() {
    LocalAppManager.getLocalAppUrl()
  }
}
