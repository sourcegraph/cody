use educe::Educe;

use super::errext::ToNapiResult;
use lazy_static::lazy_static;
use log::{LevelFilter, Record};
use napi::{
    bindgen_prelude::*,
    threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use parking_lot::Mutex;

lazy_static! {
    static ref JS_LOGGER: JsLogger = JsLogger::new();
}

struct JsLogger {
    callback: Mutex<Option<ThreadsafeFunction<LogEntry, ErrorStrategy::Fatal>>>,
}

impl JsLogger {
    fn new() -> Self {
        JsLogger {
            callback: Mutex::new(None),
        }
    }
}

#[derive(Educe)]
#[napi(object)]
#[educe(Debug, Default, Clone)]
pub struct LogEntry {
    #[napi(ts_type = r#""ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE""#)]
    #[educe(Default = "ERROR")]
    pub level: String,
    pub target: String,
    pub message: String,
    pub file: Option<String>,
    pub line: Option<u32>,
}

impl log::Log for JsLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        if metadata.target().starts_with("noxide") {
            true
        } else {
            metadata.level() <= log::Level::Info
        }
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        if let Some(callback) = self.callback.lock().as_ref() {
            let entry = LogEntry {
                level: record.level().to_string(),
                target: record.target().to_string(),
                message: record.args().to_string(),
                file: record.file().map(String::from),
                line: record.line(),
            };
            callback.call(entry, ThreadsafeFunctionCallMode::Blocking);
        }
    }

    fn flush(&self) {}
}

#[napi::module_init]
fn init() {
    log::set_logger(&*JS_LOGGER)
        .map(|()| log::set_max_level(LevelFilter::Trace))
        .unwrap();
}

#[napi(js_name = "log")]
pub mod _log {
    use napi::threadsafe_function::ErrorStrategy;

    use super::*;

    #[napi(ts_args_type = "callback: (entry: LogEntry) => void")]
    pub fn init(callback: JsFunction) -> Result<()> {
        let tsfn: ThreadsafeFunction<LogEntry, ErrorStrategy::Fatal> = callback
            .create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))
            .napi()
            .unwrap();
        *JS_LOGGER.callback.lock() = Some(tsfn.clone());

        Ok(())
    }
}

#[napi(js_name = "test")]
pub mod _test {
    #[napi]
    pub fn log() {
        log::trace!("This is a trace!");
        log::debug!("This is a debug!");
        log::info!("This is an info!");
        log::warn!("This is a warn!");
        log::error!("This is an error!");
    }
}
