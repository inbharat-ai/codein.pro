/**
 * MAS Test Runner — runs all MAS test files and reports results.
 *
 * Usage: node test/run-all-mas-tests.cjs
 */
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(f => f.startsWith("mas-") && f.endsWith(".test.cjs"))
  .concat(
    fs.readdirSync(testDir)
      .filter(f => f.startsWith("swarm-") && f.endsWith(".test.cjs"))
  );

// Also add tool-registry-errors if it exists
if (fs.existsSync(path.join(testDir, "tool-registry-errors.test.cjs"))) {
  testFiles.push("tool-registry-errors.test.cjs");
}

const results = [];
let totalPass = 0;
let totalFail = 0;
let totalSkip = 0;

for (const file of testFiles) {
  const filePath = path.join(testDir, file);
  try {
    const output = execSync(`node --test "${filePath}" 2>&1`, {
      timeout: 30000,
      encoding: "utf8",
    });

    // Parse output for pass/fail
    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    const skipMatch = output.match(/# skip (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : 0;
    const skip = skipMatch ? parseInt(skipMatch[1]) : 0;

    totalPass += pass;
    totalFail += fail;
    totalSkip += skip;

    results.push({
      file,
      status: fail > 0 ? "FAIL" : "PASS",
      pass,
      fail,
      skip,
    });
  } catch (err) {
    const output = err.stdout || err.stderr || err.message || "";

    const passMatch = output.match(/# pass (\d+)/);
    const failMatch = output.match(/# fail (\d+)/);
    const pass = passMatch ? parseInt(passMatch[1]) : 0;
    const fail = failMatch ? parseInt(failMatch[1]) : 1;

    totalPass += pass;
    totalFail += fail;

    // Extract first error line
    const lines = output.split("\n");
    const errorLine = lines.find(l =>
      l.includes("Error") || l.includes("not ok") || l.includes("AssertionError")
    ) || lines.slice(-5).join(" | ");

    results.push({
      file,
      status: "FAIL",
      pass,
      fail,
      skip: 0,
      error: errorLine.trim().slice(0, 200),
    });
  }
}

// Report
console.log("\n" + "=".repeat(70));
console.log("  CodeIn MAS Test Report");
console.log("=".repeat(70) + "\n");

for (const r of results) {
  const icon = r.status === "PASS" ? "[PASS]" : "[FAIL]";
  const counts = `pass=${r.pass} fail=${r.fail}${r.skip ? ` skip=${r.skip}` : ""}`;
  console.log(`  ${icon} ${r.file.padEnd(42)} ${counts}`);
  if (r.error) {
    console.log(`         Error: ${r.error}`);
  }
}

console.log("\n" + "-".repeat(70));
console.log(`  TOTAL: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped`);
console.log(`  Files: ${results.filter(r => r.status === "PASS").length}/${results.length} passing`);
console.log("-".repeat(70) + "\n");

process.exitCode = totalFail > 0 ? 1 : 0;
