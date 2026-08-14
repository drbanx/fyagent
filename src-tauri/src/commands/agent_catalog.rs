use serde::Serialize;

const AGENT_CATALOG_CONTRACT_VERSION: u16 = 2;
const AGENT_CATALOG_REVIEWED_AT: &str = "2026-08-14";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentCatalogStatus {
    PendingVerification,
    ManualInstall,
    ManagedInstall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentOfficialLinkId {
    Product,
    Cli,
    Desktop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOfficialLink {
    pub id: AgentOfficialLinkId,
    pub label: &'static str,
    pub url: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentActionState {
    Available,
    Assisted,
    NotSupported,
    PendingVerification,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentActionCapability {
    pub state: AgentActionState,
    pub reason: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalogActions {
    pub browse: AgentActionCapability,
    pub observe: AgentActionCapability,
    pub install: AgentActionCapability,
    pub configure: AgentActionCapability,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalogEntry {
    pub id: &'static str,
    pub display_name: &'static str,
    pub description: &'static str,
    pub official_links: &'static [AgentOfficialLink],
    pub status: AgentCatalogStatus,
    pub actions: AgentCatalogActions,
    pub evidence_label: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCatalogResult {
    pub contract_version: u16,
    pub reviewed_at: &'static str,
    pub agents: Vec<AgentCatalogEntry>,
}

const fn capability(state: AgentActionState, reason: &'static str) -> AgentActionCapability {
    AgentActionCapability { state, reason }
}

const fn official_link(
    id: AgentOfficialLinkId,
    label: &'static str,
    url: &'static str,
) -> AgentOfficialLink {
    AgentOfficialLink { id, label, url }
}

const QODERWORK_OFFICIAL_LINKS: [AgentOfficialLink; 1] = [official_link(
    AgentOfficialLinkId::Product,
    "打开 QoderWork 官方页面",
    "https://qoder.com.cn/qoderwork",
)];

const TRAE_WORK_OFFICIAL_LINKS: [AgentOfficialLink; 1] = [official_link(
    AgentOfficialLinkId::Product,
    "打开 TRAE Work 官方页面",
    "https://work.trae.cn/",
)];

const WORKBUDDY_OFFICIAL_LINKS: [AgentOfficialLink; 1] = [official_link(
    AgentOfficialLinkId::Product,
    "打开 WorkBuddy 官方页面",
    "https://www.workbuddy.cn/",
)];

const CLAUDE_OFFICIAL_LINKS: [AgentOfficialLink; 2] = [
    official_link(
        AgentOfficialLinkId::Cli,
        "Claude Code CLI",
        "https://docs.anthropic.com/en/docs/claude-code/getting-started",
    ),
    official_link(
        AgentOfficialLinkId::Desktop,
        "Claude Desktop",
        "https://claude.com/download",
    ),
];

const AGENT_CATALOG: [AgentCatalogEntry; 5] = [
    AgentCatalogEntry {
        id: "qoderwork",
        display_name: "QoderWork CN",
        description: "Qoder 家族的桌面工作助手；当前仅提供官方入口。",
        official_links: &QODERWORK_OFFICIAL_LINKS,
        status: AgentCatalogStatus::PendingVerification,
        actions: AgentCatalogActions {
            browse: capability(
                AgentActionState::Available,
                "可打开 QoderWork 官方产品入口。",
            ),
            observe: capability(
                AgentActionState::PendingVerification,
                "尚未验证稳定的本地状态或登录态合同。",
            ),
            install: capability(
                AgentActionState::Assisted,
                "安装由厂商官方流程负责；FyAgent 不下载或安装。",
            ),
            configure: capability(
                AgentActionState::Assisted,
                "仅打开厂商官方设置；FyAgent 不写入配置。",
            ),
        },
        evidence_label: "官方产品入口；本地接入能力待验证",
    },
    AgentCatalogEntry {
        id: "trae-work",
        display_name: "TRAE Work",
        description: "TRAE 的多端工作助手；当前仅提供官方入口。",
        official_links: &TRAE_WORK_OFFICIAL_LINKS,
        status: AgentCatalogStatus::PendingVerification,
        actions: AgentCatalogActions {
            browse: capability(
                AgentActionState::Available,
                "可打开 TRAE Work 官方产品入口。",
            ),
            observe: capability(
                AgentActionState::PendingVerification,
                "尚未验证稳定的本地状态或登录态合同。",
            ),
            install: capability(
                AgentActionState::Assisted,
                "安装由厂商官方流程负责；FyAgent 不下载或安装。",
            ),
            configure: capability(
                AgentActionState::Assisted,
                "仅打开厂商官方设置；FyAgent 不写入配置。",
            ),
        },
        evidence_label: "官方产品入口；本地接入能力待验证",
    },
    AgentCatalogEntry {
        id: "workbuddy",
        display_name: "WorkBuddy",
        description: "可通过 FyAgent 读取并保存受限的模型配置。",
        official_links: &WORKBUDDY_OFFICIAL_LINKS,
        status: AgentCatalogStatus::ManualInstall,
        actions: AgentCatalogActions {
            browse: capability(
                AgentActionState::Available,
                "可打开 WorkBuddy 官方产品入口。",
            ),
            observe: capability(
                AgentActionState::Available,
                "可读取非敏感的 WorkBuddy 配置状态。",
            ),
            install: capability(
                AgentActionState::Assisted,
                "安装由 WorkBuddy 官方流程负责。",
            ),
            configure: capability(
                AgentActionState::Available,
                "可按 WorkBuddy 的版本与确认合同保存模型配置。",
            ),
        },
        evidence_label: "WorkBuddy 专用状态与模型配置命令",
    },
    AgentCatalogEntry {
        id: "codex",
        display_name: "Codex",
        description: "可通过 FyAgent 安装或更新 Codex Desktop，并管理受限的 Provider 配置。",
        official_links: &[],
        status: AgentCatalogStatus::ManagedInstall,
        actions: AgentCatalogActions {
            browse: capability(
                AgentActionState::NotSupported,
                "FyAgent 内置安装不依赖外部产品链接。",
            ),
            observe: capability(
                AgentActionState::Available,
                "可读取 FyAgent 中的 Provider 汇总和当前选择。",
            ),
            install: capability(
                AgentActionState::Available,
                "可通过 FyAgent 的内置 Codex Desktop 安装器安装或更新。",
            ),
            configure: capability(
                AgentActionState::Available,
                "可通过现有 Provider 保存与切换合同配置。",
            ),
        },
        evidence_label: "Codex Desktop 安装器与 Provider 配置命令",
    },
    AgentCatalogEntry {
        id: "claude-code",
        display_name: "Claude Code",
        description: "可通过 FyAgent Provider 管理进行受限的模型配置。",
        official_links: &CLAUDE_OFFICIAL_LINKS,
        status: AgentCatalogStatus::ManualInstall,
        actions: AgentCatalogActions {
            browse: capability(
                AgentActionState::Available,
                "可打开 Claude Code 官方产品入口。",
            ),
            observe: capability(
                AgentActionState::Available,
                "可读取 FyAgent 中的 Provider 汇总和当前选择。",
            ),
            install: capability(
                AgentActionState::Assisted,
                "安装由 Claude Code 官方流程负责。",
            ),
            configure: capability(
                AgentActionState::Available,
                "可通过现有 Provider 保存与切换合同配置。",
            ),
        },
        evidence_label: "Claude Provider 读取、保存与切换命令",
    },
];

#[tauri::command]
pub fn get_agent_catalog() -> AgentCatalogResult {
    AgentCatalogResult {
        contract_version: AGENT_CATALOG_CONTRACT_VERSION,
        reviewed_at: AGENT_CATALOG_REVIEWED_AT,
        agents: AGENT_CATALOG.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted_object_keys(value: &serde_json::Value) -> Vec<&str> {
        let mut keys = value
            .as_object()
            .expect("catalog wire node must be an object")
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>();
        keys.sort_unstable();
        keys
    }

    #[test]
    fn agent_catalog_freezes_v2_order_links_labels_and_capabilities() {
        let catalog = get_agent_catalog();

        assert_eq!(catalog.contract_version, 2);
        assert_eq!(catalog.reviewed_at, "2026-08-14");
        assert_eq!(
            catalog
                .agents
                .iter()
                .map(|entry| entry.id)
                .collect::<Vec<_>>(),
            [
                "qoderwork",
                "trae-work",
                "workbuddy",
                "codex",
                "claude-code",
            ]
        );
        assert_eq!(
            catalog
                .agents
                .iter()
                .map(|entry| entry.display_name)
                .collect::<Vec<_>>(),
            [
                "QoderWork CN",
                "TRAE Work",
                "WorkBuddy",
                "Codex",
                "Claude Code",
            ]
        );
        assert_eq!(
            catalog
                .agents
                .iter()
                .map(|entry| entry.evidence_label)
                .collect::<Vec<_>>(),
            [
                "官方产品入口；本地接入能力待验证",
                "官方产品入口；本地接入能力待验证",
                "WorkBuddy 专用状态与模型配置命令",
                "Codex Desktop 安装器与 Provider 配置命令",
                "Claude Provider 读取、保存与切换命令",
            ]
        );

        let official_links = catalog
            .agents
            .iter()
            .map(|entry| {
                entry
                    .official_links
                    .iter()
                    .map(|link| (link.id, link.label, link.url))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        assert_eq!(
            official_links,
            [
                vec![(
                    AgentOfficialLinkId::Product,
                    "打开 QoderWork 官方页面",
                    "https://qoder.com.cn/qoderwork",
                )],
                vec![(
                    AgentOfficialLinkId::Product,
                    "打开 TRAE Work 官方页面",
                    "https://work.trae.cn/",
                )],
                vec![(
                    AgentOfficialLinkId::Product,
                    "打开 WorkBuddy 官方页面",
                    "https://www.workbuddy.cn/",
                )],
                vec![],
                vec![
                    (
                        AgentOfficialLinkId::Cli,
                        "Claude Code CLI",
                        "https://docs.anthropic.com/en/docs/claude-code/getting-started",
                    ),
                    (
                        AgentOfficialLinkId::Desktop,
                        "Claude Desktop",
                        "https://claude.com/download",
                    ),
                ],
            ]
        );

        for entry in &catalog.agents {
            for link in entry.official_links {
                assert!(!link.label.trim().is_empty());
                let url = url::Url::parse(link.url).expect("official URL must parse");
                assert_eq!(url.scheme(), "https");
                assert!(url.host_str().is_some());
                assert!(url.username().is_empty());
                assert!(url.password().is_none());
                assert!(url.query().is_none());
                assert!(url.fragment().is_none());
            }
        }

        assert_eq!(
            catalog
                .agents
                .iter()
                .map(|entry| (
                    entry.status,
                    entry.actions.browse.state,
                    entry.actions.observe.state,
                    entry.actions.install.state,
                    entry.actions.configure.state,
                ))
                .collect::<Vec<_>>(),
            [
                (
                    AgentCatalogStatus::PendingVerification,
                    AgentActionState::Available,
                    AgentActionState::PendingVerification,
                    AgentActionState::Assisted,
                    AgentActionState::Assisted,
                ),
                (
                    AgentCatalogStatus::PendingVerification,
                    AgentActionState::Available,
                    AgentActionState::PendingVerification,
                    AgentActionState::Assisted,
                    AgentActionState::Assisted,
                ),
                (
                    AgentCatalogStatus::ManualInstall,
                    AgentActionState::Available,
                    AgentActionState::Available,
                    AgentActionState::Assisted,
                    AgentActionState::Available,
                ),
                (
                    AgentCatalogStatus::ManagedInstall,
                    AgentActionState::NotSupported,
                    AgentActionState::Available,
                    AgentActionState::Available,
                    AgentActionState::Available,
                ),
                (
                    AgentCatalogStatus::ManualInstall,
                    AgentActionState::Available,
                    AgentActionState::Available,
                    AgentActionState::Assisted,
                    AgentActionState::Available,
                ),
            ]
        );

        let codex = &catalog.agents[3];
        assert!(codex.official_links.is_empty());
        assert!(codex.actions.browse.reason.contains("不依赖外部产品链接"));
        assert!(codex.actions.install.reason.contains("FyAgent"));
    }

    #[test]
    fn agent_catalog_wire_shape_is_camel_case_non_secret_and_path_free() {
        let value = serde_json::to_value(get_agent_catalog()).expect("catalog serializes");

        assert_eq!(
            sorted_object_keys(&value),
            ["agents", "contractVersion", "reviewedAt"]
        );
        for entry in value["agents"].as_array().expect("agents must be an array") {
            assert_eq!(
                sorted_object_keys(entry),
                [
                    "actions",
                    "description",
                    "displayName",
                    "evidenceLabel",
                    "id",
                    "officialLinks",
                    "status",
                ]
            );
            for link in entry["officialLinks"]
                .as_array()
                .expect("officialLinks must be an array")
            {
                assert_eq!(sorted_object_keys(link), ["id", "label", "url"]);
            }
            assert_eq!(
                sorted_object_keys(&entry["actions"]),
                ["browse", "configure", "install", "observe"]
            );
            for action in ["browse", "observe", "install", "configure"] {
                assert_eq!(
                    sorted_object_keys(&entry["actions"][action]),
                    ["reason", "state"]
                );
            }
        }

        assert_eq!(
            serde_json::to_value(AgentCatalogStatus::PendingVerification).unwrap(),
            "pending_verification"
        );
        assert_eq!(
            serde_json::to_value(AgentCatalogStatus::ManualInstall).unwrap(),
            "manual_install"
        );
        assert_eq!(
            serde_json::to_value(AgentCatalogStatus::ManagedInstall).unwrap(),
            "managed_install"
        );
        for (id, expected) in [
            (AgentOfficialLinkId::Product, "product"),
            (AgentOfficialLinkId::Cli, "cli"),
            (AgentOfficialLinkId::Desktop, "desktop"),
        ] {
            assert_eq!(serde_json::to_value(id).unwrap(), expected);
        }
        for (state, expected) in [
            (AgentActionState::Available, "available"),
            (AgentActionState::Assisted, "assisted"),
            (AgentActionState::NotSupported, "not_supported"),
            (
                AgentActionState::PendingVerification,
                "pending_verification",
            ),
        ] {
            assert_eq!(serde_json::to_value(state).unwrap(), expected);
        }

        let serialized = serde_json::to_string(&value)
            .expect("catalog wire value serializes")
            .to_ascii_lowercase();
        for prohibited in [
            "apikey",
            "api_key",
            "access_token",
            "password",
            "processid",
            "process_id",
            "c:\\\\",
            "/users/",
            "~/.",
        ] {
            assert!(
                !serialized.contains(prohibited),
                "catalog must not expose secret/process/local-path field {prohibited}"
            );
        }
    }

    #[test]
    fn agent_catalog_command_is_exported_and_registered_once() {
        let commands_index = include_str!("mod.rs").replace("\r\n", "\n");
        assert_eq!(commands_index.matches("mod agent_catalog;").count(), 1);
        assert_eq!(
            commands_index.matches("pub use agent_catalog::*;").count(),
            1
        );

        let library_source = include_str!("../lib.rs").replace("\r\n", "\n");
        let handler_start = library_source
            .find("tauri::generate_handler![")
            .expect("the Tauri invoke handler remains present");
        let handler_end = library_source[handler_start..]
            .find("\n        ]);")
            .map(|offset| handler_start + offset)
            .expect("the Tauri invoke handler remains bounded");
        let handler = &library_source[handler_start..handler_end];

        assert_eq!(handler.matches("commands::get_agent_catalog").count(), 1);
    }
}
