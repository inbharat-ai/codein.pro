/**
 * Autonomous Coding Pipeline
 *
 * Multi-phase software creation workflow:
 *
 * PHASE 1: IDEATION → SPECIFICATION
 *   - User provides idea/goal
 *   - Planner Agent generates detailed specification
 *   - Architecture Agent defines system structure
 *
 * PHASE 2: SPECIFICATION → FILE STRUCTURE
 *   - Architect Agent creates file tree
 *   - Defines module boundaries, APIs, data models
 *
 * PHASE 3: FILE STRUCTURE → CODE GENERATION
 *   - Coder Agents generate implementation (parallel)
 *   - Each agent handles specific modules/files
 *
 * PHASE 4: CODE → TESTING
 *   - Tester Agent generates test suite
 *   - Runs tests, identifies failures
 *
 * PHASE 5: TESTING → ITERATION
 *   - Debugger Agent fixes failing tests
 *   - Iterates until all tests pass
 *
 * PHASE 6: ITERATION → REVIEW
 *   - Reviewer Agent performs code review
 *   - Security Agent checks vulnerabilities
 *   - Refactorer Agent improves code quality
 *
 * PHASE 7: REVIEW → DELIVERY
 *   - Docs Agent generates documentation
 *   - DevOps Agent creates deployment config
 *   - Final package delivered
 */

"use strict";

const path = require("node:path");
const { AGENT_TYPE } = require("../mas/types");
const { logger } = require("../logger");

class AutonomousCodingPipeline {
  /**
   * @param {Object} deps
   * @param {Object} deps.swarmManager - SwarmManager instance
   * @param {Object} deps.computeSelector - ComputeSelector instance
   * @param {Object} deps.sessionManager - SessionManager instance
   * @param {Object} [deps.repoIndex] - RepoIndex instance (repo intelligence)
   * @param {Object} [deps.validationPipeline] - ValidationPipeline instance
   * @param {Object} [deps.refactorPlanner] - RefactorPlanner instance
   * @param {Object} [deps.refactorExecutor] - RefactorExecutor instance
   */
  constructor(deps) {
    this.swarmManager = deps.swarmManager;
    this.computeSelector = deps.computeSelector;
    this.sessionManager = deps.sessionManager;
    this.i18nOrchestrator = deps.i18nOrchestrator || null;
    this.repoIndex = deps.repoIndex || null;
    this.validationPipeline = deps.validationPipeline || null;
    this.refactorPlanner = deps.refactorPlanner || null;
    this.refactorExecutor = deps.refactorExecutor || null;

    this.pipelines = new Map(); // pipelineId → Pipeline state
  }

  createPipelineId() {
    return `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  cancelPipeline(pipelineId, reason = "Cancelled by user") {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return { success: false, error: "Pipeline not found" };

    pipeline.cancellationRequested = true;
    pipeline.cancelReason = reason;
    if (pipeline.status === "running") {
      pipeline.status = "cancelling";
    }

    const cancelledTaskIds = [];
    for (const taskId of pipeline.activeTaskIds || []) {
      const cancelResult = this.swarmManager?.taskCancel?.(taskId);
      if (cancelResult?.success) {
        cancelledTaskIds.push(taskId);
      }
    }

    return { success: true, cancelledTaskIds };
  }

  /**
   * Start autonomous coding pipeline
   *
   * @param {Object} request
   * @param {string} request.goal - High-level goal (e.g., "Build a REST API for user management")
   * @param {string} [request.language] - Target language (default: "auto-detect")
   * @param {string} [request.framework] - Preferred framework
   * @param {Object} [request.constraints] - Technical constraints
   * @param {string} [request.sessionId] - Session ID for workspace isolation
   * @returns {Promise<Object>} Pipeline execution result
   */
  async execute(request) {
    const pipelineId =
      typeof request?.pipelineId === "string" && request.pipelineId.trim()
        ? request.pipelineId.trim()
        : this.createPipelineId();
    const startTime = Date.now();

    logger.info("Starting autonomous coding pipeline", {
      pipelineId,
      goal: request.goal,
    });

    const languageInfo = await this._normalizeGoal(
      request.goal,
      request.language,
    );

    // Initialize pipeline state
    const pipeline = {
      id: pipelineId,
      goal: languageInfo.normalizedGoal,
      originalGoal: request.goal,
      inputLanguage: languageInfo.detectedLanguage,
      goalTranslated: languageInfo.translated,
      language: request.language || languageInfo.detectedLanguage || "auto",
      framework: request.framework,
      constraints: request.constraints || {},
      sessionId: request.sessionId,
      ownerUserId: request.ownerUserId || "local",
      workspaceRoot: this._resolveWorkspaceRoot(request.sessionId),
      status: "running",
      phase: "ideation",
      phases: [],
      artifacts: {
        commandNormalization: {
          originalGoal: request.goal,
          normalizedGoal: languageInfo.normalizedGoal,
          detectedLanguage: languageInfo.detectedLanguage,
          translated: languageInfo.translated,
          confidence: languageInfo.confidence,
          mixedLanguage: languageInfo.mixedLanguage,
          codeSwitching: languageInfo.codeSwitching,
          traceId: languageInfo.traceId,
          technicalDensity: languageInfo.technicalDensity,
        },
      },
      startTime,
      endTime: null,
      cancellationRequested: false,
      cancelReason: null,
      activeTaskIds: [],
    };

    this.pipelines.set(pipelineId, pipeline);

    try {
      // PHASE 1: Ideation → Specification
      this._assertNotCancelled(pipeline);
      const spec = await this._phaseIdeation(pipeline);
      pipeline.artifacts.specification = spec;
      pipeline.phases.push({
        name: "ideation",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 2: Specification → Architecture
      this._assertNotCancelled(pipeline);
      pipeline.phase = "architecture";
      const architecture = await this._phaseArchitecture(pipeline, spec);
      pipeline.artifacts.architecture = architecture;
      pipeline.phases.push({
        name: "architecture",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 3: Architecture → Implementation
      this._assertNotCancelled(pipeline);
      pipeline.phase = "implementation";
      const implementation = await this._phaseImplementation(
        pipeline,
        architecture,
      );
      pipeline.artifacts.implementation = implementation;
      pipeline.phases.push({
        name: "implementation",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 4: Implementation → Testing
      this._assertNotCancelled(pipeline);
      pipeline.phase = "testing";
      const testResults = await this._phaseTesting(pipeline, implementation);
      pipeline.artifacts.tests = testResults;
      pipeline.phases.push({
        name: "testing",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 5: Testing → Iteration (if tests fail)
      if (testResults.failureCount > 0) {
        this._assertNotCancelled(pipeline);
        pipeline.phase = "iteration";
        const fixes = await this._phaseIteration(pipeline, testResults);
        pipeline.artifacts.fixes = fixes;
        pipeline.phases.push({
          name: "iteration",
          status: "completed",
          duration: Date.now() - startTime,
        });
      }

      // PHASE 6: Review & Security
      this._assertNotCancelled(pipeline);
      pipeline.phase = "review";
      const review = await this._phaseReview(pipeline, implementation);
      pipeline.artifacts.review = review;
      pipeline.phases.push({
        name: "review",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 7: Documentation & Delivery
      this._assertNotCancelled(pipeline);
      pipeline.phase = "delivery";
      const delivery = await this._phaseDelivery(pipeline);
      pipeline.artifacts.delivery = delivery;
      pipeline.phases.push({
        name: "delivery",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // Pipeline complete
      this._assertNotCancelled(pipeline);
      pipeline.status = "completed";
      pipeline.endTime = Date.now();
      pipeline.totalDuration = pipeline.endTime - pipeline.startTime;

      logger.info("Autonomous coding pipeline completed", {
        pipelineId,
        duration: pipeline.totalDuration,
        phases: pipeline.phases.length,
      });

      return {
        success: true,
        pipelineId,
        artifacts: pipeline.artifacts,
        duration: pipeline.totalDuration,
        phases: pipeline.phases,
      };
    } catch (error) {
      if (error && error.code === "PIPELINE_CANCELLED") {
        pipeline.status = "cancelled";
        pipeline.error = error.message;
        pipeline.endTime = Date.now();
        pipeline.totalDuration = pipeline.endTime - pipeline.startTime;
        return {
          success: false,
          cancelled: true,
          pipelineId,
          reason: pipeline.cancelReason || error.message,
          duration: pipeline.totalDuration,
          phases: pipeline.phases,
        };
      }

      pipeline.status = "failed";
      pipeline.error = error.message;
      pipeline.endTime = Date.now();

      logger.error("Autonomous coding pipeline failed", {
        pipelineId,
        phase: pipeline.phase,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get pipeline status
   */
  getStatus(pipelineId) {
    return this.pipelines.get(pipelineId) || null;
  }

  /**
   * List all pipelines
   */
  listPipelines(filter = {}) {
    const pipelines = Array.from(this.pipelines.values());
    return pipelines.filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.sessionId && p.sessionId !== filter.sessionId) return false;
      return true;
    });
  }

  // ─── Private Phase Methods ────────────────────────────────────────────────

  async _phaseIdeation(pipeline) {
    logger.info("Phase 1: Ideation → Specification", {
      pipelineId: pipeline.id,
    });

    // Orchestrate planner + architect for specification
    const result = await this._runSwarmTask(pipeline, {
      goal: `Create detailed technical specification for: ${pipeline.goal}\n\nInclude:\n- Core features\n- Technical requirements\n- System boundaries\n- Data models\n- API contracts\n- Non-functional requirements`,
      topology: "mesh", // Collaborative
      strategy: "parallel",
      context: {
        language: pipeline.language,
        framework: pipeline.framework,
        constraints: pipeline.constraints,
        workspaceRoot: pipeline.workspaceRoot,
      },
    });

    return {
      taskId: result.taskId,
      specification: result.output || "Specification generated",
    };
  }

  async _phaseArchitecture(pipeline, spec) {
    logger.info("Phase 2: Specification → Architecture", {
      pipelineId: pipeline.id,
    });

    // Architect agent designs system structure
    const result = await this._runSwarmTask(pipeline, {
      goal: `Design system architecture for:\n${spec.specification}\n\nOutput:\n- File structure\n- Module boundaries\n- Component dependencies\n- Data flow\n- API design`,
      topology: "mesh",
      strategy: "sequential",
      agentTypes: [AGENT_TYPE.ARCHITECT],
    });

    return {
      taskId: result.taskId,
      fileStructure: result.output || "Architecture designed",
    };
  }

  async _phaseImplementation(pipeline, architecture) {
    logger.info("Phase 3: Architecture → Implementation", {
      pipelineId: pipeline.id,
    });

    const repoContext = await this._buildRepoContext(pipeline, pipeline.goal);

    // Multiple coder agents implement in parallel
    const result = await this._runSwarmTask(pipeline, {
      goal: `Implement the system:\n${architecture.fileStructure}\n\nGenerate complete, production-ready code for all modules.`,
      topology: "mesh", // Parallel coding
      strategy: "parallel",
      context: {
        workspaceRoot: pipeline.workspaceRoot,
        workspaceSummary: repoContext.summary,
        repoContext: repoContext.context,
      },
      agentTypes: [AGENT_TYPE.CODER, AGENT_TYPE.CODER, AGENT_TYPE.CODER],
    });

    const generatedEdits = this._extractEditsFromTask(result.taskId);
    let applyResult = null;
    if (
      generatedEdits.length > 0 &&
      pipeline.workspaceRoot &&
      this.refactorExecutor
    ) {
      applyResult = await this.refactorExecutor.execute(
        pipeline.workspaceRoot,
        {
          id: `pipeline_apply_${pipeline.id}`,
          goal: pipeline.goal,
          strategy: "generic",
          steps: [],
        },
        {
          edits: generatedEdits,
          skipValidation: true,
          maxRetries: 0,
        },
      );

      if (applyResult.status !== "completed") {
        throw new Error(
          `Implementation apply failed: ${applyResult.errors?.join("; ") || applyResult.status}`,
        );
      }
    }

    return {
      taskId: result.taskId,
      code: result.output || "Code generated",
      generatedFiles: generatedEdits.map((e) => e.relativePath),
      applied: applyResult,
    };
  }

  async _phaseTesting(pipeline, implementation) {
    logger.info("Phase 4: Implementation → Testing", {
      pipelineId: pipeline.id,
    });

    // If repo intelligence is available, run validation pipeline first
    let validationReport = null;
    if (this.validationPipeline && pipeline.workspaceRoot) {
      try {
        const customCommands = [];
        if (pipeline.constraints?.buildCommand) {
          customCommands.push(String(pipeline.constraints.buildCommand));
        }

        validationReport = await this.validationPipeline.validate(
          pipeline.workspaceRoot,
          {
            lint: true,
            typecheck: true,
            test: true,
            changedFiles: implementation.generatedFiles,
            customCommands,
          },
        );
        logger.info("Phase 4: validation pipeline result", {
          pipelineId: pipeline.id,
          allPassed: validationReport.allPassed,
          summary: validationReport.summary,
        });
      } catch (err) {
        logger.warn(
          "Phase 4: validation pipeline failed, falling back to agent",
          {
            pipelineId: pipeline.id,
            error: err.message,
          },
        );
      }
    }

    // Tester agent generates and runs tests
    const result = await this._runSwarmTask(pipeline, {
      goal: `Generate comprehensive test suite for:\n${implementation.code}\n\nInclude:\n- Unit tests\n- Integration tests\n- Edge cases\n- Run tests and report results`,
      topology: "ring", // Sequential test → debug loop
      strategy: "sequential",
      agentTypes: [AGENT_TYPE.TESTER],
    });

    // Parse pass/fail from validation if available
    const passCount = validationReport?.allPassed ? 1 : 0;
    const failureCount =
      validationReport && !validationReport.allPassed ? 1 : 0;

    return {
      taskId: result.taskId,
      testSuite: result.output || "Tests generated",
      passCount,
      failureCount,
      validationReport,
    };
  }

  async _phaseIteration(pipeline, testResults) {
    logger.info("Phase 5: Testing → Iteration (closed-loop)", {
      pipelineId: pipeline.id,
    });

    const MAX_FIX_CYCLES = 3;
    let currentTestResults = testResults;
    let allFixes = [];

    for (let cycle = 0; cycle < MAX_FIX_CYCLES; cycle++) {
      logger.info(`Phase 5: fix cycle ${cycle + 1}/${MAX_FIX_CYCLES}`, {
        pipelineId: pipeline.id,
      });

      // Debugger agent fixes failing tests
      const result = await this._runSwarmTask(pipeline, {
        goal: `Fix failing tests:\n${JSON.stringify(currentTestResults, null, 2)}\n\nDebug and fix all failures.`,
        topology: "ring",
        strategy: "sequential",
        agentTypes: [AGENT_TYPE.DEBUGGER],
        maxIterations: 3,
      });

      allFixes.push(result.output || "Fixes applied");

      // Apply debugger-generated edits before re-validation when available.
      const fixEdits = this._extractEditsFromTask(result.taskId);
      if (
        fixEdits.length > 0 &&
        pipeline.workspaceRoot &&
        this.refactorExecutor
      ) {
        const applyFixResult = await this.refactorExecutor.execute(
          pipeline.workspaceRoot,
          {
            id: `pipeline_fix_${pipeline.id}_${cycle + 1}`,
            goal: `Fix cycle ${cycle + 1}`,
            strategy: "generic",
            steps: [],
          },
          {
            edits: fixEdits,
            skipValidation: true,
            maxRetries: 0,
          },
        );

        if (applyFixResult.status !== "completed") {
          logger.warn("Phase 5: failed to apply debugger edits", {
            pipelineId: pipeline.id,
            cycle: cycle + 1,
            status: applyFixResult.status,
            errors: applyFixResult.errors,
          });
        }
      }

      // Re-validate if pipeline is available (closed-loop)
      if (this.validationPipeline && pipeline.workspaceRoot) {
        try {
          const revalidation = await this.validationPipeline.validate(
            pipeline.workspaceRoot,
            {
              lint: true,
              typecheck: true,
              test: true,
              customCommands: pipeline.constraints?.buildCommand
                ? [String(pipeline.constraints.buildCommand)]
                : undefined,
            },
          );

          if (revalidation.allPassed) {
            logger.info("Phase 5: all tests passing after fix cycle", {
              pipelineId: pipeline.id,
              cycle: cycle + 1,
            });
            break;
          }

          // Update test results for next cycle
          currentTestResults = {
            ...currentTestResults,
            validationReport: revalidation,
            failureCount: 1,
          };
        } catch (err) {
          logger.warn("Phase 5: re-validation failed", { error: err.message });
          break;
        }
      } else {
        // No validator → single pass only
        break;
      }
    }

    return {
      taskId: `iteration_${pipeline.id}`,
      fixes: allFixes.join("\n---\n"),
      fixCycles: allFixes.length,
    };
  }

  async _phaseReview(pipeline, implementation) {
    logger.info("Phase 6: Review & Security", {
      pipelineId: pipeline.id,
    });

    // Reviewer + Security agents perform code review
    const result = await this._runSwarmTask(pipeline, {
      goal: `Perform comprehensive code review:\n${implementation.code}\n\nCheck:\n- Code quality\n- Security vulnerabilities\n- Performance issues\n- Best practices\n- Suggest improvements`,
      topology: "star", // Competitive review (pick best feedback)
      strategy: "parallel",
      agentTypes: [
        AGENT_TYPE.REVIEWER,
        AGENT_TYPE.SECURITY,
        AGENT_TYPE.REFACTORER,
      ],
    });

    return {
      taskId: result.taskId,
      feedback: result.output || "Review completed",
    };
  }

  async _phaseDelivery(pipeline) {
    logger.info("Phase 7: Review → Delivery", {
      pipelineId: pipeline.id,
    });

    // Docs + DevOps agents prepare delivery package
    const result = await this._runSwarmTask(pipeline, {
      goal: `Prepare delivery package:\n\n- Generate README\n- API documentation\n- Setup instructions\n- Deployment config\n- CI/CD pipeline`,
      topology: "mesh",
      strategy: "parallel",
      agentTypes: [AGENT_TYPE.DOCS, AGENT_TYPE.DEVOPS],
    });

    return {
      taskId: result.taskId,
      documentation: result.output || "Documentation generated",
      packageReady: true,
    };
  }

  async _normalizeGoal(goal, languageHint) {
    if (!this.i18nOrchestrator || typeof goal !== "string") {
      return {
        normalizedGoal: goal,
        detectedLanguage: languageHint || "en",
        translated: false,
        confidence: 0.7,
        mixedLanguage: false,
        codeSwitching: null,
        traceId: null,
      };
    }

    try {
      if (
        typeof this.i18nOrchestrator.normalizeCodingInstruction === "function"
      ) {
        const normalized =
          await this.i18nOrchestrator.normalizeCodingInstruction(goal, {
            languageHint,
          });

        return {
          normalizedGoal: normalized.normalizedEnglishTask,
          detectedLanguage: normalized.sourceLanguage,
          translated: normalized.translated,
          confidence: normalized.confidence,
          mixedLanguage: normalized.mixedLanguage,
          codeSwitching: normalized.codeSwitching,
          traceId: normalized.traceId,
          originalGoal: normalized.originalText,
          technicalDensity: normalized.technicalDensity,
        };
      }

      const detectedLanguage =
        languageHint && languageHint !== "auto"
          ? languageHint
          : this.i18nOrchestrator.detectLanguage(goal);
      const translated = await this.i18nOrchestrator.translateToEnglishIfNeeded(
        goal,
        detectedLanguage,
      );
      return {
        normalizedGoal: translated.text,
        detectedLanguage,
        translated: translated.translated,
        confidence: 0.75,
        mixedLanguage: false,
        codeSwitching: null,
        traceId: null,
      };
    } catch (err) {
      logger.warn(
        "Pipeline language normalization failed, using original goal",
        {
          error: err.message,
        },
      );
      return {
        normalizedGoal: goal,
        detectedLanguage: languageHint || "en",
        translated: false,
        confidence: 0.5,
        mixedLanguage: false,
        codeSwitching: null,
        traceId: null,
      };
    }
  }

  _resolveWorkspaceRoot(sessionIdOrPath) {
    if (!sessionIdOrPath || typeof sessionIdOrPath !== "string") {
      return null;
    }

    if (this.sessionManager?.getSession) {
      const session = this.sessionManager.getSession(sessionIdOrPath);
      if (session?.workspacePath) {
        return path.resolve(session.workspacePath);
      }
      if (session?.workspaceDir) {
        return path.resolve(session.workspaceDir);
      }
    }

    if (path.isAbsolute(sessionIdOrPath)) {
      return path.resolve(sessionIdOrPath);
    }

    return null;
  }

  async _buildRepoContext(pipeline, objective) {
    if (!this.repoIndex || !pipeline.workspaceRoot) {
      return { summary: "No repository context available", context: null };
    }

    try {
      await this.repoIndex.scan(pipeline.workspaceRoot, {
        incremental: true,
        maxFiles: pipeline.constraints?.maxContextFiles || 30000,
      });

      const terms = String(objective || "")
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((t) => t.length > 2)
        .slice(0, 24);
      const ctx = this.repoIndex.assembleContext(terms, {
        maxTokens: pipeline.constraints?.contextTokens || 10000,
        maxFiles: pipeline.constraints?.contextFiles || 25,
      });
      return {
        summary: this.repoIndex.getRepoSummary(80),
        context: ctx,
      };
    } catch (err) {
      logger.warn("Pipeline repo context build failed", {
        pipelineId: pipeline.id,
        error: err.message,
      });
      return { summary: "Repository context unavailable", context: null };
    }
  }

  /**
   * Extract and validate file edits from swarm task output.
   * Implements strict schema validation and safety checks for production reliability.
   *
   * @param {string} taskId - Task ID to extract results from
   * @returns {Array<Object>} Array of validated edits {relativePath, newContent, checksum}
   */
  _extractEditsFromTask(taskId) {
    const task = this.swarmManager?.taskResults?.(taskId);
    if (!task || !Array.isArray(task.results)) {
      logger.warn("No task results found for extract edits", { taskId });
      return [];
    }

    const edits = [];
    const VALIDATION_ERRORS = [];

    for (const resultEntry of task.results) {
      const files = resultEntry?.result?.files;
      if (!Array.isArray(files)) {
        VALIDATION_ERRORS.push("Empty or non-array files result");
        continue;
      }

      for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
        const f = files[fileIdx];

        // 1. Validate file object structure
        if (!f || typeof f !== "object") {
          VALIDATION_ERRORS.push(`File ${fileIdx}: not an object`);
          continue;
        }

        if (typeof f.path !== "string" || !f.path.trim()) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx}: invalid path (must be non-empty string)`,
          );
          continue;
        }

        // 2. Strict path validation (reject absolute, traversal, and suspicious patterns)
        if (f.path.startsWith("/") || f.path.startsWith("\\")) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx}: absolute path not allowed: ${f.path}`,
          );
          continue;
        }

        if (f.path.includes("..")) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx}: path traversal not allowed: ${f.path}`,
          );
          continue;
        }

        if (
          f.path.includes("\0") ||
          f.path.includes("\r") ||
          f.path.includes("\n")
        ) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx}: path contains invalid characters: ${f.path}`,
          );
          continue;
        }

        // 3. Reject delete operations (should only add/modify)
        if (f.action === "delete" || f.action === "remove") {
          VALIDATION_ERRORS.push(
            `File ${fileIdx}: delete operations not supported in autonomous pipeline`,
          );
          continue;
        }

        // 4. Validate content
        if (typeof f.content !== "string") {
          VALIDATION_ERRORS.push(
            `File ${fileIdx} (${f.path}): content is not a string`,
          );
          continue;
        }

        // 5. Check content size (reasonable limit for generated code)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
        if (f.content.length > MAX_FILE_SIZE) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx} (${f.path}): exceeds size limit (${f.content.length} > ${MAX_FILE_SIZE} bytes)`,
          );
          continue;
        }

        // 6. Warn on very small content (likely errors in generation)
        if (f.content.length < 2) {
          VALIDATION_ERRORS.push(
            `File ${fileIdx} (${f.path}): suspiciously small (${f.content.length} bytes)`,
          );
          continue;
        }

        // 7. Validate file extension against content (basic detection)
        const ext = path.extname(f.path).toLowerCase();
        const suspiciousPatterns = [
          /^#!/, // Shebang outside .sh file
        ];

        for (const pattern of suspiciousPatterns) {
          if (
            pattern.test(f.content) &&
            ![".sh", ".bash", ".ksh", ".zsh"].includes(ext)
          ) {
            VALIDATION_ERRORS.push(
              `File ${fileIdx} (${f.path}): suspicious content pattern detected (possible injection)`,
            );
            continue;
          }
        }

        // 8. Compute checksum for integrity verification
        const crypto = require("node:crypto");
        const checksum = crypto
          .createHash("sha256")
          .update(f.content)
          .digest("hex");

        edits.push({
          relativePath: f.path,
          newContent: f.content,
          contentLength: f.content.length,
          checksum,
          action: f.action || "create",
        });
      }
    }

    // Log validation errors for audit
    if (VALIDATION_ERRORS.length > 0) {
      logger.warn("File extraction validation warnings", {
        taskId,
        warningCount: VALIDATION_ERRORS.length,
        warnings: VALIDATION_ERRORS.slice(0, 10), // First 10
      });
    }

    logger.info("Extracted and validated file edits", {
      taskId,
      editCount: edits.length,
      totalBytes: edits.reduce((sum, e) => sum + e.contentLength, 0),
    });

    return edits;
  }

  _assertNotCancelled(pipeline) {
    if (pipeline?.cancellationRequested) {
      const err = new Error(pipeline.cancelReason || "Pipeline cancelled");
      err.code = "PIPELINE_CANCELLED";
      throw err;
    }
  }

  async _runSwarmTask(pipeline, payload) {
    this._assertNotCancelled(pipeline);
    let taskId = null;
    try {
      const result = await this.swarmManager.taskOrchestrate({
        ...payload,
        onTaskCreated: (createdTaskId) => {
          taskId = createdTaskId;
          pipeline.activeTaskIds.push(createdTaskId);
          if (pipeline.cancellationRequested) {
            this.swarmManager.taskCancel(createdTaskId);
          }
        },
      });
      this._assertNotCancelled(pipeline);
      return result;
    } finally {
      if (taskId) {
        pipeline.activeTaskIds = pipeline.activeTaskIds.filter(
          (activeId) => activeId !== taskId,
        );
      }
    }
  }
}

module.exports = { AutonomousCodingPipeline };
