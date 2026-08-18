import { useMemo, useState } from "react";

import { DEFAULT_NEW_APPS } from "./constants";
import type {
  McpCatalogItem,
  McpInstallField,
  McpInstallValues,
} from "./catalog";
import {
  Button,
  Checkbox,
  Dialog,
  InlineNotice,
  Input,
} from "../../shared/ui/primitives";
import { MCP_TARGETS, type McpTargetId } from "../../shared/features/types";

function emptyValues(fields: readonly McpInstallField[]): McpInstallValues {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.type === "multi-select" ? [] : "",
    ]),
  );
}

function requirementLabel(item: McpCatalogItem): string {
  if (item.requirements.includes("node")) return "需要 Node.js / npx";
  if (item.requirements.includes("uv")) return "需要 uv / uvx";
  return "无需本地运行时";
}

export function InstallDialog({
  item,
  busy,
  overwrite,
  onClose,
  onInstall,
}: {
  item: McpCatalogItem;
  busy: boolean;
  overwrite: boolean;
  onClose: () => void;
  onInstall: (values: McpInstallValues, apps: readonly McpTargetId[]) => void;
}) {
  const [values, setValues] = useState(() => emptyValues(item.fields));
  const [apps, setApps] = useState<Record<McpTargetId, boolean>>(
    () =>
      Object.fromEntries(
        MCP_TARGETS.map((target) => [
          target.id,
          DEFAULT_NEW_APPS.includes(target.id),
        ]),
      ) as Record<McpTargetId, boolean>,
  );
  const [error, setError] = useState<string | null>(null);

  const selectedApps = useMemo(
    () =>
      MCP_TARGETS.filter((target) => apps[target.id]).map(
        (target) => target.id,
      ),
    [apps],
  );

  const setField = (key: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const submit = () => {
    try {
      onInstall(values, selectedApps);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "安装失败");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
      title={overwrite ? `重新配置 ${item.name}` : `安装 ${item.name}`}
      description="只需填写业务参数。底层启动命令不会显示在此窗口。"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            className="fy-control-button-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "安装中…" : overwrite ? "覆盖并安装" : "安装"}
          </Button>
        </>
      }
    >
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <p className="fy-feature-description">
        {requirementLabel(item)} · 认证：{item.authLabel}
      </p>
      {item.risk && <InlineNotice tone="warning">{item.risk}</InlineNotice>}
      <div className="fy-feature-form-grid">
        {item.fields.map((field) => (
          <InstallFieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setField(field.key, value)}
          />
        ))}
        <fieldset className="fy-feature-form-span">
          <legend>安装到 Agent</legend>
          <div className="fy-feature-check-grid">
            {MCP_TARGETS.map((target) => (
              <label key={target.id} className="fy-feature-check">
                <Checkbox
                  checked={Boolean(apps[target.id])}
                  onCheckedChange={(checked) =>
                    setApps((current) => ({ ...current, [target.id]: checked }))
                  }
                  label={`安装到 ${target.label}`}
                />
                {target.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function InstallFieldInput({
  field,
  value,
  onChange,
}: {
  field: McpInstallField;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  if (field.type === "multi-select") {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <fieldset className="fy-feature-form-span">
        <legend>
          {field.label}
          {field.required ? " *" : ""}
        </legend>
        {field.help && <p className="fy-feature-description">{field.help}</p>}
        <div className="fy-feature-check-grid">
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="fy-feature-check">
              <Checkbox
                checked={selected.has(option.value)}
                onCheckedChange={(checked) => {
                  const next = new Set(selected);
                  if (checked) next.add(option.value);
                  else next.delete(option.value);
                  onChange([...next]);
                }}
                label={option.label}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === "path") {
    const text = Array.isArray(value) ? value.join("\n") : (value ?? "");
    return (
      <label className="fy-control-field fy-feature-form-span">
        {field.label}
        {field.required ? " *" : ""}
        <textarea
          className="fy-control-textarea"
          rows={4}
          placeholder={field.placeholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.help && (
          <span className="fy-feature-description">{field.help}</span>
        )}
      </label>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <label className="fy-control-field fy-feature-form-span">
      {field.label}
      {field.required ? " *" : ""}
      <Input
        type={field.type === "password" ? "password" : "text"}
        autoComplete="off"
        placeholder={field.placeholder}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
      {field.help && (
        <span className="fy-feature-description">{field.help}</span>
      )}
    </label>
  );
}
