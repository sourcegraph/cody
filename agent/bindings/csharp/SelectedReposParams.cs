using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SelectedReposParams
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "name")]
    public string Name { get; set; }
  }
}
