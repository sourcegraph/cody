using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolDiagnostic
  {

    [JsonPropertyName("location")]
    public ProtocolLocation Location { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }

    [JsonPropertyName("severity")]
    public DiagnosticSeverity Severity { get; set; } // Oneof: error, warning, info, suggestion

    [JsonPropertyName("code")]
    public string Code { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; }

    [JsonPropertyName("relatedInformation")]
    public ProtocolRelatedInformationDiagnostic[] RelatedInformation { get; set; }
  }
}
