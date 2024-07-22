// Context https://github.com/sourcegraph/sourcegraph/pull/63855
// The Sourcegraph Enterprise backend rejects requests from unknown clients on
// the assumption that they may not support context filters. This logic is flawed because
// it has both false positives and false negatives.
//
// - False negatives: upcoming Cody clients (CLI, Eclipse, Visual Studio)
//   already support context filters out of the box thanks to using the Cody agent
//   but they can't send requests unless we add a special case to them. It may
//   require months for these clients to wait for all Enterprise instances to
//   upgrade to a version that adds exceptions for their name.
// - False positive: a malicious client can always fake that it's "jetbrains"
//   with a valid version number even if the client doesn't respect context
//   filters. This gives a false sense of security because it doesn't prevent
//   malicious traffic from bypassing context filters. In fact, I am leaning
//   towards using the
//
// To bypass this server check, the Cody CLI needs to fake its name to be
// "jetbrains" and declare a version number above 5.5.8. We can change the name
// back to cody-cli once all Enterprise instances have upgraded to a release
// that includes this PR https://github.com/sourcegraph/sourcegraph/pull/63855

export const codyCliClientName = 'jetbrains'
