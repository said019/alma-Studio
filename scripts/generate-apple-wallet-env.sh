#!/usr/bin/env bash
#
# Genera los valores base64 de Apple Wallet para pegar en Railway.
# Los secretos NUNCA se imprimen en pantalla: se escriben a wallet-env.txt.
#
# Uso:
#   ./generate-apple-wallet-env.sh <PassType.p12> "<password_del_p12>" <AppleWWDRCAG4.cer> <AuthKey_XXXX.p8>
#
# - PassType.p12 : el certificado del Pass Type ID exportado desde Keychain
#                  (incluye certificado + llave privada).
# - password     : la contraseña que pusiste al exportar el .p12 ("" si no tiene).
# - WWDR .cer    : descárgalo de https://www.apple.com/certificateauthority/
#                  (Worldwide Developer Relations — G4).
# - AuthKey .p8  : la AuthKey de APNs (Apple Developer → Keys).
#
set -euo pipefail

if [ "$#" -ne 4 ]; then
  echo "Uso: $0 <PassType.p12> \"<password>\" <WWDR.cer> <AuthKey.p8>" >&2
  exit 1
fi

P12="$1"; P12PASS="$2"; WWDR="$3"; P8="$4"
OUT="wallet-env.txt"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) Certificado del Pass Type ID (sin la llave)
openssl pkcs12 -in "$P12" -clcerts -nokeys -legacy -passin pass:"$P12PASS" -out "$TMP/signerCert.pem"
# 2) Llave privada (sin cifrar)
openssl pkcs12 -in "$P12" -nocerts -nodes  -legacy -passin pass:"$P12PASS" -out "$TMP/signerKey.pem"
# 3) WWDR: acepta DER (.cer) o PEM
if openssl x509 -in "$WWDR" -inform der -out "$TMP/wwdr.pem" 2>/dev/null; then :; else cp "$WWDR" "$TMP/wwdr.pem"; fi

b64() { base64 < "$1" | tr -d '\n'; }

{
  echo "APPLE_SIGNER_CERT_BASE64=$(b64 "$TMP/signerCert.pem")"
  echo "APPLE_SIGNER_KEY_BASE64=$(b64 "$TMP/signerKey.pem")"
  echo "APPLE_WWDR_CERT_BASE64=$(b64 "$TMP/wwdr.pem")"
  echo "APPLE_APNS_KEY_BASE64=$(b64 "$P8")"
} > "$OUT"

echo "✅ Listo. Las 4 variables están en: $OUT"
echo "   Pégalas en Railway (Variables) y luego BORRA el archivo:  rm $OUT"
echo "   Recuerda tener también APPLE_TEAM_ID, APPLE_PASS_TYPE_ID y APPLE_KEY_ID."
