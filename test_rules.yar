rule Suspicious_Strings {
    meta:
        description = "Detect common suspicious strings in memory"
        author = "Lovelymem V2 Test"
        severity = "medium"
    strings:
        $url = /https?:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}/ ascii wide
        $cmd = "cmd.exe" ascii wide nocase
        $powershell = "powershell" ascii wide nocase
        $password = "password" ascii wide nocase
        $admin = "administrator" ascii wide nocase
    condition:
        any of them
}

rule PE_Header {
    meta:
        description = "Detect PE executable headers in memory"
        author = "Lovelymem V2 Test"
        severity = "info"
    strings:
        $mz = { 4D 5A }
        $pe = { 50 45 00 00 }
        $dos_msg = "This program cannot be run in DOS mode"
    condition:
        $mz at 0 or $pe or $dos_msg
}

rule Crypto_Indicators {
    meta:
        description = "Detect encryption-related strings"
        author = "Lovelymem V2 Test"
        severity = "high"
    strings:
        $aes = "AES" ascii wide
        $rsa = "RSA" ascii wide
        $begin_key = "-----BEGIN" ascii
        $base64_long = /[A-Za-z0-9+\/]{100,}={0,2}/ ascii
    condition:
        2 of them
}

rule Network_IOC {
    meta:
        description = "Detect network-related indicators"
        author = "Lovelymem V2 Test"
        severity = "medium"
    strings:
        $ip_port = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{1,5}/ ascii
        $http_header = "User-Agent:" ascii
        $cookie = "Cookie:" ascii wide
        $authorization = "Authorization:" ascii wide
    condition:
        any of them
}
