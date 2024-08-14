import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { build } from "esbuild";

main().catch((err) => {
    console.error("Could not build the agent.", err.message);
    process.exit(1);
});

async function main() {
    await verifyShim();

    const minify = process.argv.includes("--minify");
    await buildAgent(minify);
}

async function verifyShim() {
    // we first verify that the shim does not have vscode in its dependency tree. This would break the agent in a hard to detect way.
    const shimPlugins = [detectForbiddenImportPlugin(["vscode"])];
    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ["./src/vscode-shim.ts"],
        bundle: true,
        platform: "node",
        sourcemap: true,
        logLevel: "silent",
        write: false,
        outfile: path.join("dist", "shim.js"),
        plugins: shimPlugins,
        external: ["typescript"],
        alias: {
            // Build from TypeScript sources so we don't need to run `tsc -b` in the background
            // during dev.
            "@sourcegraph/cody-shared": "@sourcegraph/cody-shared/src/index",
            "@sourcegraph/cody-shared/src": "@sourcegraph/cody-shared/src",

            lexical: path.resolve(
                process.cwd(),
                "../vscode/build/lexical-package-fix",
            ),
        },
    };
    await build(esbuildOptions);
}

/**
 * Builds the Cody agent using esbuild.
 * @param {boolean} minify - Whether to minify the output or not.
 * @returns {Promise<void>} - A promise that resolves when the build process is complete.
 */
async function buildAgent(minify) {
    /** @type {import('esbuild').BuildOptions} */
    const esbuildOptions = {
        entryPoints: ["./src/index.ts"],
        bundle: true,
        outfile: path.join("dist", "index.js"),
        platform: "node",
        sourcemap: true,
        logLevel: "error",
        external: ["typescript"],
        minify: minify,
        plugins: [nativeNodeModulesPlugin],

        alias: {
            vscode: path.resolve(process.cwd(), "src", "vscode-shim.ts"),
            lexical: path.resolve(
                process.cwd(),
                "../vscode/build/lexical-package-fix",
            ),

            // Build from TypeScript sources so we don't need to run `tsc -b` in the background
            // during dev.
            "@sourcegraph/cody-shared": "@sourcegraph/cody-shared/src/index",
            "@sourcegraph/cody-shared/src": "@sourcegraph/cody-shared/src",
        },

        loader: {
            ".sql": "text",
        },
    };
    const res = await build(esbuildOptions);

    // Copy all .wasm files to the dist/ directory
    const distDir = path.join(process.cwd(), "..", "vscode", "dist");
    const files = await fs.readdir(distDir);
    for (const file of files) {
        const shouldCopyFile =
            file.indexOf("/webviews/") !== -1 ||
            file.endsWith(".wasm") ||
            file.endsWith("win-ca-roots.exe");
        if (!shouldCopyFile) {
            continue;
        }
        const src = path.join(distDir, file);
        const dest = path.join(process.cwd(), "dist", file);
        await fs.copyFile(src, dest);
    }
}

const nativeNodeModulesPlugin = {
    name: "native-node-modules",
    setup(build) {
        // If a ".node" file is imported within a module in the "file" namespace, resolve
        // it to an absolute path and put it into the "node-file" virtual namespace.
        build.onResolve({ filter: /\.node$/, namespace: "file" }, (args) => {
            if (args.path.startsWith(".")) {
                return null;
            }

            return {
                path: require.resolve(args.path, { paths: [args.resolveDir] }),
                namespace: "node-file",
            };
        });

        // Files in the "node-file" virtual namespace call "require()" on the
        // path from esbuild of the ".node" file in the output directory.
        build.onLoad({ filter: /.*/, namespace: "node-file" }, (args) => ({
            contents: `
          import path from ${JSON.stringify(args.path)}
          try { module.exports = require(path) }
          catch {}
        `,
        }));

        // If a ".node" file is imported within a module in the "node-file" namespace, put
        // it in the "file" namespace where esbuild's default loading behavior will handle
        // it. It is already an absolute path since we resolved it to one above.
        build.onResolve(
            { filter: /\.node$/, namespace: "node-file" },
            (args) => ({
                path: args.path,
                namespace: "file",
            }),
        );

        // Tell esbuild's default loading behavior to use the "file" loader for
        // these ".node" files.
        const opts = build.initialOptions;
        opts.loader = opts.loader || {};
        opts.loader[".node"] = "file";
    },
};

function detectForbiddenImportPlugin(allForbiddenModules) {
    return {
        name: "detect-forbidden-import-plugin",
        setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
                for (const forbidden of allForbiddenModules) {
                    if (args.path === forbidden) {
                        throw new Error(
                            `'${forbidden}' module is imported in file: ${args.importer}`,
                        );
                    }
                }
                args;
            });

            build.onLoad({ filter: /.*/ }, async (args) => {
                const contents = await fs.readFile(args.path, "utf8");
                return { contents, loader: "default" };
            });
        },
    };
}
