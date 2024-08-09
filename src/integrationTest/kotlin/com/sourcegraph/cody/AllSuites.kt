package com.sourcegraph.cody

import com.sourcegraph.cody.chat.ChatTest
import com.sourcegraph.cody.edit.DocumentCodeTest
import com.sourcegraph.cody.util.RepeatableSuite
import org.junit.runner.RunWith
import org.junit.runners.Suite

@RunWith(RepeatableSuite::class)
@Suite.SuiteClasses(ChatTest::class, DocumentCodeTest::class)
class AllSuites
