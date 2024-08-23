using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTaskCancelParams
  {
    [JsonProperty(PropertyName = "id")]
    public FixupTaskID Id { get; set; }
  }
}
