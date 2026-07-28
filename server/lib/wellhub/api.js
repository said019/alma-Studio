// Cliente saliente de la API de Wellhub/Gympass.
// TODAS best-effort: retornan { ok, status, data } y NUNCA lanzan (el billing de
// la visita no debe tumbar el webhook).
//
// NOTA: los paths y shapes exactos ({action}/reserve|reject, /validate) son la
// mejor aproximación según WELLHUB_INTEGRATION.md; ajustar contra la referencia
// real de Wellhub durante las pruebas en sandbox (gym_id 439).

async function call(url, { method = "POST", token, gymId, productId, body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(gymId ? { "X-Gym-Id": String(gymId) } : {}),
        ...(productId ? { "X-Product-Id": String(productId) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err.message };
  }
}

// Confirma (reserve) una reserva solicitada por Wellhub.
export async function confirmWellhubBooking(creds, { bookingNumber, reason } = {}) {
  const url = `${creds.bookingBaseUrl}/bookings/${encodeURIComponent(bookingNumber)}/reserve`;
  return call(url, { token: creds.access_token, gymId: creds.gym_id, productId: creds.extra_config?.product_id, body: reason ? { reason } : {} });
}

// Rechaza una reserva (CLASS_NOT_FOUND, CLASS_IS_FULL, etc.).
export async function rejectWellhubBooking(creds, { bookingNumber, reason } = {}) {
  const url = `${creds.bookingBaseUrl}/bookings/${encodeURIComponent(bookingNumber)}/reject`;
  return call(url, { token: creds.access_token, gymId: creds.gym_id, productId: creds.extra_config?.product_id, body: { reason: reason || "REJECTED" } });
}

// Cancela una reserva confirmada.
export async function cancelWellhubBooking(creds, { bookingNumber, reason } = {}) {
  const url = `${creds.bookingBaseUrl}/bookings/${encodeURIComponent(bookingNumber)}/cancel`;
  return call(url, { token: creds.access_token, gymId: creds.gym_id, productId: creds.extra_config?.product_id, body: reason ? { reason } : {} });
}

// Valida la visita (Access Control) — es lo que "cobra" al convenio.
export async function validateWellhubVisit(creds, { customCode } = {}) {
  const url = `${creds.accessBaseUrl}/validate`;
  return call(url, { token: creds.access_token, gymId: creds.gym_id, productId: creds.extra_config?.product_id, body: { custom_code: customCode } });
}
