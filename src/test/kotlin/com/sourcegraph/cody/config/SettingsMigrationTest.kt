package com.sourcegraph.cody.config

import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.RemoteRepositoryState
import junit.framework.TestCase

class SettingsMigrationTest : TestCase() {

  fun `test migrateUrlsToCodebaseNames`() {
    val inputEnhancedContextState =
        EnhancedContextState().also {
          it.isEnabled = true
          it.remoteRepositories =
              mutableListOf(
                  RemoteRepositoryState().also {
                    it.remoteUrl = "HTTPS://GITHUB.COM/SOURCEGRAPH/ABOUT1"
                    it.isEnabled = true
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "hTtP://GiThUb.cOm/sOuRcEgRaPh/aBoUt2"
                    it.isEnabled = false
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "https://github.com/sourcegraph/about3"
                  },
                  RemoteRepositoryState().also { // duplicate
                    it.remoteUrl = "https://github.com/sourcegraph/about3"
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "http://github.com/sourcegraph/about4"
                  },
                  RemoteRepositoryState().also { // desired value but deprecated field
                    it.remoteUrl = "github.com/sourcegraph/about5"
                  },
                  RemoteRepositoryState().also { // no remoteUrl/codebaseName value
                    it.isEnabled = true
                  },
                  RemoteRepositoryState().also { // desired value in place
                    it.codebaseName = "github.com/sourcegraph/about7"
                  },
                  RemoteRepositoryState().also { // desired value in place; duplicate
                    it.codebaseName = "github.com/sourcegraph/about7"
                  },
              )
        }

    val expectedEnhancedContextState =
        EnhancedContextState().also {
          it.isEnabled = true
          it.remoteRepositories =
              mutableListOf(
                  RemoteRepositoryState().also {
                    it.remoteUrl = "HTTPS://GITHUB.COM/SOURCEGRAPH/ABOUT1"
                    it.codebaseName = "github.com/sourcegraph/about1"
                    it.isEnabled = true
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "hTtP://GiThUb.cOm/sOuRcEgRaPh/aBoUt2"
                    it.codebaseName = "github.com/sourcegraph/about2"
                    it.isEnabled = false
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "https://github.com/sourcegraph/about3"
                    it.codebaseName = "github.com/sourcegraph/about3"
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "http://github.com/sourcegraph/about4"
                    it.codebaseName = "github.com/sourcegraph/about4"
                  },
                  RemoteRepositoryState().also {
                    it.remoteUrl = "github.com/sourcegraph/about5"
                    it.codebaseName = "github.com/sourcegraph/about5"
                  },
                  RemoteRepositoryState().also {
                    it.codebaseName = "github.com/sourcegraph/about7"
                  },
              )
        }

    SettingsMigration.migrateUrlsToCodebaseNames(inputEnhancedContextState)
    assertEquals(expectedEnhancedContextState, inputEnhancedContextState)
  }
}
