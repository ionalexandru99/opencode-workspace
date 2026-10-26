import { transformFileAsync } from "@babel/core"
import solid from "babel-preset-solid"
import { build } from "esbuild"
import { readFile } from "node:fs/promises"

const check = process.argv.includes("--check")

const result = await build({
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  packages: "external",
  minifySyntax: true,
  legalComments: "none",
  write: !check,
  plugins: [{
    name: "solid",
    setup(builder) {
      builder.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
        const result = await transformFileAsync(path, {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ["typescript", "jsx"] },
          presets: [[solid, { generate: "universal", moduleName: "@opentui/solid" }]],
        })
        if (!result?.code) throw new Error(`Failed to compile ${path}`)
        return { contents: result.code, loader: "ts" }
      })
    },
  }],
})

if (check && await readFile("dist/tui.js", "utf8") !== result.outputFiles[0].text) {
  throw new Error("Bundle is out of date. Run npm run bundle.")
}
