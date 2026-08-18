fn main() {
    napi_build::setup();
    link_driver_manager();
}

fn link_driver_manager() {
    println!("cargo:rerun-if-env-changed=UNIXODBC_LIB_DIR");

    if target_os() == "windows" {
        println!("cargo:rustc-link-lib=dylib=odbc32");
        return;
    }

    for directory in driver_manager_search_paths() {
        println!("cargo:rustc-link-search=native={directory}");
    }
    println!("cargo:rustc-link-lib=dylib=odbc");
}

/// An explicit directory wins, which is how cross-compilation is pointed at a
/// driver manager for the target rather than the host.
fn driver_manager_search_paths() -> Vec<String> {
    if let Ok(directory) = std::env::var("UNIXODBC_LIB_DIR") {
        return vec![directory];
    }
    if std::env::var("TARGET") != std::env::var("HOST") {
        return Vec::new();
    }

    host_search_paths()
}

fn host_search_paths() -> Vec<String> {
    ["/opt/homebrew/lib", "/usr/local/lib", "/QOpenSys/pkgs/lib"]
        .iter()
        .filter(|directory| std::path::Path::new(directory).is_dir())
        .map(|directory| (*directory).to_owned())
        .collect()
}

fn target_os() -> String {
    std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default()
}
