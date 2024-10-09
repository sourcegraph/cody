using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AuthStatus
  {
    [JsonProperty(PropertyName = "username")]
    public string Username { get; set; }
    [JsonProperty(PropertyName = "endpoint")]
    public string Endpoint { get; set; }
    [JsonProperty(PropertyName = "isDotCom")]
    public bool IsDotCom { get; set; }
    [JsonProperty(PropertyName = "isLoggedIn")]
    public bool IsLoggedIn { get; set; }
    [JsonProperty(PropertyName = "isFireworksTracingEnabled")]
    public bool IsFireworksTracingEnabled { get; set; }
    [JsonProperty(PropertyName = "showInvalidAccessTokenError")]
    public bool ShowInvalidAccessTokenError { get; set; }
    [JsonProperty(PropertyName = "authenticated")]
    public bool Authenticated { get; set; }
    [JsonProperty(PropertyName = "hasVerifiedEmail")]
    public bool HasVerifiedEmail { get; set; }
    [JsonProperty(PropertyName = "requiresVerifiedEmail")]
    public bool RequiresVerifiedEmail { get; set; }
    [JsonProperty(PropertyName = "siteHasCodyEnabled")]
    public bool SiteHasCodyEnabled { get; set; }
    [JsonProperty(PropertyName = "siteVersion")]
    public string SiteVersion { get; set; }
    [JsonProperty(PropertyName = "codyApiVersion")]
    public int CodyApiVersion { get; set; }
    [JsonProperty(PropertyName = "configOverwrites")]
    public CodyLLMSiteConfiguration ConfigOverwrites { get; set; }
    [JsonProperty(PropertyName = "showNetworkError")]
    public bool ShowNetworkError { get; set; }
    [JsonProperty(PropertyName = "primaryEmail")]
    public string PrimaryEmail { get; set; }
    [JsonProperty(PropertyName = "displayName")]
    public string DisplayName { get; set; }
    [JsonProperty(PropertyName = "avatarURL")]
    public string AvatarURL { get; set; }
    [JsonProperty(PropertyName = "userCanUpgrade")]
    public bool UserCanUpgrade { get; set; }
    [JsonProperty(PropertyName = "isOfflineMode")]
    public bool IsOfflineMode { get; set; }
  }
}
