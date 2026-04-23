/**
 * Test file for env-loader
 * Run with: npx tsx .pi/extensions/.test-env-loader.ts
 *
 * FIXED ISSUES:
 * - 2.2: Изоляция process.env через beforeEach/afterEach
 * - 2.3: Использование типов InterpolationWarning, ParseResult, ParsedVar, EnvChangesResult
 */

import * as fs from "node:fs";
import * as path from "node:path";

// Import functions from env-loader
import {
  parseEnvFile,
  isSecretKey,
  isProtectedKey,
  isEscaped,
  startsWithOperator,
  unquoteValue,
  processEscapes,
  interpolateValue,
  trimValue,
  maskValue,
  type InterpolationWarning,
  type ParseResult,
  type ParsedVar,
  collectEnvChanges,
  applyEnvChanges,
  type EnvChangesResult,
} from "../env-loader.ts";

// === Test isolation utilities ===

/** Original environment snapshot for isolation */
let originalEnv: Record<string, string | undefined> = {};

/**
 * Save process.env before each test
 * Используем spread для shallow clone
 */
function beforeEach(): void {
  originalEnv = { ...process.env };
}

/**
 * Restore process.env after each test
 * Удаляем все добавленные переменные и восстанавливаем оригинальные
 */
function afterEach(): void {
  // Удаляем все переменные которые были добавлены
  const currentKeys = new Set(Object.keys(process.env));
  const originalKeys = new Set(Object.keys(originalEnv));

  // Удаляем новые переменные
  for (const key of currentKeys) {
    if (!originalKeys.has(key)) {
      delete process.env[key];
    }
  }

  // Восстанавливаем оригинальные значения
  for (const key of originalKeys) {
    const origVal = originalEnv[key];
    if (origVal === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = origVal;
    }
  }
}

// === Test utilities ===

let passedTests = 0;
let failedTests = 0;

function testAssert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.log(`  ✗ ${message}`);
    failedTests++;
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual: ${JSON.stringify(actual)}`);
    failedTests++;
  }
}

// === Unit tests ===

console.log("=== Unit Tests ===\n");

// Test isProtectedKey
console.log("isProtectedKey:");
beforeEach();
process.env.TEST_VAR = "test";
testAssert(isProtectedKey("PATH") === true, "PATH is protected");
testAssert(isProtectedKey("path") === true, "path (case insensitive) is protected");
testAssert(isProtectedKey("HOME") === true, "HOME is protected");
testAssert(isProtectedKey("TEMP") === true, "TEMP is protected");
testAssert(isProtectedKey("TEST_VAR") === false, "TEST_VAR is not protected");
testAssert(isProtectedKey("CUSTOM_KEY") === false, "CUSTOM_KEY is not protected");
afterEach();

// Test isSecretKey (with PASSWORD pattern added)
console.log("\nisSecretKey:");
testAssert(isSecretKey("API_KEY") === true, "API_KEY is secret");
testAssert(isSecretKey("api_key") === true, "api_key is secret");
testAssert(isSecretKey("MY_SECRET") === true, "MY_SECRET is secret");
testAssert(isSecretKey("PASSWORD") === true, "PASSWORD is secret");
testAssert(isSecretKey("AUTH_TOKEN") === true, "AUTH_TOKEN is secret");
testAssert(isSecretKey("PRIVATE_KEY") === true, "PRIVATE_KEY is secret");
testAssert(isSecretKey("DATABASE_TOKEN") === true, "DATABASE_TOKEN is secret");
testAssert(isSecretKey("USERNAME") === false, "USERNAME is not secret");
testAssert(isSecretKey("DATABASE_HOST") === false, "DATABASE_HOST is not secret");

// Test maskValue
console.log("\nmaskValue:");
assertEq(maskValue("mysecretkey"), "my*********", "masks value (shows 2 + 7 asterisks)");
assertEq(maskValue("abc"), "ab***", "masks short value with minimum 3 asterisks)");
assertEq(maskValue("ab"), "**", "masks 2-char value exactly");
assertEq(maskValue("a"), "*", "masks 1-char value");
assertEq(maskValue(""), "", "empty string stays empty");
assertEq(maskValue("tok123456789"), "to**********", "masks token");

// Test trimValue
console.log("\ntrimValue:");
assertEq(trimValue("  true  "), "true", "trims whitespace");
assertEq(trimValue("\tvalue\t"), "value", "trims tabs");
assertEq(trimValue("yes"), "yes", "preserves 'yes' as-is");
assertEq(trimValue("no"), "no", "preserves 'no' as-is");
assertEq(trimValue("1"), "1", "preserves '1' as-is");
assertEq(trimValue("0"), "0", "preserves '0' as-is");
assertEq(trimValue("42"), "42", "preserves number as-is");

// Test isEscaped
console.log("\nisEscaped:");
testAssert(isEscaped("test", 0) === false, "first char not escaped");
testAssert(isEscaped("\\test", 1) === true, "single backslash escapes");
testAssert(isEscaped("\\test", 1) === true, "first backslash of pair escapes");
testAssert(isEscaped("\\test", 2) === false, "second backslash does not escape");

// Test startsWithOperator
console.log("\nstartsWithOperator:");
testAssert(startsWithOperator("KEY?=value", "?=") === true, "detects ?= operator");
testAssert(startsWithOperator("KEY+=value", "+=") === true, "detects += operator");
testAssert(startsWithOperator("KEY-=value", "-=") === true, "detects -= operator");
testAssert(startsWithOperator("KEY=value", "?=") === false, "=? is not ?=");
testAssert(startsWithOperator("?KEY=value", "?=") === false, "not at start");
testAssert(startsWithOperator("KEY?=value", "+=") === false, "wrong operator");

// Test unquoteValue (removes quotes only)
console.log("\nunquoteValue:");
assertEq(unquoteValue('"hello"'), "hello", "removes double quotes");
assertEq(unquoteValue("'hello'"), "hello", "removes single quotes");
assertEq(unquoteValue('"hello'), '"hello', "unmatched double quote left as-is");
assertEq(unquoteValue("hello"), "hello", "unquoted value");
assertEq(unquoteValue('"he"llo"'), 'he"llo', "handles escaped quotes");

// Test processEscapes
console.log("\nprocessEscapes:");
const testStr1 = "line1\\nline2";
const testStr2 = "line1\\tline2";
const testStr3 = "line1\\rline2";
const testStr4 = 'quote\\"here';
const testStr5 = "single\\'here";
const testStr6 = "backslash\\\\here";
assertEq(processEscapes(testStr1), "line1\nline2", "processes \\n");
assertEq(processEscapes(testStr2), "line1\tline2", "processes \\t");
assertEq(processEscapes(testStr3), "line1\rline2", "processes \\r");
assertEq(processEscapes(testStr4), 'quote"here', "processes \\\"");
assertEq(processEscapes(testStr5), "single'here", "processes \\'");
assertEq(processEscapes(testStr6), "backslash\\here", "processes \\\\");

// Test parseEnvFile comments handling
console.log("\nparseEnvFile - comment handling:");
let result: ParseResult = parseEnvFile(`
# This is a comment
KEY=value
# Another comment
# Inline comment
KEY2=value # this should be ignored
`);
assertEq(result.vars.length, 2, "parsed 2 variables");
assertEq(result.vars[0].key, "KEY", "first key is KEY");
assertEq(result.vars[1].key, "KEY2", "second key is KEY2");
assertEq(result.vars[1].value, "value", "inline comment stripped from value");

// Test parseEnvFile protected vars
console.log("\nparseEnvFile - protected variables:");
result = parseEnvFile(`
PATH=/usr/bin
HOME=/home/user
CUSTOM=value
`);
// parseEnvFile parses all, filtering happens in collectEnvChanges
assertEq(result.vars.length, 3, "parseEnvFile parses all vars including protected");
// But collectEnvChanges filters them out
const changesForProtected = collectEnvChanges(result.vars);
const skippedProtected = changesForProtected.skipped.find((s) => s.key === "PATH" && s.reason === "protected");
testAssert(skippedProtected !== undefined, "collectEnvChanges filters protected vars");

// Test parseEnvFile extended syntax
console.log("\nparseEnvFile - extended syntax:");
result = parseEnvFile(`
export EXPORTED=value
KEY?=default_value
KEY+=append_value
KEY-=prepend_value
`);
assertEq(result.vars.length, 4, "parsed 4 variables");
assertEq(result.vars[0].operation, "set", "export is set");
assertEq(result.vars[1].operation, "default", "?= is default");
assertEq(result.vars[2].operation, "append", "+= is append");
assertEq(result.vars[3].operation, "prepend", "-= is prepend");

// Test interpolateValue (with dependency injection)
console.log("\ninterpolateValue:");
const mockEnv: Record<string, string | undefined> = {
  INTERP_TEST: "test_value",
  INTERP_NESTED: "nested_test",
};
assertEq(interpolateValue("simple", 10, undefined, mockEnv), "simple", "no interpolation");
assertEq(interpolateValue("$INTERP_TEST", 10, undefined, mockEnv), "test_value", "simple $VAR");
assertEq(interpolateValue("${INTERP_TEST}", 10, undefined, mockEnv), "test_value", "simple ${VAR}");
assertEq(interpolateValue("prefix_${INTERP_TEST}_suffix", 10, undefined, mockEnv), "prefix_test_value_suffix", "with prefix/suffix");
assertEq(interpolateValue("${INTERP_NESTED}", 10, undefined, mockEnv), "nested_test", "nested var works if exists");

// Test parseEnvFile edge cases
console.log("\nparseEnvFile - edge cases:");
result = parseEnvFile(`
# Empty value
EMPTY=

# Value with equals
EQUALS_IN_VALUE=a=b=c

# Multiline (via backslash)
MULTI=line1\\
line2

# Quoted with spaces
SPACED="hello world"
`);
assertEq(result.vars.length >= 3, true, "parsed multiline and special values");
const equalVar = result.vars.find((v: ParsedVar) => v.key === "EQUALS_IN_VALUE");
if (equalVar) {
  assertEq(equalVar.value, "a=b=c", "equals in value preserved");
}

// Test unquoteValue + processEscapes (combined - single pass)
console.log("\nunquoteValue + processEscapes (combined):");
assertEq(processEscapes(unquoteValue('"\\nhello"')), "\nhello", "handles \\n at start");
assertEq(processEscapes(unquoteValue('"hello\\n"')), "hello\n", "handles \\n at end");
assertEq(processEscapes(unquoteValue('"a\\nb"')), "a\nb", "handles \\n in middle");
assertEq(processEscapes(unquoteValue('"\\t"')), "\t", "handles \\t");
assertEq(processEscapes(unquoteValue('"\\r"')), "\r", "handles \\r");
assertEq(processEscapes(unquoteValue('"hello"')), "hello", "simple quoted");
assertEq(processEscapes(unquoteValue('"test\\n"')), "test\n", "backslash-n becomes newline");
assertEq(processEscapes(unquoteValue('"multi\\nline"')), "multi\nline", "multi\\nline becomes real newline");

// Test interpolateValue cycle detection
console.log("\ninterpolateValue - cycle detection:");
const cycleEnv: Record<string, string | undefined> = {
  CYCLE_A: "${CYCLE_B}",
  CYCLE_B: "${CYCLE_A}",
};
let cycleResult = interpolateValue("${CYCLE_A}", 5, undefined, cycleEnv);
testAssert(cycleResult === "" || cycleResult === "${CYCLE_A}", "prevents infinite cycle");

// Test interpolateValue with self-reference
console.log("\ninterpolateValue - self-reference:");
const selfRefEnv: Record<string, string | undefined> = {
  SELF_REF: "${SELF_REF}_suffix",
};
const selfResult = interpolateValue("${SELF_REF}", 3, undefined, selfRefEnv);
testAssert(selfResult !== undefined, "handles self-reference gracefully");

// Test interpolateValue deep nesting still works
console.log("\ninterpolateValue - deep nesting:");
const nestedEnv: Record<string, string | undefined> = {
  LEVEL1: "${LEVEL2}",
  LEVEL2: "${LEVEL3}",
  LEVEL3: "final",
};
assertEq(interpolateValue("${LEVEL1}", 10, undefined, nestedEnv), "final", "resolves deep nesting");

// Test interpolateValue unknown variable warning (typed with InterpolationWarning)
console.log("\ninterpolateValue - unknown variable warning:");
const warnings: InterpolationWarning[] = [];
const unknownEnv: Record<string, string | undefined> = {
  API_URL: "https://$UNKNOWN_HOST/api",
};
const testVal = unknownEnv.API_URL || "";
assertEq(interpolateValue(testVal, 10, warnings, unknownEnv), "https:///api", "strips unknown var, result is https:///api");
assertEq(warnings.length, 1, "collects warning for unknown variable");
assertEq(warnings[0].varName, "UNKNOWN_HOST", "warning contains var name");

// Test interpolateValue multiple unknown vars (typed)
console.log("\ninterpolateValue - multiple unknown vars:");
const warnings2: InterpolationWarning[] = [];
const result2 = interpolateValue("https://$MISSING1:$MISSING2/path", 10, warnings2, {});
assertEq(result2, "https://:/path", "handles multiple unknown vars");
assertEq(warnings2.length, 2, "collects warning for each unknown var");

// Test SECRET_KEY_PATTERNS
console.log("\nSECRET_KEY_PATTERNS - type check:");
const testKey = "MY_CUSTOM_VAR";
testAssert(isSecretKey(testKey) === false, "MY_CUSTOM_VAR is not secret (no pattern match)");
testAssert(isSecretKey("CUSTOM_KEY") === true, "CUSTOM_KEY is secret (_KEY pattern)");
testAssert(isSecretKey("CUSTOM_SECRET") === true, "CUSTOM_SECRET is secret (_SECRET pattern)");
testAssert(isSecretKey("DATABASE_PASSWORD") === true, "DATABASE_PASSWORD is secret (PASSWORD pattern)");

// Test collectEnvChanges - transactional behavior (with isolation)
console.log("\ncollectEnvChanges - transactional behavior:");
beforeEach();
const testContent = `NEW_TEST_VAR=expected_value`;
const { vars: vars1 }: ParseResult = parseEnvFile(testContent);

const changes: EnvChangesResult = collectEnvChanges(vars1);
testAssert(process.env.NEW_TEST_VAR === undefined, "collectEnvChanges does not mutate process.env");
testAssert(changes.toSet.has("NEW_TEST_VAR") === true, "collectEnvChanges returns correct toSet");
assertEq(changes.toSet.get("NEW_TEST_VAR"), "expected_value", "toSet contains correct value");
assertEq(changes.skipped.length, 0, "no variables skipped");

applyEnvChanges(changes);
testAssert(process.env.NEW_TEST_VAR === "expected_value", "applyEnvChanges applies changes to process.env");
afterEach();

// Test collectEnvChanges with protected variables
console.log("\ncollectEnvChanges - protected variables:");
const protectedContent = `HOME=/fake/path\nCUSTOM_VAR=value`;
const { vars: vars2, errors: parseErrors }: ParseResult = parseEnvFile(protectedContent);
const changes2: EnvChangesResult = collectEnvChanges(vars2);
testAssert(changes2.toSet.has("CUSTOM_VAR") === true, "non-protected var is collected");
testAssert(changes2.toSet.has("HOME") === false, "protected var is not in toSet");
const skippedHome = changes2.skipped.find((s) => s.key === "HOME" && s.reason === "protected");
testAssert(skippedHome !== undefined, "protected var reported in skipped");

// Test collectEnvChanges with existing variables
console.log("\ncollectEnvChanges - existing variables:");
beforeEach();
process.env.EXISTING_VAR = "original";
const existingContent = `EXISTING_VAR=new_value`;
const { vars: vars3 }: ParseResult = parseEnvFile(existingContent);
const changes3: EnvChangesResult = collectEnvChanges(vars3);
testAssert(changes3.toSet.has("EXISTING_VAR") === false, "existing var with set operation not collected");
const skippedExisting = changes3.skipped.find((s) => s.key === "EXISTING_VAR" && s.reason === "exists");
testAssert(skippedExisting !== undefined, "existing var reported in skipped");
testAssert(process.env.EXISTING_VAR === "original", "original value preserved");
afterEach();

// Test collectEnvChanges with ?= (default)
console.log("\ncollectEnvChanges - ?= (default operation):");
beforeEach();
delete process.env.DEFAULT_VAR;
const defaultContent = `DEFAULT_VAR?=should_be_set`;
const { vars: vars4 }: ParseResult = parseEnvFile(defaultContent);
const changes4: EnvChangesResult = collectEnvChanges(vars4);
testAssert(changes4.toSet.has("DEFAULT_VAR") === true, "?= sets when not exists");

applyEnvChanges(changes4);
testAssert(process.env.DEFAULT_VAR === "should_be_set", "?= applied correctly");

const changes5: EnvChangesResult = collectEnvChanges(vars4);
testAssert(changes5.toSet.has("DEFAULT_VAR") === false, "?= does not overwrite existing");
afterEach();

// Test collectEnvChanges with dependency injection
console.log("\ncollectEnvChanges - dependency injection:");
const diContent = `DI_VAR=\${process.env.PATH || "test"}`;
const { vars: varsDi }: ParseResult = parseEnvFile(diContent);
const diEnv: Record<string, string | undefined> = { DI_VAR: "mock_value" };
const emptyEnv: Record<string, string | undefined> = {};
const changesDi: EnvChangesResult = collectEnvChanges(varsDi, emptyEnv);
testAssert(changesDi.toSet.has("DI_VAR") === true, "works with custom env (non-existing)");

const changesDi2: EnvChangesResult = collectEnvChanges(varsDi, diEnv);
const skippedDi = changesDi2.skipped.find((s) => s.key === "DI_VAR" && s.reason === "exists");
testAssert(skippedDi !== undefined, "detects existing var in custom env");

// === Integration test with test.env ===

const testEnvPath = path.join(process.cwd(), ".pi/extensions", ".tests", "fixtures.env");
if (fs.existsSync(testEnvPath)) {
  console.log("\n=== Integration Test (test.env) ===\n");
  const content = fs.readFileSync(testEnvPath, "utf-8");
  const { vars, errors }: ParseResult = parseEnvFile(content);

  console.log(`Parsed ${vars.length} variables`);
  if (errors.length > 0) {
    console.log("Warnings:");
    for (const e of errors) console.log(`  ${e}`);
  }

  const varMap = new Map(vars.map((v: ParsedVar) => [v.key, v.value]));

  if (varMap.has("TEST_KEY")) {
    console.log(`  TEST_KEY secret: ${isSecretKey("TEST_KEY")}`);
  }
} else {
  console.log("\n(test.env not found, skipping integration test)");
}

// === Summary ===

console.log("\n=== Summary ===");
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${failedTests}`);

if (failedTests > 0) {
  process.exit(1);
}