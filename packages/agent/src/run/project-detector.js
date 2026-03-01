/**
 * Project Detector
 * Auto-detect project type and suggest run configuration
 */

const fs = require("node:fs");
const path = require("node:path");

class ProjectDetector {
  /**
   * Detect project type and configuration
   */
  detect(workspaceRoot) {
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
      return null;
    }

    const projectInfo = {
      root: workspaceRoot,
      type: "unknown",
      profile: null,
    };

    // Check for package.json (Node.js projects)
    const packageJsonPath = path.join(workspaceRoot, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      return this.detectNodeProject(workspaceRoot, packageJson);
    }

    // Check for Python projects
    const requirementsPath = path.join(workspaceRoot, "requirements.txt");
    const pyprojectPath = path.join(workspaceRoot, "pyproject.toml");
    if (fs.existsSync(requirementsPath) || fs.existsSync(pyprojectPath)) {
      return this.detectPythonProject(workspaceRoot);
    }

    // Check for Go projects
    const goModPath = path.join(workspaceRoot, "go.mod");
    if (fs.existsSync(goModPath)) {
      return this.detectGoProject(workspaceRoot);
    }

    // Check for static HTML
    const indexHtmlPath = path.join(workspaceRoot, "index.html");
    if (fs.existsSync(indexHtmlPath)) {
      return this.detectStaticProject(workspaceRoot);
    }

    return projectInfo;
  }

  /**
   * Detect Node.js project
   */
  detectNodeProject(root, packageJson) {
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };
    const scripts = packageJson.scripts || {};

    let type = "node";
    const installCmd = this.detectPackageManager(root);
    let runCmd = null;
    let port = 3000;

    // Detect framework
    if (deps.next || scripts.dev?.includes("next")) {
      type = "next";
      runCmd = `${installCmd} run dev`;
      port = 3000;
    } else if (deps.vite || scripts.dev?.includes("vite")) {
      type = "vite";
      runCmd = `${installCmd} run dev`;
      port = 5173;
    } else if (deps["react-scripts"]) {
      type = "cra";
      runCmd = `${installCmd} start`;
      port = 3000;
    } else if (deps.express || deps.koa || deps.fastify) {
      type = "node-server";
      runCmd = scripts.start
        ? `${installCmd} start`
        : `node ${packageJson.main || "index.js"}`;
      port = 3000;
    } else if (scripts.dev) {
      runCmd = `${installCmd} run dev`;
    } else if (scripts.start) {
      runCmd = `${installCmd} start`;
    }

    return {
      root,
      type,
      profile: {
        installCmd: `${installCmd} install`,
        runCmd,
        port,
        cwd: root,
        env: {},
      },
    };
  }

  /**
   * Detect Python project
   */
  detectPythonProject(root) {
    let runCmd = null;
    let port = 8000;

    // Check for common Python frameworks
    const requirementsPath = path.join(root, "requirements.txt");
    if (fs.existsSync(requirementsPath)) {
      const requirements = fs
        .readFileSync(requirementsPath, "utf8")
        .toLowerCase();

      if (requirements.includes("flask")) {
        runCmd = "python app.py";
        port = 5000;
      } else if (requirements.includes("django")) {
        runCmd = "python manage.py runserver";
        port = 8000;
      } else if (requirements.includes("fastapi")) {
        runCmd = "uvicorn main:app --reload";
        port = 8000;
      } else if (requirements.includes("streamlit")) {
        runCmd = "streamlit run app.py";
        port = 8501;
      }
    }

    // Check for main.py or app.py
    if (!runCmd) {
      if (fs.existsSync(path.join(root, "main.py"))) {
        runCmd = "python main.py";
      } else if (fs.existsSync(path.join(root, "app.py"))) {
        runCmd = "python app.py";
      }
    }

    return {
      root,
      type: "python",
      profile: {
        installCmd: "pip install -r requirements.txt",
        runCmd,
        port,
        cwd: root,
        env: {},
      },
    };
  }

  /**
   * Detect Go project
   */
  detectGoProject(root) {
    return {
      root,
      type: "go",
      profile: {
        installCmd: "go mod download",
        runCmd: "go run .",
        port: 8080,
        cwd: root,
        env: {},
      },
    };
  }

  /**
   * Detect static HTML project
   */
  detectStaticProject(root) {
    return {
      root,
      type: "static",
      profile: {
        installCmd: null,
        runCmd: "python -m http.server 8000",
        port: 8000,
        cwd: root,
        env: {},
      },
    };
  }

  /**
   * Detect package manager for Node.js projects
   */
  detectPackageManager(root) {
    if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(root, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(root, "bun.lockb"))) {
      return "bun";
    }
    return "npm";
  }
}

const projectDetector = new ProjectDetector();

module.exports = { projectDetector };
