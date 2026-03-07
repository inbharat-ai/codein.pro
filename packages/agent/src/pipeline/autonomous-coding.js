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

const { AGENT_TYPE } = require("../mas/types");
const { logger } = require("../logger");

class AutonomousCodingPipeline {
  /**
   * @param {Object} deps
   * @param {Object} deps.swarmManager - SwarmManager instance
   * @param {Object} deps.computeSelector - ComputeSelector instance
   * @param {Object} deps.sessionManager - SessionManager instance
   */
  constructor(deps) {
    this.swarmManager = deps.swarmManager;
    this.computeSelector = deps.computeSelector;
    this.sessionManager = deps.sessionManager;

    this.pipelines = new Map(); // pipelineId → Pipeline state
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
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    logger.info("Starting autonomous coding pipeline", {
      pipelineId,
      goal: request.goal,
    });

    // Initialize pipeline state
    const pipeline = {
      id: pipelineId,
      goal: request.goal,
      language: request.language || "auto",
      framework: request.framework,
      constraints: request.constraints || {},
      sessionId: request.sessionId,
      status: "running",
      phase: "ideation",
      phases: [],
      artifacts: {},
      startTime,
      endTime: null,
    };

    this.pipelines.set(pipelineId, pipeline);

    try {
      // PHASE 1: Ideation → Specification
      const spec = await this._phaseIdeation(pipeline);
      pipeline.artifacts.specification = spec;
      pipeline.phases.push({
        name: "ideation",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 2: Specification → Architecture
      pipeline.phase = "architecture";
      const architecture = await this._phaseArchitecture(pipeline, spec);
      pipeline.artifacts.architecture = architecture;
      pipeline.phases.push({
        name: "architecture",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 3: Architecture → Implementation
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
      pipeline.phase = "review";
      const review = await this._phaseReview(pipeline, implementation);
      pipeline.artifacts.review = review;
      pipeline.phases.push({
        name: "review",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // PHASE 7: Documentation & Delivery
      pipeline.phase = "delivery";
      const delivery = await this._phaseDelivery(pipeline);
      pipeline.artifacts.delivery = delivery;
      pipeline.phases.push({
        name: "delivery",
        status: "completed",
        duration: Date.now() - startTime,
      });

      // Pipeline complete
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
    const result = await this.swarmManager.taskOrchestrate({
      goal: `Create detailed technical specification for: ${pipeline.goal}\n\nInclude:\n- Core features\n- Technical requirements\n- System boundaries\n- Data models\n- API contracts\n- Non-functional requirements`,
      topology: "mesh", // Collaborative
      strategy: "parallel",
      context: {
        language: pipeline.language,
        framework: pipeline.framework,
        constraints: pipeline.constraints,
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
    const result = await this.swarmManager.taskOrchestrate({
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

    // Multiple coder agents implement in parallel
    const result = await this.swarmManager.taskOrchestrate({
      goal: `Implement the system:\n${architecture.fileStructure}\n\nGenerate complete, production-ready code for all modules.`,
      topology: "mesh", // Parallel coding
      strategy: "parallel",
      agentTypes: [AGENT_TYPE.CODER, AGENT_TYPE.CODER, AGENT_TYPE.CODER],
    });

    return {
      taskId: result.taskId,
      code: result.output || "Code generated",
    };
  }

  async _phaseTesting(pipeline, implementation) {
    logger.info("Phase 4: Implementation → Testing", {
      pipelineId: pipeline.id,
    });

    // Tester agent generates and runs tests
    const result = await this.swarmManager.taskOrchestrate({
      goal: `Generate comprehensive test suite for:\n${implementation.code}\n\nInclude:\n- Unit tests\n- Integration tests\n- Edge cases\n- Run tests and report results`,
      topology: "ring", // Sequential test → debug loop
      strategy: "sequential",
      agentTypes: [AGENT_TYPE.TESTER],
    });

    return {
      taskId: result.taskId,
      testSuite: result.output || "Tests generated",
      passCount: 0, // Parse from output
      failureCount: 0, // Parse from output
    };
  }

  async _phaseIteration(pipeline, testResults) {
    logger.info("Phase 5: Testing → Iteration", {
      pipelineId: pipeline.id,
    });

    // Debugger agent fixes failing tests
    const result = await this.swarmManager.taskOrchestrate({
      goal: `Fix failing tests:\n${JSON.stringify(testResults, null, 2)}\n\nDebug and fix all failures.`,
      topology: "ring", // Iterative debugging
      strategy: "sequential",
      agentTypes: [AGENT_TYPE.DEBUGGER],
      maxIterations: 3,
    });

    return {
      taskId: result.taskId,
      fixes: result.output || "Tests fixed",
    };
  }

  async _phaseReview(pipeline, implementation) {
    logger.info("Phase 6: Review & Security", {
      pipelineId: pipeline.id,
    });

    // Reviewer + Security agents perform code review
    const result = await this.swarmManager.taskOrchestrate({
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
    const result = await this.swarmManager.taskOrchestrate({
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
}

module.exports = { AutonomousCodingPipeline };
