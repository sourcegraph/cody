## Cody Ignore (Internal Experimental)

Cody Ignore is an experimental feature currently available for internal testing. It functions similarly to `.gitignore`, but is specifically designed for the context consumed by Cody, the code assistant. It enables users to specify files they don't want to send to a third party LLM providers.

### How does this help me?

If you have sensitive files like secrets or just a large part of your codebase that you'd prefer Cody to avoid, Cody Ignore is the tool for you. It allows you to specify patterns to exclude files and directories from Cody's context, similar to how `.gitignore` works.

### Using Cody Ignore

Here's how to set up and use Cody Ignore:

1. Open your Cody Extension Settings and enable the `cody.internal.unstable` configuration.
2. In the root of your workspace, create a `.cody` directory.
3. Inside the `.cody` directory, create a file named `ignore`.
4. Edit the `.cody/ignore` file to include patterns for the files and directories you want to ignore. For example, to ignore everything in a directory named `src`, you would add the following line: 
src/
5. To test if it's working, open a file from the directory you've chosen to ignore and highlight some code.
6. Ask Cody a question about the highlighted code.
7. Check the file context in Cody's response. You should not see any files from the ignored directory being used as context.
8. Note that autocomplete features will also not work on files specified in the `.cody/ignore` file.

Remember, this is an experimental feature for internal testing only, so use it with caution and report any issues you encounter to help improve the functionality.