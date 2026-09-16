import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skills = [
  "raspberry-pi-first-setup",
  "raspberry-pi-health-check",
  "raspberry-pi-ssh-doctor",
  "raspberry-pi-serial-rescue",
];
const installer = join(root, skills[0], "scripts/install-jishubuddy.sh");
const registry = "--registry=https://registry.npmjs.org/";
const approvedVersion = "0.2.6";
const installArgs = ["install", "--yes", "--version", approvedVersion];

const mockTool = `#!${process.execPath}\n` + String.raw`
const fs = require("node:fs");
const path = require("node:path");
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify({ name, args }) + "\n");

function fail(message) {
  console.error(message);
  process.exit(1);
}

switch (name) {
  case "uname":
    if (args[0] === "-s") console.log(process.env.MOCK_OS ?? "Linux");
    else if (args[0] === "-m") console.log(process.env.MOCK_ARCH ?? "x86_64");
    else fail("Unexpected uname arguments");
    break;
  case "node":
    if (args[0] === "-p") console.log(process.env.MOCK_NODE_MAJOR ?? "22");
    else if (args[0] === "--version") console.log("v" + process.env.MOCK_NODE_MAJOR + ".0.0");
    else fail("Unexpected node arguments");
    break;
  case "jishubuddy":
    if (args.length !== 1 || args[0] !== "--version") fail("Launching JishuBuddy is forbidden");
    if (process.env.MOCK_VERSION_FAILURE === "1") fail("Mock version command failed");
    console.log(process.env.MOCK_VERSION_OUTPUT ?? ("jishubuddy " + fs.readFileSync(process.env.MOCK_STATE, "utf8")));
    break;
  case "npm":
    if (args[0] === "view") {
      if (process.env.MOCK_REGISTRY_FAILURE === "1") fail("Mock registry unavailable");
      console.log(process.env.MOCK_LATEST ?? "0.2.6");
    } else if (args[0] === "prefix") {
      console.log(process.env.MOCK_PREFIX);
    } else if (args[0] === "install") {
      if (process.env.MOCK_INSTALL_FAILURE === "1") fail("Mock npm install failed");
      const version = process.env.MOCK_INSTALLED_VERSION ?? args[2].replace(/^jishubuddy@/, "");
      fs.writeFileSync(process.env.MOCK_STATE, version);
      if (process.env.MOCK_MISSING_BINARY !== "1") {
        fs.writeFileSync(path.join(path.dirname(process.argv[1]), "jishubuddy"),
          fs.readFileSync(process.argv[1]), { mode: 0o755 });
      }
    } else {
      fail("Unexpected npm arguments");
    }
    break;
  default:
    fail("Unexpected tool: " + name);
}
`;

/** Build isolated command doubles without accessing npm, devices, or user configuration. */
function createFixture(t, currentVersion) {
  const directory = mkdtempSync(join(root, ".installer test-"));
  const bin = join(directory, "bin");
  const log = join(directory, "calls.jsonl");
  const state = join(directory, "version");
  const tools = ["uname", "node", "npm", "jishubuddy"];
  mkdirSync(bin);

  t.after(() => {
    for (const file of [...tools.map((name) => join(bin, name)), log, state]) {
      if (existsSync(file)) unlinkSync(file);
    }
    rmdirSync(bin);
    rmdirSync(directory);
  });

  for (const name of tools.slice(0, 3)) {
    writeFileSync(join(bin, name), mockTool, { mode: 0o755 });
  }
  if (currentVersion !== undefined) {
    writeFileSync(state, currentVersion);
    writeFileSync(join(bin, "jishubuddy"), mockTool, { mode: 0o755 });
  }

  return {
    bin,
    run(args = ["check"], overrides = {}, script = installer) {
      writeFileSync(log, "");
      const result = spawnSync("/bin/bash", [script, ...args], {
        cwd: directory,
        env: {
          PATH: bin,
          MOCK_LOG: log,
          MOCK_STATE: state,
          MOCK_PREFIX: join(directory, "npm global"),
          ...overrides,
        },
        encoding: "utf8",
        timeout: 10_000,
      });
      if (result.error) throw result.error;
      assert.equal(result.signal, null, result.stderr);
      const calls = readFileSync(log, "utf8").trim();
      return {
        ...result,
        calls: calls ? calls.split("\n").map((line) => JSON.parse(line)) : [],
      };
    },
  };
}

test("all skills remain self-contained with identical installers and pinned instructions", () => {
  const source = readFileSync(installer, "utf8");
  for (const skill of skills) {
    assert.equal(readFileSync(join(root, skill, "scripts/install-jishubuddy.sh"), "utf8"), source);
    const instructions = readFileSync(join(root, skill, "SKILL.md"), "utf8");
    assert.match(instructions, /bash "<skill-directory>\/scripts\/install-jishubuddy\.sh" check/);
    assert.match(instructions, /install --yes --version "<approved-version>"/);
    assert.match(instructions, /## Continue the diagnosis/);
    assert.doesNotMatch(instructions, /bash scripts\/install-jishubuddy\.sh|npm install -g jishubuddy/);
  }
});

for (const skill of skills) {
  test(`${skill}: preflight works from another directory without installing`, (t) => {
    const fixture = createFixture(t);
    const result = fixture.run(["check"], {}, join(root, skill, "scripts/install-jishubuddy.sh"));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Current version: not installed/);
    assert.match(result.stdout, /Target version: 0\.2\.6/);
    assert.deepEqual(result.calls.filter(({ name }) => name === "npm"), [
      { name: "npm", args: ["view", "jishubuddy", "version", registry] },
      { name: "npm", args: ["prefix", "--global"] },
    ]);
    assert.equal(existsSync(join(fixture.bin, "jishubuddy")), false);
  });
}

test("installation uses the approved version even when latest changes after preflight", (t) => {
  const fixture = createFixture(t);
  const preflight = fixture.run();
  assert.equal(preflight.status, 0, preflight.stderr);
  assert.match(preflight.stdout, /Target version: 0\.2\.6/);

  const result = fixture.run(installArgs, { MOCK_LATEST: "0.2.7", MOCK_REGISTRY_FAILURE: "1" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed version: 0\.2\.6/);
  assert.deepEqual(result.calls.filter(({ name }) => name === "npm"), [
    { name: "npm", args: ["prefix", "--global"] },
    {
      name: "npm",
      args: ["install", "--global", "jishubuddy@0.2.6", registry, "--ignore-scripts", "--no-audit", "--no-fund"],
    },
  ]);
  assert.deepEqual(result.calls.filter(({ name }) => name === "jishubuddy"), [
    { name: "jishubuddy", args: ["--version"] },
  ]);
});

test("a matching installation is reused without querying or installing from npm", (t) => {
  const result = createFixture(t, approvedVersion).run(installArgs);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already available on PATH; reusing 0\.2\.6/);
  assert.deepEqual(result.calls.filter(({ name }) => name === "npm"), [
    { name: "npm", args: ["prefix", "--global"] },
  ]);
});

test("missing consent, missing versions, extra arguments, and version ranges fail before tool calls", (t) => {
  const fixture = createFixture(t);
  for (const args of [
    ["install"],
    ["install", "--yes"],
    ["install", "--version", approvedVersion],
    ["install", "--yes", "--version", approvedVersion, "--extra"],
    ["check", "--yes"],
    ["unexpected"],
    ...["", "latest", "^0.2.6", "0.2", "0.2.6\n0.2.7", "0.2.6-"].map(
      (version) => ["install", "--yes", "--version", version],
    ),
  ]) {
    const result = fixture.run(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
    assert.match(result.stderr, /ERROR:/);
    assert.deepEqual(result.calls, []);
  }
});

test("exact prerelease versions with build metadata are preserved", (t) => {
  const version = "1.2.3-rc.1+build.4";
  const result = createFixture(t).run(["install", "--yes", "--version", version]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Installed version: ${version}`));
  assert.ok(result.calls.some(({ args }) => args.includes(`jishubuddy@${version}`)));
});

test("an unusable existing command is not treated as an absent installation", (t) => {
  const result = createFixture(t, approvedVersion).run(["check"], { MOCK_VERSION_FAILURE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Mock version command failed/);
  assert.match(result.stderr, /on PATH, but its version command failed/);
  assert.equal(result.calls.some(({ name }) => name === "npm"), false);
});

test("empty or unexpected version output is not treated as success", (t) => {
  const fixture = createFixture(t, approvedVersion);
  for (const output of ["", "unexpected banner", "0.2.6\nextra output"]) {
    const result = fixture.run(["check"], { MOCK_VERSION_OUTPUT: output });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Expected an exact package version/);
    assert.equal(result.calls.some(({ name }) => name === "npm"), false);
  }
});

test("CRLF version output is normalized", (t) => {
  const result = createFixture(t, approvedVersion).run(installArgs, {
    MOCK_VERSION_OUTPUT: "jishubuddy 0.2.6\r\n",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /reusing 0\.2\.6/);
});

test("a stale executable on PATH after installation is reported", (t) => {
  const result = createFixture(t, "0.1.0").run(installArgs, { MOCK_INSTALLED_VERSION: "0.1.0" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected 0\.2\.6, but PATH resolves to 0\.1\.0/);
  assert.doesNotMatch(result.stdout, /Installed version:/);
});

test("a missing executable after npm succeeds is reported", (t) => {
  const result = createFixture(t).run(installArgs, { MOCK_MISSING_BINARY: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /npm completed, but jishubuddy is not on PATH/);
});

test("post-install version failures do not print a success message", (t) => {
  const result = createFixture(t).run(installArgs, { MOCK_VERSION_FAILURE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /version command failed/);
  assert.doesNotMatch(result.stdout, /Installed version:|JishuBuddy was not launched/);
});

test("registry errors and invalid registry versions stop preflight", (t) => {
  const fixture = createFixture(t);
  for (const overrides of [
    { MOCK_REGISTRY_FAILURE: "1" },
    { MOCK_LATEST: "latest" },
    { MOCK_LATEST: "" },
  ]) {
    const result = fixture.run(["check"], overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Could not query|Expected an exact package version/);
    assert.equal(result.calls.some(({ args }) => args[0] === "install"), false);
  }
});

test("npm installation errors propagate without printing success", (t) => {
  const result = createFixture(t).run(installArgs, { MOCK_INSTALL_FAILURE: "1" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Mock npm install failed/);
  assert.doesNotMatch(result.stdout, /Installed version:/);
});

test("supported platforms keep their declared identifiers", (t) => {
  const fixture = createFixture(t);
  for (const [os, arch, platform] of [
    ["Linux", "x86_64", "linux-x64"],
    ["Linux", "aarch64", "linux-arm64"],
    ["Darwin", "arm64", "darwin-arm64"],
  ]) {
    const result = fixture.run(["check"], { MOCK_OS: os, MOCK_ARCH: arch });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Platform: ${platform}`));
  }
});

test("unsupported platforms stop before npm access", (t) => {
  const fixture = createFixture(t);
  for (const [os, arch] of [["Linux", "armv7l"], ["Darwin", "x86_64"], ["MINGW64_NT", "x86_64"]]) {
    const result = fixture.run(["check"], { MOCK_OS: os, MOCK_ARCH: arch });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unsupported platform/);
    assert.equal(result.calls.some(({ name }) => name === "npm"), false);
  }
});

test("old Node.js versions and missing npm stop before registry access", (t) => {
  const fixture = createFixture(t);
  const oldNode = fixture.run(["check"], { MOCK_NODE_MAJOR: "20" });
  assert.notEqual(oldNode.status, 0);
  assert.match(oldNode.stderr, /Node\.js 22 or newer is required; found v20\.0\.0/);
  assert.equal(oldNode.calls.some(({ name }) => name === "npm"), false);

  unlinkSync(join(fixture.bin, "npm"));
  const missingNpm = fixture.run();
  assert.notEqual(missingNpm.status, 0);
  assert.match(missingNpm.stderr, /npm is required/);
});
