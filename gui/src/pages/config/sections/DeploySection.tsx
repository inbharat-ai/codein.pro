import { useContext, useState } from "react";
import { Button, Card } from "../../../components/ui";
import { IdeMessengerContext } from "../../../context/IdeMessenger";
import { ConfigHeader } from "../components/ConfigHeader";

type DeployTarget = "vercel" | "netlify" | "firebase";

type DeployResult = {
  files: Array<{ path: string; created: boolean }>;
  instructions: string;
};

export function DeploySection() {
  const ideMessenger = useContext(IdeMessengerContext);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<DeployTarget | null>(null);

  const run = async (target: DeployTarget) => {
    setError(null);
    setResult(null);
    setLoading(target);
    try {
      const response = await ideMessenger.request("deploy/generate", {
        target,
      });
      if (response.status === "success") {
        setResult(response.content);
      } else {
        setError(response.error || "Deploy setup failed");
      }
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <ConfigHeader
        title="Deploy Helpers"
        subtext="Generate platform configs with safe defaults."
      />
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(["vercel", "netlify", "firebase"] as DeployTarget[]).map(
              (target) => (
                <Button
                  key={target}
                  onClick={() => run(target)}
                  disabled={loading !== null}
                >
                  {loading === target ? (
                    <span className="flex items-center gap-1.5">
                      <svg
                        className="h-3 w-3 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      {target.charAt(0).toUpperCase() + target.slice(1)}…
                    </span>
                  ) : (
                    target.charAt(0).toUpperCase() + target.slice(1)
                  )}
                </Button>
              ),
            )}
          </div>
          {result && (
            <div className="flex flex-col gap-2 text-xs text-gray-500">
              <div>{result.instructions}</div>
              <div className="border-codin-border rounded border p-2">
                {result.files.map((file) => (
                  <div key={file.path}>
                    {file.created ? "Created" : "Found"}: {file.path}
                  </div>
                ))}
              </div>
            </div>
          )}
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
      </Card>
    </div>
  );
}
