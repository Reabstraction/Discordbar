import postcss from "postcss";
import { watch, unlinkSync, mkdirSync, writeFileSync } from "fs";
import { argv } from "process";
import { file, $, env } from "bun";
import cssnano from "cssnano";

const in_github_actions = env["GITHUB_ACTIONS"];
const verbose = argv.includes("--verbose") || in_github_actions;
const production = argv.includes("--production") || in_github_actions;

function resolveFeature(params: string, features: string[], recurse: number = 0): boolean {
    if (recurse > 10) {
        return false;
    }

    params = params.trim();

    if (/^[a-zA-Z\-][a-zA-Z0-9\-]*$/.test(params)) {
        let includes = features.includes(params);
        return includes
    }

    if (params.startsWith("not")) {
        params = params.substring(3).trim();
        return !resolveFeature(params, features, recurse + 1);
    }

    if (params.startsWith("(") && params.endsWith(")")) {
        params = params.substring(1, params.length - 1);
    }

    return resolveFeature(params, features, recurse + 1);
}


const featurePlugin: (features: string[]) => postcss.Plugin = (features: string[]) => {
    return {
        postcssPlugin: "by-feature",
        async AtRuleExit(atRule, helper) {
            // console.log(`atRule: ${atRule}`);
            if (atRule.name === "feature") {
                if (resolveFeature(atRule.params, features)) {
                    atRule.nodes?.forEach(node => {
                        atRule.after(node);
                    });
                    atRule.removeAll();
                    atRule.remove();
                } else {
                    atRule.removeAll();
                    atRule.remove();
                }
            }
        },
    }
};

const builds: { [name: string]: string[] } = { general: ['general'], clutterfree: ['general', 'clutterfree'] };

const license = await file(import.meta.dir + "/LICENSE").text();

async function build(features: string[]): Promise<postcss.Result<postcss.Root>> {
    const plugins: postcss.AcceptedPlugin[] = [
        featurePlugin(features),
    ];
    if (production) plugins.push(
        cssnano({
            preset: "advanced",
        }));

    const post = postcss(plugins);
    console.log("[!] Initialized PostCSS");
    
    const contents = await file(import.meta.dir + "/src/theme.css").text();
    console.log(`[!] Read file: ${import.meta.dir + "/src/theme.css"}`);

    const results = await post.process(contents, { from: undefined, to: undefined });
    console.log("[!] PostCSS processed");

    return results;
}

if (argv[2] == "build-all") {
    const entries = Object.entries(builds);
    if(verbose) {
        console.log(`[!] Building ${entries.length} targets for ${production ? 'production' : 'development'}`);
    }

    for (const e of entries) {
        if(verbose) {
            console.log(`[!] Building ${e[0]} with features ${e[1].join(",")}`);
        }
        const _result = build(e[1]);

        try {
            unlinkSync(import.meta.dir + "/out");
        } catch (e) { }
        try {
            mkdirSync(import.meta.dir + "/out");
        } catch (e) { }

        const result = await _result;
        let css = result.css;

        if(production) {
            css = `/*\n${license}*/${css}`;
        }

        const develWriter = writeFileSync(`${import.meta.dir}/out/${e[0]}.css`, css);
        if(verbose) {
            console.log(`[!] Finish build ${e[0]} to: ${import.meta.dir + "/out/" + e[0]}.css`);
        }
    }
    console.log("[!] Finish building all");
} else if (argv[2] === "watch") {
    const build_name = argv[3];
    let features: string[] = [];
    if (Object.keys(builds).includes(build_name)) {
        features = builds[build_name];
    } else {
        // , seperated list, also warn
        features = build_name.split(",");

        console.log(`Unknown build: ${build_name}`);
    }

    const watcher = watch(import.meta.dir, { recursive: true }, async (event, filename) => {
        if (event == "change") {
            if (filename) {
                if (filename.endsWith("devel.css")) {
                    return;
                }

                if (filename.startsWith(".git") || filename.startsWith("node_modules")) {
                    return;
                }

                if (!filename.endsWith(".css")) {
                    console.log(`Ignore: ${filename}`);
                    return;
                }
                console.log(`Update: ${filename}`);

                try {
                    unlinkSync(import.meta.dir + "/out");
                } catch (e) { }

                const source = await build(features);

                writeFileSync(`${import.meta.dir}/devel.css`, source.content);
            }
        }
    });

    build(features);
    await new Promise(() => { });
} else {
    console.log("No option provided");
}