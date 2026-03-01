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

  const run = async (target: DeployTarget) => {
    setError(null);
    setResult(null);
    const response = await ideMessenger.request("deploy/generate", { target });
    if (response.status === "success") {
      setResult(response.content);
    } else {
      setError(response.error || "Deploy setup failed");
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
            <Button onClick={() => run("vercel")}>Vercel</Button>
            <Button onClick={() => run("netlify")}>Netlify</Button>
            <Button onClick={() => run("firebase")}>Firebase</Button>
          </div>
          {result && (
            <div className="flex flex-col gap-2 text-xs text-gray-500">
              <div>{result.instructions}</div>
              <div className="rounded border border-gray-700 p-2">
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
