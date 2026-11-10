fn main() {
    println!("cargo:rerun-if-env-changed=YLOADER_TAURI_UPDATE_ENDPOINT");
    println!("cargo:rerun-if-env-changed=YLOADER_TAURI_UPDATE_PUBKEY");
    tauri_build::build();
}
