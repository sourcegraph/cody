using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DiagnosticsPublishParams
  {

    [JsonPropertyName("diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }
  }
}
