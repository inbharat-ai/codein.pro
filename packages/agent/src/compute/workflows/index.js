/**
 * Compute Workflows — Barrel Export
 */
"use strict";

const fixBuild = require("./fix-build");
const featureSpec = require("./feature-spec");
const researchCode = require("./research-code");

const WORKFLOWS = {
  "fix-build": fixBuild,
  "feature-spec": featureSpec,
  "research-code": researchCode,
};

module.exports = { WORKFLOWS };
