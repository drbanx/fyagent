fn main() {
    println!("cargo:rerun-if-changed=windows/fyagent-user-helper.manifest");
    println!("cargo:rerun-if-changed=windows/fyagent-user-helper.rc");

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var_os("CARGO_FEATURE_HELPER_RUNTIME").is_some()
    {
        embed_resource::compile(
            "windows/fyagent-user-helper.rc",
            embed_resource::ParamsIncludeDirs(&["windows"]),
        )
        .manifest_required()
        .expect("failed to embed the fyagent-user-helper asInvoker manifest");
    }
}
