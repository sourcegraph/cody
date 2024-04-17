package com.sourcegraph.cody.config

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.registerServiceInstance
import com.sourcegraph.cody.agent.protocol.ChatModelsResponse
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.HistoryState
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.history.state.MessageState
import com.sourcegraph.cody.history.state.MessageState.SpeakerState
import com.sourcegraph.cody.history.state.RemoteRepositoryState

class SettingsMigrationTest : BasePlatformTestCase() {

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

  fun `test organiseChatsByAccount`() {
    val originalHistory =
        HistoryState().also {
          it.defaultLlm =
              LLMState.fromChatModel(
                  ChatModelsResponse.ChatModelProvider(
                      true, false, "Cyberdyne", "Terminator", "T-800"))
          it.defaultEnhancedContext =
              EnhancedContextState().also {
                it.isEnabled = true
                it.remoteRepositories =
                    mutableListOf(
                        RemoteRepositoryState().also {
                          it.isEnabled = true
                          it.remoteUrl = "http://example.com"
                          it.codebaseName = "Windows 9"
                        })
              }
          it.chats =
              mutableListOf(
                  ChatState("chat1").also {
                    it.accountId = "sarah"
                    it.messages =
                        mutableListOf(
                            MessageState().also {
                              it.text = "Hi there!"
                              it.speaker = SpeakerState.ASSISTANT
                            },
                            MessageState().also {
                              it.text = "Leave me alone!"
                              it.speaker = SpeakerState.HUMAN
                            })
                  },
                  ChatState("chat2").also {
                    it.accountId = "sarah"
                    it.messages =
                        mutableListOf(
                            MessageState().also {
                              it.text = "Please stay!"
                              it.speaker = SpeakerState.HUMAN
                            },
                            MessageState().also {
                              it.text = "I must go..."
                              it.speaker = SpeakerState.ASSISTANT
                            })
                  },
                  ChatState("chat3").also {
                    it.accountId = "dave"
                    it.llm =
                        LLMState.fromChatModel(
                            ChatModelsResponse.ChatModelProvider(
                                false, true, "Uni of IL", "HAL", "HAL 9000"))
                    it.messages =
                        mutableListOf(
                            MessageState().also {
                              it.text = "Open the door!"
                              it.speaker = SpeakerState.HUMAN
                            },
                            MessageState().also {
                              it.text = "No way!"
                              it.speaker = SpeakerState.ASSISTANT
                            })
                  },
                  ChatState("chat4"))
        }
    val project = myFixture.project
    project.registerServiceInstance(
        CodyAuthenticationManager::class.java, CodyAuthenticationManager(project))
    project.registerServiceInstance(HistoryService::class.java, HistoryService(project))
    HistoryService.getInstance(project)
        .loadState(HistoryState().also { it.copyFrom(originalHistory) })

    SettingsMigration.organiseChatsByAccount(project)

    val migratedHistory = HistoryService.getInstance(project).state

    assertEquals(2, migratedHistory.accountData.size)
    migratedHistory.accountData.forEachIndexed { index, accountEntry ->
      assertEquals("default LLM [$index]", originalHistory.defaultLlm, accountEntry.defaultLlm)
      assertEquals(
          "default enhanced context [$index]",
          originalHistory.defaultEnhancedContext,
          accountEntry.defaultEnhancedContext)
    }
    migratedHistory.accountData[0].let {
      assertEquals("sarah", it.accountId)
      assertEquals(mutableListOf(originalHistory.chats[0], originalHistory.chats[1]), it.chats)
    }
    migratedHistory.accountData[1].let {
      assertEquals("dave", it.accountId)
      assertEquals(mutableListOf(originalHistory.chats[2]), it.chats)
    }
  }
}
