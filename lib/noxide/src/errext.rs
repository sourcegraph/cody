use napi::Error as NapiError;

pub trait ToNapiResult<T> {
    fn napi(self) -> Result<T, NapiError>;
}

impl<T, E> ToNapiResult<T> for Result<T, E>
where
    E: std::fmt::Display,
{
    fn napi(self) -> Result<T, NapiError> {
        self.map_err(|e| NapiError::from_reason(e.to_string()))
    }
}
