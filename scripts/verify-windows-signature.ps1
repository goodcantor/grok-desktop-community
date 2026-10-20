param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][string]$ExpectedPublisher)
$ErrorActionPreference='Stop'
$signature=Get-AuthenticodeSignature -LiteralPath $Path
if($signature.Status -ne 'Valid'){throw "Invalid Authenticode signature: $($signature.Status)"}
$publisher=$signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)
if($publisher -ne $ExpectedPublisher){throw 'Unexpected Windows signing publisher'}
Write-Output 'AUTHENTICODE_VERIFIED'
