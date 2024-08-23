using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTaskGetTaskDetailsParams
  {
    [JsonProperty(PropertyName = "id")]
    public FixupTaskID Id { get; set; }
  }
}
