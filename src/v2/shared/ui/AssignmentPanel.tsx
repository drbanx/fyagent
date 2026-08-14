import { getSkillTargetIcon } from "../assets/apps";
import type { SkillTargetId } from "../features/types";
import { Switch } from "./primitives";

export function AssignmentPanel<T extends SkillTargetId>({
  apps,
  disabled,
  labelSuffix,
  onToggle,
  targets,
}: {
  apps: Record<string, boolean | undefined>;
  disabled: boolean;
  labelSuffix: string;
  onToggle: (app: T, enabled: boolean) => void;
  targets: ReadonlyArray<{ id: T; label: string }>;
}) {
  return (
    <div className="fy-feature-assignments">
      <h3>Agent 分配</h3>
      {targets.map((app) => (
        <label key={app.id} className="fy-feature-assignment">
          <span className="fy-feature-assignment-label">
            <img
              className="fy-feature-assignment-icon"
              src={getSkillTargetIcon(app.id)}
              alt=""
              aria-hidden="true"
            />
            <span>{app.label}</span>
          </span>
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
