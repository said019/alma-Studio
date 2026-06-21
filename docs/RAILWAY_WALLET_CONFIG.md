# Configuración de Wallet Passes en Railway (Alma)

Guía exacta para que los pases de Apple Wallet y Google Wallet **se generen y se actualicen** en producción. Hecha tras auditar el código (`server/index.js`).

> **Contexto:** reusas un mismo issuer de Google y un mismo setup de Apple en todas tus marcas, diferenciando por nombre y diseño. Eso es válido. La clase de Google de Alma ya es única en el código (`{ISSUER_ID}.alma_loyalty_v1`), así que **no choca** con Catarsis. Solo hay que poner los valores correctos.

---

## 1. Google Wallet

### Variables que SÍ debes tener (Alma)

| Variable | Valor para Alma | Notas |
|---|---|---|
| `GOOGLE_ISSUER_ID` | `3388000000023035846` | El mismo issuer que reusas. ✓ |
| `GOOGLE_SA_KEY_JSON_BASE64` | *(base64 del JSON de la service account)* | **Método recomendado.** Ver abajo. |
| `GOOGLE_ISSUER_NAME` | `Alma Movement` | O **bórrala** (default ya es "Alma Movement"). |
| `GOOGLE_PROGRAM_NAME` | `Alma Club` | O **bórrala** (default ya es "Alma Club"). |
| `GOOGLE_HEX_BACKGROUND_COLOR` | `#241B1A` | Café oscuro de marca. O bórrala para usar claro. |

### La service account (lo crítico)

Reusas **una sola** service account en todas tus marcas. Esa cuenta debe estar **autorizada en el issuer `3388000000023035846`** (es la misma que ya funciona en Catarsis). Usa **ese mismo archivo `.json`** — el que YA funciona en Catarsis con este issuer.

**Genera el base64 del JSON correcto:**
```bash
base64 -i el-service-account-correcto.json | pbcopy
```
Pega el resultado en Railway como `GOOGLE_SA_KEY_JSON_BASE64`.

> El código ahora también acepta `GOOGLE_SERVICE_ACCOUNT_JSON` con el JSON crudo (sin base64), por si prefieres pegar el archivo tal cual. Pero **base64 es más confiable en Railway** (no hay problemas de saltos de línea).

### Variables que debes BORRAR (causan conflicto)

- ❌ `GOOGLE_SA_EMAIL` — viene de `wallet-service@venus-loyalty…`
- ❌ `GOOGLE_SA_PRIVATE_KEY` — llave suelta, puede no ser de la misma cuenta
- ❌ `GOOGLE_SERVICE_ACCOUNT_JSON` — tiene `catarsis@wallet-club-agenda…`

**Por qué:** tenías el email de UNA cuenta y la llave de OTRA. Google exige que email y llave sean del **mismo** archivo, o el login da error 400. Usando solo `GOOGLE_SA_KEY_JSON_BASE64` (un archivo = un par), ese problema desaparece. Deja **un solo** método configurado.

---

## 2. Apple Wallet

Aquí está el hueco más probable. Para Apple hay **DOS cosas distintas**:

- **Firmar el `.pkpass`** (para que el pase EXISTA) → necesita el **certificado del Pass Type ID** + WWDR.
- **Push APNs** (para que el pase se ACTUALICE solo) → necesita la **AuthKey `.p8`**.

El doc que seguiste solo mencionó la AuthKey de APNs. Por eso el push estaría listo pero **el pase no se generaría**. Necesitas las 7 variables:

### Generación del pase (firma) — OBLIGATORIO

| Variable | Qué es |
|---|---|
| `APPLE_TEAM_ID` | Tu Team ID (Apple Developer → Membership) |
| `APPLE_PASS_TYPE_ID` | El Pass Type Identifier (ej. `pass.com.tudominio.membership`) |
| `APPLE_SIGNER_CERT_BASE64` | Certificado del Pass Type ID (PEM → base64) |
| `APPLE_SIGNER_KEY_BASE64` | Llave privada de ese certificado (PEM → base64) |
| `APPLE_WWDR_CERT_BASE64` | Certificado intermedio WWDR de Apple (PEM → base64) |

**Cómo generarlos** (desde el `.p12` que exportas de Keychain con el Pass Type ID):
```bash
# 1) Certificado (sin llave)
openssl pkcs12 -in PassType.p12 -clcerts -nokeys -out signerCert.pem -legacy -passin pass:TU_PASSWORD
# 2) Llave privada (sin cifrar)
openssl pkcs12 -in PassType.p12 -nocerts -nodes -out signerKey.pem -legacy -passin pass:TU_PASSWORD
# 3) WWDR: descarga AppleWWDRCAG4.cer de https://www.apple.com/certificateauthority/
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem

# 4) base64 de cada uno (cópialos a Railway)
base64 -i signerCert.pem | pbcopy   # → APPLE_SIGNER_CERT_BASE64
base64 -i signerKey.pem  | pbcopy   # → APPLE_SIGNER_KEY_BASE64
base64 -i wwdr.pem       | pbcopy   # → APPLE_WWDR_CERT_BASE64
```

### Push en vivo (APNs) — para que el pase se actualice solo

| Variable | Qué es |
|---|---|
| `APPLE_TEAM_ID` | (la misma de arriba) |
| `APPLE_KEY_ID` | Key ID de tu AuthKey `.p8` (Apple Developer → Keys) |
| `APPLE_PASS_TYPE_ID` | (el mismo de arriba — es el `apns-topic`) |
| `APPLE_APNS_KEY_BASE64` | El archivo `.p8` en base64 |

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy   # → APPLE_APNS_KEY_BASE64
```

> Reusar el mismo Pass Type ID + certificado entre marcas es válido: el diseño/branding de Alma vive en el `pass.json` que el código genera, y el número de serie es único por clienta (`alma_<userId>`).

---

## 3. Cómo verificar (sin adivinar)

Una vez configurado y redeployado, abre estos endpoints (logueado como admin) — te dicen exactamente qué está bien y qué falta:

```
GET /api/wallet/apple/status        → ¿firma configurada? ¿APNs configurado?
GET /api/wallet/google/diagnostics  → prueba el login OAuth real contra Google
```

- `/api/wallet/google/diagnostics` intenta un **login real**: si la service account o el issuer están mal, te dice el error exacto (`OAuth failed: …`).
- `/api/wallet/apple/status` muestra `walletConfigured` (firma) y `apnsConfigured` (push) por separado.

Cuando ambos den verde, genera un pase de prueba desde la app y confirma que se descarga y se actualiza.

---

## Resumen de acciones

1. **Google:** deja SOLO `GOOGLE_ISSUER_ID` + `GOOGLE_SA_KEY_JSON_BASE64` (de la SA que YA funciona con ese issuer). Pon branding Alma o bórralo. Borra `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. **Apple:** agrega las **3 variables de firma** que faltan (`APPLE_SIGNER_CERT_BASE64`, `APPLE_SIGNER_KEY_BASE64`, `APPLE_WWDR_CERT_BASE64`) además de las de APNs.
3. **Verifica** con los dos endpoints de diagnóstico.
4. **Rota** las llaves que pegaste en el chat por seguridad.
