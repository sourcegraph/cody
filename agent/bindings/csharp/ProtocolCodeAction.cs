using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolCodeAction
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "commandID")]
    public string CommandID { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "diagnostics")]
    public ProtocolDiagnostic[] Diagnostics { get; set; }
    [JsonProperty(PropertyName = "kind")]
    public string Kind { get; set; }
    [JsonProperty(PropertyName = "isPreferred")]
    public bool IsPreferred { get; set; }
    [JsonProperty(PropertyName = "disabled")]
    public DisabledParams Disabled { get; set; }
  }
}
