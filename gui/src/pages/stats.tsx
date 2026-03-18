import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { table } from "table";
import { lightGray, vscBackground, vscInputBackground } from "../components";
import { CopyIconButton } from "../components/gui/CopyIconButton";
import { PageHeader } from "../components/PageHeader";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useNavigationListener } from "../hooks/useNavigationListener";

function generateTable(data: unknown[][]) {
  return table(data);
}

function Stats() {
  useNavigationListener();
  const navigate = useNavigate();
  const ideMessenger = useContext(IdeMessengerContext);

  const [days, setDays] = useState<
    { day: string; promptTokens: number; generatedTokens: number }[]
  >([]);
  const [models, setModels] = useState<
    { model: string; promptTokens: number; generatedTokens: number }[]
  >([]);

  useEffect(() => {
    ideMessenger.request("stats/getTokensPerDay", undefined).then((result) => {
      result.status === "success" && setDays(result.content);
    });
  }, []);

  useEffect(() => {
    ideMessenger
      .request("stats/getTokensPerModel", undefined)
      .then((result) => {
        result.status === "success" && setModels(result.content);
      });
  }, []);

  const thStyle: React.CSSProperties = {
    padding: "0.5rem",
    textAlign: "left",
    border: `1px solid ${lightGray}`,
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.5rem",
    border: `1px solid ${lightGray}`,
  };

  const trStyle: React.CSSProperties = {
    overflowWrap: "anywhere",
    border: `1px solid ${lightGray}`,
  };

  return (
    <div
      style={{
        backgroundColor: vscBackground,
      }}
    >
      <PageHeader title="More" onTitleClick={() => navigate(-1)} showBorder />

      <div className="p-2">
        <div className="flex items-center gap-2">
          <h2 className="ml-2">Tokens per Day</h2>
          <CopyIconButton
            text={generateTable(
              (
                [["Day", "Generated Tokens", "Prompt Tokens"]] as unknown[][]
              ).concat(
                days.map((day) => [
                  day.day,
                  day.generatedTokens,
                  day.promptTokens,
                ]),
              ),
            )}
          />
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr style={trStyle}>
              <th style={thStyle}>Day</th>
              <th style={thStyle}>Generated Tokens</th>
              <th style={thStyle}>Prompt Tokens</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr
                key={day.day}
                style={trStyle}
                onMouseEnter={(e) =>
                  ((
                    e.currentTarget as HTMLTableRowElement
                  ).style.backgroundColor = vscInputBackground)
                }
                onMouseLeave={(e) =>
                  ((
                    e.currentTarget as HTMLTableRowElement
                  ).style.backgroundColor = "")
                }
              >
                <td style={tdStyle}>{day.day}</td>
                <td style={tdStyle}>{day.generatedTokens.toLocaleString()}</td>
                <td style={tdStyle}>{day.promptTokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center gap-2">
          <h2 className="ml-2">Tokens per Model</h2>
          <CopyIconButton
            text={generateTable(
              (
                [["Model", "Generated Tokens", "Prompt Tokens"]] as unknown[][]
              ).concat(
                models.map((model) => [
                  model.model,
                  model.generatedTokens.toLocaleString(),
                  model.promptTokens.toLocaleString(),
                ]),
              ),
            )}
          />
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr style={trStyle}>
              <th style={thStyle}>Model</th>
              <th style={thStyle}>Generated Tokens</th>
              <th style={thStyle}>Prompt Tokens</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr
                key={model.model}
                style={trStyle}
                onMouseEnter={(e) =>
                  ((
                    e.currentTarget as HTMLTableRowElement
                  ).style.backgroundColor = vscInputBackground)
                }
                onMouseLeave={(e) =>
                  ((
                    e.currentTarget as HTMLTableRowElement
                  ).style.backgroundColor = "")
                }
              >
                <td style={tdStyle}>{model.model}</td>
                <td style={tdStyle}>
                  {model.generatedTokens.toLocaleString()}
                </td>
                <td style={tdStyle}>{model.promptTokens.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Stats;
