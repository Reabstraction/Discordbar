import postcss from "postcss";
import { watch, unlinkSync, mkdirSync } from "fs";
import { argv } from "process";
import { file, $ } from "bun";

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

const featurePlugin: (features: string[]) => postcss.Plugin = (features: string[]) => ({
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
})

const builds: { [name: string]: string[] } = { general: ['general'] };

async function build(features: string[]): Promise<postcss.Result<postcss.Root>> {
    const plugins: postcss.AcceptedPlugin[] = [
        featurePlugin(features)
    ];

    const post = postcss(plugins);

    // read import.meta.dir + "/src/theme.css"
    const contents = await file(import.meta.dir + "/src/theme.css").text();

    // console.log("-".repeat(80));
    const results = await post.process(contents, { from: undefined });

    return results;
}

if (argv[2] == "build-all") {
    for (const e of Object.entries(builds)) {
        const _result = build(e[1]);

        try {
            unlinkSync(import.meta.dir + "/out");
        } catch (e) { }
        try {
            mkdirSync(import.meta.dir + "/out");
        } catch (e) { }

        const result = await _result;

        const develWriter = file(`${import.meta.dir}/out/${e[0]}.css`).writer();
        develWriter.write(result.css);
        develWriter.end();
    }
} else if (argv[2] === "watch") {
    const raw_features = argv[3];
    let features: string[] = [];
    if (raw_features) {
        if (raw_features != ",") {
            raw_features.split(",").forEach(feature => {
                features.push(feature);
            });
        }
    }

    const watcher = watch(import.meta.dir, { recursive: true }, async (event, filename) => {
        if (event == "change") {
            console.log(`Update: ${filename}`);
            if (filename?.endsWith("devel.css")) {
                return;
            }

            try {
                unlinkSync(import.meta.dir + "/out");
            } catch (e) { }

            const source = await build(features);

            const develWriter = file(`${import.meta.dir}/devel.css`).writer();
            develWriter.write(source.content);
            develWriter.end();
        }
    });

    build(features);
    await new Promise(() => { });
} else {
    console.log("No option provided");
}