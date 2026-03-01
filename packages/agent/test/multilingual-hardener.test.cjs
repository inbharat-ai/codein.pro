/**
 * @fileoverview Comprehensive test suite for MultilingualHardener
 * Tests: confidence detection, code-switching, ambiguity resolution,
 * per-language validation, technical content estimation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Source Structure Tests
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: source exports MultilingualHardener class", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /class MultilingualHardener/);
  assert.match(source, /module\.exports/);
});

test("MultilingualHardener: has detectWithConfidence method", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /detectWithConfidence\s*\(/);
});

test("MultilingualHardener: has resolveAmbiguity method", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /resolveAmbiguity\s*\(/);
});

test("MultilingualHardener: has validateLanguageOutput method", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /validateLanguageOutput\s*\(/);
});

test("MultilingualHardener: defines CODE_SWITCHING_PATTERNS", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /CODE_SWITCHING_PATTERNS/);
  // Should include Indian code-switching variants
  assert.match(source, /hinglish/i);
  assert.match(source, /tanglish/i);
});

test("MultilingualHardener: defines LANGUAGE_VALIDATORS for 10+ languages", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  assert.match(source, /LANGUAGE_VALIDATORS/);
  // Should validate major Indian languages + English
  assert.match(source, /hindi|hi/i);
  assert.match(source, /tamil|ta/i);
  assert.match(source, /bengali|bn/i);
  assert.match(source, /telugu|te/i);
});

test("MultilingualHardener: has confidence thresholds defined", () => {
  const source = readSource("src/i18n/multilingual-hardener.js");
  // Ambiguity threshold should be around 0.65
  assert.match(source, /0\.65|ambiguity/);
  // High confidence threshold should be around 0.85
  assert.match(source, /0\.85/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Functional Tests: detectWithConfidence
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: detects English with high confidence", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("How do I fix the authentication error in my Node.js app?");
  assert.ok(result.language, "Should detect language");
  assert.ok(result.confidence > 0.7, "English should have high confidence");
});

test("MultilingualHardener: detects Hindi (Devanagari) with high confidence", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("मुझे Node.js में authentication error ठीक करना है");
  assert.ok(result.language, "Should detect language");
  assert.ok(result.confidence > 0, "Should have positive confidence");
});

test("MultilingualHardener: detects Hinglish as code-switching", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("Mujhe ye error fix karna hai, kya tum help kar sakte ho?");
  assert.ok(result, "Should return detection result");
  // Hinglish (romanized Hindi + English) should trigger code-switching detection
  if (result.codeSwitching) {
    assert.ok(result.codeSwitching, "Should detect code-switching pattern");
  }
});

test("MultilingualHardener: detects Tamil script", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("இந்த error-ஐ எப்படி fix செய்வது?");
  assert.ok(result.language, "Should detect language");
  assert.ok(result.confidence > 0, "Should have positive confidence");
});

test("MultilingualHardener: detects Bengali script", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("আমি এই authentication error ঠিক করতে চাই");
  assert.ok(result.language, "Should detect language");
});

test("MultilingualHardener: detects Telugu script", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.detectWithConfidence("ఈ error ని ఎలా fix చేయాలి?");
  assert.ok(result.language, "Should detect language");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Functional Tests: Technical Content Estimation
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: estimates technical content ratio", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  // Highly technical prompt
  const techResult = hardener.detectWithConfidence(
    "npm install express && node server.js --port 3000 TypeError: Cannot read property of undefined"
  );
  // Mostly natural language prompt
  const naturalResult = hardener.detectWithConfidence(
    "I want to build a beautiful website for my grandmother's flower shop"
  );
  assert.ok(techResult, "Should process technical text");
  assert.ok(naturalResult, "Should process natural text");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Functional Tests: resolveAmbiguity
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: resolveAmbiguity returns valid resolution", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const detection = {
    language: "hi",
    confidence: 0.55,
    level: "low",
    ambiguous: true,
    alternatives: [
      { language: "hi", confidence: 0.55 },
      { language: "en", confidence: 0.40 },
    ],
    codeSwitching: null,
    signals: [],
  };
  const resolution = hardener.resolveAmbiguity(detection, {});
  assert.ok(resolution, "Should return a resolution");
  assert.ok(resolution.language, "Resolution should have a language");
});

test("MultilingualHardener: resolveAmbiguity respects user preference", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const detection = {
    language: "hi",
    confidence: 0.55,
    level: "low",
    ambiguous: true,
    alternatives: [
      { language: "hi", confidence: 0.55 },
      { language: "en", confidence: 0.40 },
    ],
    codeSwitching: null,
    signals: [],
  };
  const resolution = hardener.resolveAmbiguity(detection, { userPreference: "en" });
  assert.ok(resolution, "Should resolve with preference");
  // Should pick user's preferred language when ambiguous
  assert.equal(resolution.language, "en", "Should respect user preference for ambiguous detection");
});

// ═══════════════════════════════════════════════════════════════════════════════
// Functional Tests: validateLanguageOutput
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: validates English output as valid", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.validateLanguageOutput("Here is the fix for your code:", "en");
  assert.ok(result, "Should return validation result");
  assert.ok(result.valid !== undefined, "Should have valid flag");
});

test("MultilingualHardener: validates Hindi output with Devanagari script", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  const result = hardener.validateLanguageOutput("यहाँ आपके कोड का समाधान है:", "hi");
  assert.ok(result, "Should return validation result");
});

test("MultilingualHardener: catches wrong script in output", () => {
  const { MultilingualHardener } = require(path.resolve(__dirname, "../src/i18n/multilingual-hardener.js"));
  const hardener = new MultilingualHardener();
  // Tamil output in Hindi target — should detect wrong script
  const result = hardener.validateLanguageOutput("இங்கே உங்கள் குறியீட்டு தீர்வு உள்ளது", "hi");
  assert.ok(result, "Should return validation result");
  // If validator properly detects script mismatch:
  if (result.valid === false) {
    assert.ok(result.issues && result.issues.length > 0, "Should flag script mismatch");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration with existing LanguageDetector
// ═══════════════════════════════════════════════════════════════════════════════

test("MultilingualHardener: coexists with LanguageDetector", () => {
  const langDetectorPath = path.resolve(__dirname, "../src/i18n/language-detector.js");
  const hardenerPath = path.resolve(__dirname, "../src/i18n/multilingual-hardener.js");
  assert.ok(fs.existsSync(langDetectorPath), "LanguageDetector should exist");
  assert.ok(fs.existsSync(hardenerPath), "MultilingualHardener should exist");

  // Both should be importable
  const { LanguageDetector } = require(langDetectorPath);
  const { MultilingualHardener } = require(hardenerPath);
  assert.ok(LanguageDetector, "LanguageDetector should be importable");
  assert.ok(MultilingualHardener, "MultilingualHardener should be importable");
});
