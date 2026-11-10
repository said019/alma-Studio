// A timeout or 5xx can happen after delivery; only an explicit rate-limit rejection is retryable.
export const shouldRetryWhatsApp = (error, attempt) => error?.response?.status === 429 && attempt < 3;
