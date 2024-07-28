// TODO: update this file-level comment
// CTX(linear): https://linear.app/sourcegraph/issue/CODY-1234

import { test } from '.'
import { disableNotifications } from '../../e2e/common'
import type { ExpectedEvents, ExpectedV2Events, TestConfiguration } from '../../e2e/helpers'

// TODO: add a .only() to actually run this test
test.extend<TestConfiguration & ExpectedEvents & ExpectedV2Events>({
    expectedEvents: [],
    expectedV2Events: [],
    preAuthenticate: true,
})('@issue [CODY-1234](https://linear.app/sourcegraph/issue/CODY-1234)', async ({ page }) => {
    // TODO: The test name should include the @issue tag and a markdown link to the issue
    await disableNotifications(page)
    //do your worst
})
