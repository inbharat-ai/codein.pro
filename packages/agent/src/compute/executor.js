/**
 * CodeIn Compute — Executor
 *
 * Executes a planned job step-by-step.
 * Each step is run via an agent with tool access gated by the sandbox.
 * Supports retry, escalation, pause/resume, and progress streaming.
 */
"use strict";

const { JOB_STATUSES, STEP_STATUSES } = require("./job-model");
const { ComputeSandbox } = require("./sandbox");
const { EscalationManager } = require("./escalation");
const { ArtifactManager, ARTIFACT_TYPES } = require("./artifact-manager");

// System prompt for step execution
const EXECUTOR_SYSTEM_PROMPT = `You are CodeIn Compute, executing a specific step in a larger plan.

INSTRUCTIONS:
1. Focus ONLY on the current step's description
2. Use the available tools to accomplish the step
3. Be precise and concise in your output
4. If you produce a file, save it to the workspace
5. Return a structured result with what you accomplished

OUTPUT FORMAT (JSON):
{
  "result": "Brief description of what was accomplished",
  "output": "The actual output/content produced",
  "artifacts": [{ "name": "filename", "type": "file|report|diff|code", "content": "..." }],
  "confidence": 0.0-1.0,
  "notes": "Any observations or warnings"
}`;

class ComputeExecutor {
  /**
   * @param {object} deps
   * @param {object} deps.modelRuntime - ModelRuntimeManager
   * @param {object} deps.modelRouter - ModelRouter
   * @param {object} [deps.externalProviders] - ExternalProviderManager
   * @param {object} deps.eventStream - ComputeEventStream
   * @param {object} deps.stateMachine - ComputeStateMachine
   * @param {object} deps.jobStore - JobStore
   * @param {object} [deps.policyEnforcer] - PolicyEnforcer
   * @param {object} [deps.mcpClientManager] - MCPClientManager
   */
  constructor(deps) {
    this.modelRuntime = deps.modelRuntime;
    this.modelRouter = deps.modelRouter;
    this.externalProviders = deps.externalProviders || null;
    this.eventStream = deps.eventStream;
    this.stateMachine = deps.stateMachine;
    this.jobStore = deps.jobStore;
    this.policyEnforcer = deps.policyEnforcer || null;
    this.mcpClientManager = deps.mcpClientManager || null;

    this.escalationManager = new EscalationManager({
      externalProviders: this.externalProviders,
      policyEnforcer: this.policyEnforcer,
    });
    this.artifactManager = new ArtifactManager();

    // Track active jobs for pause/cancel
    this._activeJobs = new Map(); // jobId → { aborted: boolean, paused: boolean }
  }

  /**
   * Execute all steps of a job.
   * @param {object} job - Job with plan and steps populated
   * @returns {Promise<object>} Updated job
   */
  async executeJob(job) {
    if (job.status !== JOB_STATUSES.RUNNING) {
      throw new Error(
        `Cannot execute job in status '${job.status}' — must be 'running'`,
      );
    }
    if (!job.steps || job.steps.length === 0) {
      throw new Error("Job has no steps to execute");
    }

    const jobControl = { aborted: false, paused: false };
    this._activeJobs.set(job.id, jobControl);

    // Create sandbox for this job
    const workspaceDir = this.jobStore.ensureWorkspace(job.id);
    const sandbox = new ComputeSandbox({
      workspaceDir,
      policy: job.policy,
    });

    this.eventStream.emitJobProgress(job.id, {
      status: "running",
      progress: 0,
      message: `Starting execution: ${job.steps.length} steps`,
    });

    let completedSteps = 0;
    let totalCostUSD = 0;

    try {
      for (let i = 0; i < job.steps.length; i++) {
        const step = job.steps[i];

        // Check for pause/cancel
        if (jobControl.aborted) {
          this.stateMachine.transitionJob(job, JOB_STATUSES.CANCELLED, {
            reason: "User cancelled",
          });
          break;
        }
        if (jobControl.paused) {
          this.stateMachine.transitionJob(job, JOB_STATUSES.PAUSED, {
            reason: "User paused",
          });
          this.jobStore.save(job);
          // Wait for resume
          await this._waitForResume(job.id, jobControl);
          if (jobControl.aborted) {
            this.stateMachine.transitionJob(job, JOB_STATUSES.CANCELLED, {
              reason: "Cancelled while paused",
            });
            break;
          }
          this.stateMachine.transitionJob(job, JOB_STATUSES.RUNNING, {
            reason: "Resumed",
          });
        }

        // Check policy limits
        if (this.policyEnforcer) {
          const stepCheck = this.policyEnforcer.checkStepLimit(job.policy, i);
          if (!stepCheck.allowed) {
            this.stateMachine.transitionStep(job, step, STEP_STATUSES.SKIPPED, {
              error: stepCheck.reason,
            });
            continue;
          }

          const durationCheck = this.policyEnforcer.checkDuration(
            job.policy,
            job.metadata.startedAt,
          );
          if (!durationCheck.allowed) {
            job.error = durationCheck.reason;
            this.stateMachine.transitionJob(job, JOB_STATUSES.FAILED, {
              error: durationCheck.reason,
            });
            break;
          }
        }

        // Execute the step
        const progress = Math.round((i / job.steps.length) * 100);
        this.eventStream.emitJobProgress(job.id, {
          status: "running",
          progress,
          message: `Step ${i + 1}/${job.steps.length}: ${step.description}`,
        });

        await this._executeStep(job, step, sandbox, {
          currentCostUSD: totalCostUSD,
        });

        if (
          step.status === STEP_STATUSES.COMPLETED ||
          step.status === STEP_STATUSES.ESCALATED
        ) {
          completedSteps++;
          totalCostUSD += step.costEstimate || 0;
        }

        // Save progress after each step
        job.metadata.tokensUsed += step.tokensUsed || 0;
        job.metadata.totalCostEstimate = totalCostUSD;
        if (step.model && !job.metadata.modelsUsed.includes(step.model)) {
          job.metadata.modelsUsed.push(step.model);
        }
        this.jobStore.save(job);
      }

      // Determine final status
      if (job.status === JOB_STATUSES.RUNNING) {
        const failedSteps = job.steps.filter(
          (s) => s.status === STEP_STATUSES.FAILED,
        );
        if (failedSteps.length === 0) {
          this.stateMachine.transitionJob(job, JOB_STATUSES.COMPLETED);
          this.eventStream.complete(job.id, "job.complete", {
            status: "completed",
            completedSteps,
            totalSteps: job.steps.length,
            artifacts: job.artifacts,
            costUSD: totalCostUSD,
          });
        } else {
          const errorMsg = `${failedSteps.length} step(s) failed`;
          this.stateMachine.transitionJob(job, JOB_STATUSES.FAILED, {
            error: errorMsg,
          });
          this.eventStream.complete(job.id, "job.error", {
            error: errorMsg,
            failedSteps: failedSteps.map((s) => ({
              id: s.id,
              description: s.description,
              error: s.error,
            })),
          });
        }
      }
    } catch (err) {
      if (
        job.status !== JOB_STATUSES.CANCELLED &&
        job.status !== JOB_STATUSES.FAILED
      ) {
        this.stateMachine.transitionJob(job, JOB_STATUSES.FAILED, {
          error: err,
        });
        this.eventStream.emitError(job.id, {
          error: err.message,
          recoverable: false,
        });
      }
    } finally {
      sandbox.seal();
      this._activeJobs.delete(job.id);
      this.jobStore.save(job);
    }

    return job;
  }

  /**
   * Execute a single step with retry logic.
   */
  async _executeStep(job, step, sandbox, { currentCostUSD = 0 } = {}) {
    this.stateMachine.transitionStep(job, step, STEP_STATUSES.RUNNING);

    this.eventStream.emitStepUpdate(job.id, {
      stepId: step.id,
      status: "running",
      description: step.description,
    });

    let lastError = null;
    const maxAttempts = (step.maxRetries || 2) + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await this._attemptStep(job, step, sandbox);

        // Store any artifacts
        if (result.artifacts && Array.isArray(result.artifacts)) {
          for (const art of result.artifacts) {
            if (art.content && art.name) {
              const workspaceDir = this.jobStore.getWorkspaceDir(job.id);
              const artifact = this.artifactManager.store(workspaceDir, {
                name: art.name,
                type: art.type || ARTIFACT_TYPES.FILE,
                content: art.content,
              });
              job.artifacts.push(artifact);
              this.eventStream.emitArtifact(job.id, artifact);
            }
          }
        }

        // Check confidence and possibly escalate
        const confidence = result.confidence || 0.7;
        step.confidence = confidence;

        if (confidence < 0.6 && attempt < maxAttempts) {
          // Low confidence — might want to retry or escalate
          const escalation = this.escalationManager.shouldEscalate(
            step,
            job.policy,
            {
              confidence,
              verificationFailed: false,
              currentCostUSD,
            },
          );

          if (escalation.shouldEscalate) {
            const escalatedResult = await this._escalateStep(
              job,
              step,
              sandbox,
            );
            if (escalatedResult) {
              this.stateMachine.transitionStep(
                job,
                step,
                STEP_STATUSES.COMPLETED,
                {
                  output: escalatedResult.content,
                  confidence: 0.85, // Higher confidence from external API
                  model: escalatedResult.model,
                  tokensUsed: escalatedResult.tokensUsed,
                },
              );
              step.costEstimate = escalatedResult.costUSD || 0;
              job.metadata.escalationCount++;
              this.eventStream.emitStepUpdate(job.id, {
                stepId: step.id,
                status: "completed",
                description: step.description,
                model: escalatedResult.model,
                confidence: 0.85,
              });
              return;
            }
          }
        }

        // Success
        this.stateMachine.transitionStep(job, step, STEP_STATUSES.COMPLETED, {
          output: result.output || result.result,
          confidence,
          model: result.model,
          tokensUsed: result.tokensUsed || 0,
        });

        this.eventStream.emitStepUpdate(job.id, {
          stepId: step.id,
          status: "completed",
          description: step.description,
          confidence,
          output:
            typeof result.output === "string"
              ? result.output.slice(0, 500)
              : null,
        });

        return;
      } catch (err) {
        lastError = err;
        this.eventStream.emitLog(job.id, {
          level: "warn",
          message: `Step '${step.description}' attempt ${attempt}/${maxAttempts} failed: ${err.message}`,
          stepId: step.id,
        });

        if (attempt < maxAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          step.retryCount = attempt;
        }
      }
    }

    // All attempts failed
    this.stateMachine.transitionStep(job, step, STEP_STATUSES.FAILED, {
      error: lastError,
    });
    this.eventStream.emitError(job.id, {
      error: lastError.message,
      stepId: step.id,
      recoverable: true,
    });
  }

  /**
   * Single attempt to execute a step via local LLM.
   */
  async _attemptStep(job, step, sandbox) {
    // Build the prompt for this step
    const messages = this._buildStepMessages(job, step);

    // Route to appropriate model
    let modelId = null;
    if (this.modelRouter) {
      const decision = this.modelRouter.route({
        prompt: messages.map((m) => m.content).join("\n"),
        mode:
          step.agentName === "coder"
            ? "implement"
            : step.agentName === "analyst"
              ? "debug"
              : undefined,
        preference: "quality",
      });
      modelId = decision?.modelId;
    }

    // Call local LLM
    if (!this.modelRuntime) {
      // No LLM available — return a placeholder
      return {
        result: `Step executed (no LLM available): ${step.description}`,
        output: `Placeholder output for: ${step.description}`,
        confidence: 0.3,
        model: "none",
        artifacts: [],
      };
    }

    const port = this.modelRuntime.currentPort || 43121;
    const prompt =
      messages
        .map((m) => {
          if (m.role === "system")
            return `<|im_start|>system\n${m.content}<|im_end|>`;
          if (m.role === "user")
            return `<|im_start|>user\n${m.content}<|im_end|>`;
          return `<|im_start|>assistant\n${m.content}<|im_end|>`;
        })
        .join("\n") + "\n<|im_start|>assistant\n";

    const http = require("node:http");

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        prompt,
        temperature: 0.4,
        max_tokens: 4096,
        stop: ["<|im_end|>"],
      });

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/completion",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 120000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              const content =
                parsed.content || parsed.choices?.[0]?.text || data;

              // Try to parse structured output
              const result = this._parseStepOutput(content, step);
              result.model = modelId || "local";
              result.tokensUsed = parsed.tokens_predicted || 0;
              resolve(result);
            } catch (e) {
              resolve({
                result: data.slice(0, 1000),
                output: data,
                confidence: 0.5,
                model: modelId || "local",
                artifacts: [],
              });
            }
          });
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("LLM request timed out"));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Escalate a step to external API.
   */
  async _escalateStep(job, step, sandbox) {
    try {
      const messages = this._buildStepMessages(job, step);
      return await this.escalationManager.escalate(step, job.policy, messages, {
        currentCostUSD: job.metadata.totalCostEstimate,
      });
    } catch {
      return null; // Escalation failed — continue with local result
    }
  }

  /**
   * Build LLM messages for a step.
   */
  _buildStepMessages(job, step) {
    const messages = [{ role: "system", content: EXECUTOR_SYSTEM_PROMPT }];

    // Add context from previous completed steps
    const prevSteps = job.steps.filter(
      (s) => s.status === STEP_STATUSES.COMPLETED && s.endedAt,
    );
    if (prevSteps.length > 0) {
      const prevContext = prevSteps
        .map(
          (s) =>
            `- ${s.description}: ${typeof s.output === "string" ? s.output.slice(0, 200) : "completed"}`,
        )
        .join("\n");
      messages.push({
        role: "user",
        content: `Previous steps completed:\n${prevContext}`,
      });
    }

    // Current step
    let stepPrompt = `CURRENT STEP: ${step.description}\n`;
    stepPrompt += `AGENT: ${step.agentName}\n`;
    if (step.tools.length > 0) {
      stepPrompt += `AVAILABLE TOOLS: ${step.tools.join(", ")}\n`;
    }
    if (step.input && Object.keys(step.input).length > 0) {
      stepPrompt += `INPUT: ${JSON.stringify(step.input)}\n`;
    }
    stepPrompt += `\nOverall goal: ${job.goal}\n`;
    stepPrompt += `\nExecute this step and return your result.`;

    messages.push({ role: "user", content: stepPrompt });

    return messages;
  }

  /**
   * Parse step output from LLM response.
   */
  _parseStepOutput(content, step) {
    // Try JSON parse
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          result: parsed.result || step.description,
          output: parsed.output || parsed.result || content,
          confidence:
            typeof parsed.confidence === "number"
              ? Math.min(1, Math.max(0, parsed.confidence))
              : 0.7,
          artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
          notes: parsed.notes || null,
        };
      }
    } catch {
      /* not JSON, use raw */
    }

    return {
      result: step.description,
      output: content,
      confidence: 0.6,
      artifacts: [],
      notes: null,
    };
  }

  // ─── Job Control ───────────────────────────────────────────

  /**
   * Pause a running job.
   */
  pauseJob(jobId) {
    const control = this._activeJobs.get(jobId);
    if (control) {
      control.paused = true;
      return true;
    }
    return false;
  }

  /**
   * Resume a paused job.
   */
  resumeJob(jobId) {
    const control = this._activeJobs.get(jobId);
    if (control) {
      control.paused = false;
      return true;
    }
    return false;
  }

  /**
   * Cancel a running or paused job.
   */
  cancelJob(jobId) {
    const control = this._activeJobs.get(jobId);
    if (control) {
      control.aborted = true;
      control.paused = false; // unblock if paused
      return true;
    }
    return false;
  }

  /**
   * Check if a job is actively executing.
   */
  isJobActive(jobId) {
    return this._activeJobs.has(jobId);
  }

  // ─── Internal ──────────────────────────────────────────────

  async _waitForResume(jobId, jobControl) {
    // Poll every second for resume/cancel
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (!jobControl.paused || jobControl.aborted) {
          clearInterval(timer);
          resolve();
        }
      }, 1000);
    });
  }
}

module.exports = {
  ComputeExecutor,
  EXECUTOR_SYSTEM_PROMPT,
};
