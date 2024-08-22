using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum DiagnosticSeverity
  {
    [JsonPropertyName("error")]
    Error,
    [JsonPropertyName("warning")]
    Warning,
    [JsonPropertyName("info")]
    Info,
    [JsonPropertyName("suggestion")]
    Suggestion,
  }
}
