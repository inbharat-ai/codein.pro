export default function createReleaseConfig(packageName) {
  // Publish to npm only when a real token is present.
  // Without this guard @semantic-release/npm throws an auth error for
  // repos that have not yet configured an npm org token.
  const npmPublish = Boolean(process.env.NPM_TOKEN);

  return {
    branches: ["main"],
    tagFormat: `@codein/${packageName}@\${version}`,
    plugins: [
      [
        "@semantic-release/commit-analyzer",
        {
          releaseRules: [
            { scope: `packages/${packageName}`, release: "patch" },
            { scope: `packages/${packageName}`, type: "fix", release: "patch" },
            { scope: "packages/config-yaml", type: "feat", release: "minor" },
            {
              scope: `packages/${packageName}`,
              breaking: true,
              release: "major",
            },
          ],
        },
      ],
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      // npmPublish is false when NPM_TOKEN is absent — still bumps version
      // and updates CHANGELOG but skips the actual registry publish.
      ["@semantic-release/npm", { npmPublish }],
      // Removed @semantic-release/git plugin to avoid pushing to main
      "@semantic-release/github",
    ],
  };
}
