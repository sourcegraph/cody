package com.sourcegraph.cody

import com.sourcegraph.cody.autocomplete.AutocompleteCompletionTest
import com.sourcegraph.cody.edit.DocumentCodeTest
import com.sourcegraph.cody.util.RepeatableSuite
import org.junit.runner.RunWith
import org.junit.runners.Suite

@RunWith(RepeatableSuite::class)
@Suite.SuiteClasses(DocumentCodeTest::class, AutocompleteCompletionTest::class)
class AllSuites
