// Correos sintéticos para cuentas sin correo real: invitadas (users.role =
// 'guest') y socias que llegan por Wellhub. users.email es NOT NULL, así que
// hace falta uno único; nunca se usa para iniciar sesión ni para enviar correo.
//
// Ninguna cuenta se busca por este correo: las invitadas se encuentran por
// users.guest_profile_id y las de Wellhub por users.wellhub_id. Por eso las
// cuentas NUEVAS usan el dominio de HIVE y las ya creadas conservan el suyo
// (alma.guest / alma.partner) sin que se dupliquen: se siguen encontrando por
// su identificador, no por el correo.
export const syntheticGuestEmail = (guestProfileId) => `guest+${guestProfileId}@hive.guest`;
export const syntheticPartnerEmail = (wellhubId) => `wellhub+${wellhubId}@hive.partner`;
