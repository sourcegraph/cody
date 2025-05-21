import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { documentAndPosition } from '../completions/test-helpers'
import { isBigModification } from './big-diff-modification'

describe('isBigModification', () => {
    const getDocumentRange = (document: vscode.TextDocument) => {
        return {
            start: new vscode.Position(0, 0),
            end: new vscode.Position(document.lineCount, 0),
        } as vscode.Range
    }

    const assertIsBigModification = (
        document: vscode.TextDocument,
        prediction: string,
        threshold: number,
        maxCharacters: number,
        expected: boolean
    ) => {
        const range = getDocumentRange(document)
        expect(isBigModification(document, prediction, range, threshold, maxCharacters)).toBe(expected)
    }

    it('returns false for no modification', () => {
        const { document } = documentAndPosition(dedent`function calculateTotal(items) {
				let total = 0;
				for (const item of items) {
					total += item.price * item.quantity;
				}
				return total;█
			}`)
        const prediction = dedent`function calculateTotal(items) {
			let total = 0;
			for (const item of items) {
				total += item.price * item.quantity;
			}
			return total;
		}`
        assertIsBigModification(document, prediction, 0.3, 300, false)
    })

    it('returns false when number of removed characters is below threshold', () => {
        const { document } = documentAndPosition(
            dedent`function processData(data) {
				// First validate the input data
				if (!isValidData(data)) {
					throw new Error("Invalid data");
				}
				// Format the data for processing
				const formattedData = formatData(data);
				// Calculate results
				const results = calculateResults(formattedData);█
                return results;
            }`
        )
        const prediction = dedent`function processData(data) {
			// First validate the input data
			if (!isValidData(data)) {
				throw new Error("Invalid data");
			}
			// Format the data for processing
			const formattedData = formatData(data);
            // Calculate results
            const results = calculateResults(formattedData);
            return results;
		}`

        assertIsBigModification(document, prediction, 0.3, 300, false)
    })

    it('returns true when both thresholds are exceeded', () => {
        const { document } = documentAndPosition(dedent`class UserAuthentication {
                private users = new Map();
                █
                /**
                 * Registers a new user
                 * @param username - Username
                 * @param password - Password
                 */
                registerUser(username, password) {
                    // Check if user exists
                    if (this.users.has(username)) {
                        return false;
                    }
                    // Store the new user
                    this.users.set(username, {
                        username,
                        passwordHash: password,
                    });
                }
                return true;
                }
            }`)
        const prediction = dedent`class UserAuthentication {
            private users = new Map();
        }`
        assertIsBigModification(document, prediction, 0.3, 300, true)
    })

    it('returns false when both thresholds are not exceeded', () => {
        const { document } = documentAndPosition(
            dedent`class UserAuthentication {
                private users = new Map();
                █
                /**
                 * Registers a new user
                 * @param username - Username
                 * @param password - Password
                 */
                registerUser(username, password) {
                    // Check if user exists
                    if (this.users.has(username)) {
                        return false;
                    }
                    // Store the new user
                    this.users.set(username, {
                        username,
                        passwordHash: password,
                    });
                }
                return true;
                }
            }`
        )
        const prediction = dedent`class UserAuthentication {
            private users = new Map();
            registerUser(username, password) {
                    // Check if user exists
                    if (this.users.has(username)) {
                        return false;
                    }
                    // Store the new user
                    this.users.set(username, {
                        username,
                        passwordHash: password,
                    });
                }
                return true;
                }
        }`
        assertIsBigModification(document, prediction, 0.3, 300, false)
    })

    it('handles different threshold values', () => {
        const { document } = documentAndPosition(
            dedent`export const UserProfile = ({ userId }) => {
                const [user, setUser] = useState(null);
                const [loading, setLoading] = useState(true);
                useEffect(() => {
                    const fetchUserData = async () => {
                        try {
                            setLoading(true);
                            const response = await api.users.getUserById(userId);
                            setUser(response.data);
                            setLoading(false);
                        } catch (err) {
                            setLoading(false);
                            console.error(err);
                        }
                    };
                    fetchUserData();█
                }, [userId]);
                if (loading) return <Loading />;
                if (!user) return <div>User not found</div>;
                return (
                    <div>
                        <h2>{user.name}</h2>
                        <p>{user.email}</p>
                    </div>
                );
            };`
        )
        const prediction = dedent`export const UserProfile = ({ userId }) => {
                const [user, setUser] = useState(null);
                const [loading, setLoading] = useState(true);
                useEffect(() => {
                    const fetchUserData = async () => {
                        try {
                            setLoading(true);
                            const response = await api.users.getUserById(userId);
                            setUser(response.data);
                            setLoading(false);
                        } catch (err) {
                            setLoading(false);
                            console.error(err);
                        }
                    };
                    fetchUserData();
                });
                return <div>{user.name}</div>;
            };`

        assertIsBigModification(document, prediction, 0.2, 150, true)
        // With high thresholds
        assertIsBigModification(document, prediction, 0.3, 200, false)
    })
})
