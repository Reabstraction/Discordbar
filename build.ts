import postcss from "postcss";
// @ts-ignore : No types
import postcssMinify from "postcss-minify";
import { watch, unlink, unlinkSync } from "fs";
import { argv } from "process";
import { file, $ } from "bun";

// First param is , seperated list of features
const raw_features = argv[2];
let features: string[] = [];
if (raw_features) {
    if (raw_features != ",") {
        raw_features.split(",").forEach(feature => {
            features.push(feature);
        });
    }
}

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

const featurePlugin: postcss.Plugin = {
    postcssPlugin: "by-feature",
    AtRule(atRule, helper) {
        if (atRule.name === "feature") {
            if (resolveFeature(atRule.params, features)) {
                atRule.nodes?.forEach(node => {
                    atRule.after(node);
                });
            } else {
                atRule.removeAll();
            }
        }
    },
}

const plugins: postcss.AcceptedPlugin[] = [
    featurePlugin
];

const post = postcss(plugins);

async function build() {
    // read import.meta.dir + "/src/theme.css"
    const contents = await file(import.meta.dir + "/src/theme.css").text();

    // console.log("-".repeat(80));
    post.process(contents, { from: undefined }).then(async result => {
        // console.log("-".repeat(80));
        // console.log(result.css);

        try {
            unlinkSync(import.meta.dir + "/devel.css");
        } catch (e) { }
        const develWriter = file(import.meta.dir + "/devel.css").writer();
        develWriter.write(result.css);
        develWriter.end();
    });
}

if (argv[3] === "watch") {
    const watcher = watch(import.meta.dir, { recursive: true }, async (event, filename) => {
        if (filename?.endsWith("devel.css")) {
            return;
        }
        // console.log(event)
        await build();
    });

    build();
    await new Promise(() => { });
} else {
    build();
}