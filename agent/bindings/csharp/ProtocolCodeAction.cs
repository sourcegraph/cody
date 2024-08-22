using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCodeAction
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("commandID")]
    public string CommandID { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }

    [JsonPropertyName("kind")]
    public string Kind { get; set; }

    [JsonPropertyName("isPreferred")]
    public bool IsPreferred { get; set; }

    [JsonPropertyName("disabled")]
    public DisabledParams Disabled { get; set; }
  }
}
