param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$DockerRoot
)
$ErrorActionPreference = 'Stop'
$project = 'zero-vault-p1'
$root = Join-Path $DockerRoot 'containers/zero-vault-p1'
$imageRoot = Join-Path $DockerRoot 'images/httpd/2.4.65'
$dataRoot = Join-Path $DockerRoot 'data/zero-vault-p1/webdav'
$image = 'httpd@sha256:f9b88f3f093d925525ec272bbe28e72967ffe1a40da813fe84df9fcb2fad3f30'
New-Item -ItemType Directory -Force $root,"$root/secrets","$root/logs",$imageRoot,$dataRoot | Out-Null
$passwordFile = "$root/secrets/password.txt"
if (!(Test-Path $passwordFile)) {
    $secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    [IO.File]::WriteAllText($passwordFile, $secret)
    $secret = $null
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls "$root/secrets" /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
@'
ServerRoot "/usr/local/apache2"
Listen 443
ServerName localhost
LoadModule mpm_event_module modules/mod_mpm_event.so
LoadModule unixd_module modules/mod_unixd.so
LoadModule authn_core_module modules/mod_authn_core.so
LoadModule authn_file_module modules/mod_authn_file.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule authz_user_module modules/mod_authz_user.so
LoadModule authz_host_module modules/mod_authz_host.so
LoadModule auth_basic_module modules/mod_auth_basic.so
LoadModule dav_module modules/mod_dav.so
LoadModule dav_fs_module modules/mod_dav_fs.so
LoadModule socache_shmcb_module modules/mod_socache_shmcb.so
LoadModule ssl_module modules/mod_ssl.so
LoadModule alias_module modules/mod_alias.so
User daemon
Group daemon
ErrorLog /proc/self/fd/2
LogLevel warn
PidFile /tmp/httpd.pid
DavLockDB /tmp/DavLock
SSLEngine on
SSLCertificateFile /run/probe/server.crt
SSLCertificateKeyFile /run/probe/server.key
SSLProtocol -all +TLSv1.2 +TLSv1.3
DocumentRoot /data
<Directory /data>
    Dav On
    AuthType Basic
    AuthName "P1 synthetic WebDAV"
    AuthUserFile /run/probe/htpasswd
    Require valid-user
</Directory>
Redirect 302 /redirect https://127.0.0.1:18444/leak
'@ | Set-Content "$root/httpd.conf"
@"
name: $project
services:
  webdav:
    image: $image
    ports:
      - "127.0.0.1:18443:443"
    volumes:
      - "$root/httpd.conf:/usr/local/apache2/conf/httpd.conf:ro"
      - "$root/secrets:/run/probe:ro"
      - "${dataRoot}:/data"
    restart: "no"
"@ | Set-Content "$root/compose.yaml"
docker run --rm --entrypoint sh --mount "type=bind,source=$root/secrets,target=/probe" $image -c 'htpasswd -i -c -B /probe/htpasswd p1probe < /probe/password.txt'
if ($LASTEXITCODE -ne 0) { throw 'Secret initialization failed' }
$openssl = Get-Command openssl -ErrorAction SilentlyContinue
if (!$openssl) {
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        $gitRoot = Split-Path (Split-Path $git.Source -Parent) -Parent
        $opensslPath = Join-Path $gitRoot 'usr/bin/openssl.exe'
        if (Test-Path -LiteralPath $opensslPath) { $openssl = @{ Source = $opensslPath } }
    }
}
if (!$openssl) { throw 'OpenSSL was not found. Install Git for Windows or OpenSSL and retry.' }
& $openssl.Source req -x509 -newkey rsa:2048 -nodes -keyout "$root/secrets/server.key" -out "$root/secrets/server.crt" -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' 2> "$root/logs/certificate-generation.log"
if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed' }
docker compose -f "$root/compose.yaml" config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration rejected' }
docker compose -f "$root/compose.yaml" up -d
if ($LASTEXITCODE -ne 0) { throw 'Compose startup failed' }
if (!(Test-Path "$imageRoot/image.tar")) {
    docker image save --output "$imageRoot/image.tar" $image
    if ($LASTEXITCODE -ne 0) { throw 'Image archive incomplete' }
}
docker image inspect $image --format '{{json .RepoDigests}} {{.Os}}/{{.Architecture}}' | Set-Content "$imageRoot/source.txt"
Write-Output 'WebDAV probe created; password remains in the restricted secrets directory.'
