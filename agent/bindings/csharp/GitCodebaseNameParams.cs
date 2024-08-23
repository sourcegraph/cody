using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GitCodebaseNameParams
  {
    [JsonProperty(PropertyName = "url")]
    public string Url { get; set; }
  }
}
