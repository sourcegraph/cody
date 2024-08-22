package com.sourcegraph.cody.config

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.testFramework.registerServiceInstance
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.agent.protocol_generated.ModelContextWindow
import com.sourcegraph.cody.config.migration.ChatTagsLlmMigration
import com.sourcegraph.cody.config.migration.DeprecatedChatLlmMigration
import com.sourcegraph.cody.config.migration.SettingsMigration
import com.sourcegraph.cody.history.HistoryService
import com.sourcegraph.cody.history.state.AccountData
import com.sourcegraph.cody.history.state.ChatState
import com.sourcegraph.cody.history.state.EnhancedContextState
import com.sourcegraph.cody.history.state.HistoryState
import com.sourcegraph.cody.history.state.LLMState
import com.sourcegraph.cody.history.state.MessageState
import com.sourcegraph.cody.history.state.MessageState.SpeakerState
import com.sourcegraph.cody.history.state.RemoteRepositoryState
import kotlin.test.assertContains

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
                  Model(
                      id = "T-800",
                      usage = listOf("chat"),
                      contextWindow = ModelContextWindow(0, 0, null),
                      clientSideConfig = null,
                      provider = "Cyberdyne",
                      title = "Terminator",
                      tags = emptyList(),
                      modelRef = null))
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
                            Model(
                                id = "HAL 9000",
                                usage = listOf("chat"),
                                contextWindow = ModelContextWindow(0, 0, null),
                                clientSideConfig = null,
                                provider = "Uni of IL",
                                title = "HAL",
                                tags = listOf("pro"),
                                modelRef = null))
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

  fun `test DeprecatedChatLlmMigration`() {
    fun createLlmModel(
        version: String,
        isDeprecated: Boolean = false,
    ): Model {
      val myTags = mutableListOf<String>()
      if (isDeprecated) myTags.add("deprecated")

      return Model(
          id = "anthropic/claude-$version",
          usage = listOf("chat"),
          contextWindow = ModelContextWindow(0, 0, null),
          clientSideConfig = null,
          provider = "Anthropic",
          title = "Claude $version",
          tags = myTags,
          modelRef = null)
    }

    val claude20 = createLlmModel("2.0", isDeprecated = true)
    val claude21 = createLlmModel("2.1", isDeprecated = true)
    val claude30 = createLlmModel("3.0")
    // first one is the default
    val models = listOf(claude30, claude20, claude21, claude30)

    val accountData =
        mutableListOf(
            AccountData().also {
              it.accountId = "first"
              it.chats =
                  mutableListOf(
                      ChatState("chat1").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude20)
                      },
                      ChatState("chat2").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude21)
                      })
            },
            AccountData().also {
              it.accountId = "second"
              it.chats =
                  mutableListOf(
                      ChatState("chat1").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude20)
                      },
                      ChatState("chat2").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude30)
                      })
            })

    fun verifyDeprecatedModels(migratedLlms: Set<String>) {
      assertEquals(2, migratedLlms.size)
      assertContains(migratedLlms, "Claude 2.0")
      assertContains(migratedLlms, "Claude 2.1")
    }

    DeprecatedChatLlmMigration.migrateHistory(accountData, models, ::verifyDeprecatedModels)
    assertEquals(2, accountData.size)
    accountData.forEach { ad ->
      ad.chats.forEach { chat ->
        assertEquals(claude30.id, chat.llm?.model)
        assertEquals(claude30.title, chat.llm?.title)
      }
    }
  }

  fun `test ChatTagsLlmMigration`() {
    fun createLlmModel(
        version: String,
        isDeprecated: Boolean = false,
        isCodyPro: Boolean = false,
        usage: List<String> = listOf("chat", "edit"),
        tags: List<String> = listOf()
    ): Model {
      val myTags = tags.toMutableList()
      if (isDeprecated) myTags.add("deprecated")
      if (isCodyPro) myTags.add("pro")
      return Model(
          id = "anthropic/claude-$version",
          usage = usage,
          contextWindow = ModelContextWindow(0, 0, null),
          clientSideConfig = null,
          provider = "Anthropic",
          title = "Claude $version",
          tags = myTags,
          modelRef = null)
    }

    val claude20Old = createLlmModel("2.0", isDeprecated = true)
    val claude20New = createLlmModel("2.0", tags = listOf("deprecated", "free"))

    // This will be included as an old style model in the agent response to simulate
    // an upgrade that runs before the agent upgrades
    val claude21Old = createLlmModel("2.1", isDeprecated = true, isCodyPro = true)

    val claude30Old = createLlmModel("3.0")
    val claude30New = createLlmModel("3.0", tags = listOf("pro", "other"), usage = listOf("edit"))
    val models = listOf(claude20New, claude21Old, claude30New)

    val accountData =
        mutableListOf(
            AccountData().also {
              it.accountId = "first"
              it.chats =
                  mutableListOf(
                      ChatState("chat1").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude20Old)
                      },
                      ChatState("chat2").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude21Old)
                      })
            },
            AccountData().also {
              it.accountId = "second"
              it.chats =
                  mutableListOf(
                      ChatState("chat1").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude20Old)
                      },
                      ChatState("chat2").also {
                        it.messages = mutableListOf()
                        it.llm = LLMState.fromChatModel(claude30Old)
                      })
            })

    fun getTagsAndUsage(chat: ChatState): Pair<List<String>, List<String>> {
      val llm = chat.llm ?: return Pair(listOf(), listOf())
      return Pair(llm.tags.toList(), llm.usage.toList())
    }

    ChatTagsLlmMigration.migrateHistory(accountData, models)
    assertEquals(2, accountData.size)
    accountData.forEach { ad ->
      ad.chats.forEach { chat ->
        when (chat.llm?.model) {
          claude20Old.id -> {
            val (tags, usage) = getTagsAndUsage(chat)
            assertEquals(listOf("deprecated", "free"), tags)
            assertEquals(listOf("chat", "edit"), usage)
          }
          claude21Old.id -> {
            val (tags, usage) = getTagsAndUsage(chat)
            assertEquals(listOf("deprecated", "pro"), tags)
            assertEquals(listOf("chat", "edit"), usage)
          }
          claude30Old.id -> {
            val (tags, usage) = getTagsAndUsage(chat)
            assertEquals(listOf("pro", "other"), tags)
            assertEquals(listOf("edit"), usage)
          }
        }
      }
    }
  }
}
