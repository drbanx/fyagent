import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import type { ReactNode } from "react";

import { Badge, Checkbox, Tooltip } from "../../shared/ui/primitives";
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

export function NoApiKeyOption({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="fy-models-checkbox-row fy-models-checkbox-row-inline fy-models-form-wide">
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        label="允许无 API Key"
        disabled={disabled}
      />
      <span>不使用 API Key</span>
      <Tooltip
        label={
          <span className="fy-models-help-copy">
            给不需要鉴权的本地模型使用，例如本机的 Ollama、LM
            Studio。勾选后请求不会携带 API Key。
          </span>
        }
      >
        <button
          type="button"
          className="fy-models-help"
          aria-label="不使用 API Key 说明"
        >
          <QuestionIcon size={16} weight="regular" aria-hidden />
        </button>
      </Tooltip>
    </div>
  );
}

