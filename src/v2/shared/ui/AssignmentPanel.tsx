import type { SupportedAppId } from "../features/types";
import { SUPPORTED_APPS } from "../features/types";
import { Switch } from "./primitives";

export function AssignmentPanel({
  apps,
  disabled,
  labelSuffix,
  onToggle,
}: {
  apps: Record<string, boolean | undefined>;
  disabled: boolean;
  labelSuffix: string;
  onToggle: (app: SupportedAppId, enabled: boolean) => void;
}) {
  return (
    <div className="fy-feature-assignments">
      <h3>Agent 分配</h3>
      {SUPPORTED_APPS.map((app) => (
        <label key={app.id} className="fy-feature-assignment">
          <span>{app.label}</span>
          <Switch
            checked={Boolean(apps[app.id])}
            onCheckedChange={(checked) => onToggle(app.id, checked)}
            label={`${app.label} ${labelSuffix}`}
            disabled={disabled}
          />
        </label>
      ))}
    </div>
  );
}
