using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class EditTask
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "state")]
    public CodyTaskState State { get; set; } // Oneof: Idle, Working, Inserting, Applying, Applied, Finished, Error, Pending
    [JsonProperty(PropertyName = "error")]
    public CodyError Error { get; set; }
    [JsonProperty(PropertyName = "selectionRange")]
    public Range SelectionRange { get; set; }
    [JsonProperty(PropertyName = "instruction")]
    public string Instruction { get; set; }
    [JsonProperty(PropertyName = "model")]
    public string Model { get; set; }
    [JsonProperty(PropertyName = "originalText")]
    public string OriginalText { get; set; }
  }
}
