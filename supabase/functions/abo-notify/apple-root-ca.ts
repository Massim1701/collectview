/* Apple Root CA - G3, DER als base64.
   Gegen dieses Zertifikat prüft SignedDataVerifier die Kette jeder
   Notification. Es liegt bewusst im Repo statt zur Laufzeit geladen zu
   werden: ein Wurzelzertifikat, das man erst herunterlädt, prüft nichts –
   wer den Download umbiegen kann, unterschiebt auch die Wurzel.

   Herkunft: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
   SHA-256 : 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:
             7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
   Gültig bis 2039 – bis dahin ändert sich hier nichts. */

const BASE64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9v" +
  "dCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UE" +
  "CgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2" +
  "WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmlj" +
  "YXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqG" +
  "SM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxE" +
  "tX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNC" +
  "MEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0P" +
  "AQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3m" +
  "eoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkL" +
  "F1vLUagM6BgD56KyKA==";

/** Das Zertifikat als Bytes, so wie die Bibliothek es erwartet. */
export const APPLE_ROOT_CA_G3: Uint8Array = Uint8Array.from(
  atob(BASE64),
  (z) => z.charCodeAt(0),
);
