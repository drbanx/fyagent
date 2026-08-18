import type { ReactNode } from "react";

import { Badge } from "../../shared/ui/primitives";
import { FieldFeedback, type Notice } from "./feedback";

export function NoticeView({ notice }: { notice: Notice | null }) {
  return <FieldFeedback notice={notice} />;
}

export function ModelsPanelHeader({
  title,
  summary,
  pending = false,
  children,
}: {
  title: string;
  summary: string;
  pending?: boolean;
  children?: ReactNode;
}) {
  return (
    <header
      className="fy-models-config-heading fy-models-commit-heading"
      data-pending={pending || undefined}
    >
      <div>
        <h2>{title}</h2>
        <p>{summary}</p>
      </div>
      {children ? (
        <div className="fy-models-commit" data-testid="models-commit">
          {pending ? <Badge tone="warning">待保存</Badge> : null}
          {children}
        </div>
      ) : null}
    </header>
  );
}

