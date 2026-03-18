import { ErrorBoundary } from "../../components/ErrorBoundary";
import { History } from "../../components/History";
import { Chat } from "./Chat";

export default function GUI() {
  return (
    <div className="flex w-screen flex-row overflow-hidden">
      <aside className="4xl:flex border-codin-border no-scrollbar hidden w-96 overflow-y-auto border-0 border-r border-solid">
        <ErrorBoundary>
          <History />
        </ErrorBoundary>
      </aside>
      <main className="no-scrollbar flex flex-1 flex-col overflow-y-auto">
        <ErrorBoundary>
          <Chat />
        </ErrorBoundary>
      </main>
    </div>
  );
}
