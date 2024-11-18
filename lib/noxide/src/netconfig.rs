use educe::Educe;
use napi_derive::napi;

use super::errext::ToNapiResult;
use rustls_native_certs::load_native_certs;

#[napi]
#[derive(Educe)]
#[educe(Debug, Default, Clone)]
pub struct Sysproxy {
    pub enable: bool,
    pub host: String,
    pub port: u16,
    pub bypass: String,
}

impl From<sysproxy::Sysproxy> for Sysproxy {
    fn from(value: sysproxy::Sysproxy) -> Self {
        Sysproxy {
            enable: value.enable,
            host: value.host,
            port: value.port,
            bypass: value.bypass,
        }
    }
}

#[napi(js_name = "config")]
mod _export {

    use super::*;

    #[napi]
    #[tracing::instrument(level = "trace")]
    pub fn system_proxy() -> Option<Sysproxy> {
        let proxy = sysproxy::Sysproxy::get_system_proxy().napi().ok();
        proxy.map(|v| v.into())
    }

    #[napi]
    #[tracing::instrument(level = "trace")]
    pub fn ca_certs(bundled_certs: Option<Vec<String>>) -> Vec<String> {
        let results = load_native_certs();
        results.errors.iter().for_each(|e| {
            log::warn!("load_native_certs error: {}", e);
        });
        let pems = results.certs.into_iter().map(|cert| {
            let pem = pem::Pem::new("CERTIFICATE", cert.as_ref());
            pem::encode_config(
                &pem,
                pem::EncodeConfig::new().set_line_ending(pem::LineEnding::LF),
            )
        });

        // ensure that bundled certs are all valid PEMs
        let bundled_certs = bundled_certs
            .unwrap_or_default()
            .into_iter()
            .flat_map(|raw| {
                let Ok(pem) = pem::parse(raw.as_bytes()) else {
                    log::warn!("Invalid PEM in bundled certs: {}", raw);
                    return None;
                };
                match pem.tag() {
                    "CERTIFICATE" | "X509 CERTIFICATE" | "TRUSTED CERTIFICATE" => {
                        Some(pem::encode_config(
                            &pem,
                            pem::EncodeConfig::new().set_line_ending(pem::LineEnding::LF),
                        ))
                    }
                    _ => None,
                }
            });

        // finally merge the two lists filtering out any duplicates
        pems.chain(bundled_certs)
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect()
    }
}
