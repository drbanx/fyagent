import { Brand } from "./Brand";
import { PrimaryNav } from "./PrimaryNav";
import { ToolCluster } from "./ToolCluster";

export function TopBar() {
  return (
    <header className="fy-top-bar" data-testid="top-bar">
      <div className="fy-top-bar-leading">
        <Brand />
      </div>

      <PrimaryNav />

      <div className="fy-top-bar-trailing">
        <ToolCluster />
      </div>
    </header>
  );
}
