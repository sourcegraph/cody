using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolDiagnostic
  {
    [JsonProperty(PropertyName = "location")]
    public ProtocolLocation Location { get; set; }
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
    [JsonProperty(PropertyName = "severity")]
    public DiagnosticSeverity Severity { get; set; } // Oneof: error, warning, info, suggestion
    [JsonProperty(PropertyName = "code")]
    public string Code { get; set; }
    [JsonProperty(PropertyName = "source")]
    public string Source { get; set; }
    [JsonProperty(PropertyName = "relatedInformation")]
    public ProtocolRelatedInformationDiagnostic[] RelatedInformation { get; set; }
  }
}
