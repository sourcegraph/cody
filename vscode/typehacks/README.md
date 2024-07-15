These are additional "type" definitions that can enforce correct usage of certain APIs within the context of our Cody plugin.

For example, ensuring that VSCode commands are always registered with a unique cody prefix.

These hacks are not part of the normal tsconfig as they would pollute the global scope. They are similarly done written as `ts` not `d.ts` files as Typescript does not respect excludes for `d.ts` files and any import in another project would include the typehacks (unless skipLibCheck=true).
