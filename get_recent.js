/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const THRESHOLD = Date.now() - 120 * 60 * 1000; // 2 hours

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (["node_modules", ".git", ".next"].includes(file)) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
            if (stat.mtimeMs > THRESHOLD) {
                console.log(fullPath);
            }
        }
    }
}

walk(__dirname);
