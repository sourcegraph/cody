using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DiagnosticsPublishParams
  {
    [JsonProperty(PropertyName = "diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }
  }
}
