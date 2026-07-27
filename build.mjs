// Builds every folder under ./plugins into ./dist/<name>/{index.js,manifest.json}.
// That folder is what Revenge/Bunny installs from: the app fetches manifest.json,
// checks the hash against index.js and loads it. Kept close to the upstream Vendetta
// template so the output stays exactly what the installers expect.
import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { extname } from "path";
import { createHash } from "crypto";

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import swc from "@swc/core";

const extensions = [".js", ".jsx", ".mjs", ".ts", ".tsx", ".cts", ".mts"];

/** @type import("rollup").InputPluginOption */
const plugins = [
    nodeResolve(),
    commonjs(),
    {
        name: "swc",
        async transform(code, id) {
            const ext = extname(id);
            if (!extensions.includes(ext)) return null;

            const ts = ext.includes("ts");
            const tsx = ts ? ext.endsWith("x") : undefined;
            const jsx = !ts ? ext.endsWith("x") : undefined;

            // Types and JSX are stripped, nothing else. Down-levelling to old
            // browsers used to rewrite block scopes and let two unrelated variables
            // end up sharing a name — a cache turned into a store's name string at
            // runtime. Hermes speaks modern JavaScript; there is nothing to lower.
            const result = await swc.transform(code, {
                filename: id,
                jsc: {
                    target: "es2022",
                    externalHelpers: true,
                    parser: { syntax: ts ? "typescript" : "ecmascript", tsx, jsx },
                },
            });
            return result.code;
        },
    },
    // Whitespace and syntax only. Renaming identifiers gave a closure's cache the
    // same name as a loop variable in the same function, so at runtime the cache
    // WAS that loop's last string — and every channel the plugin tried to filter
    // threw. The bundle is a few tens of kilobytes; the risk is not worth it, and
    // real names make a stack trace from a phone worth reading.
    esbuild({ minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false }),
];

for (const plug of await readdir("./plugins")) {
    const manifest = JSON.parse(await readFile(`./plugins/${plug}/manifest.json`));
    const outPath = `./dist/${plug}/index.js`;

    try {
        const bundle = await rollup({
            input: `./plugins/${plug}/${manifest.main}`,
            onwarn: () => {},
            plugins,
        });

        await bundle.write({
            file: outPath,
            globals(id) {
                // @vendetta/metro/common -> vendetta.metro.common, provided by the host
                if (id.startsWith("@vendetta")) return id.substring(1).replace(/\//g, ".");
                return { react: "window.React" }[id] || null;
            },
            format: "iife",
            compact: true,
            exports: "named",
        });
        await bundle.close();

        const built = await readFile(outPath);
        manifest.hash = createHash("sha256").update(built).digest("hex");
        manifest.main = "index.js";
        await mkdir(`./dist/${plug}`, { recursive: true });
        await writeFile(`./dist/${plug}/manifest.json`, JSON.stringify(manifest));

        console.log(`built ${manifest.name} -> dist/${plug}`);
    } catch (e) {
        console.error(`failed to build ${plug}`, e);
        process.exit(1);
    }
}
