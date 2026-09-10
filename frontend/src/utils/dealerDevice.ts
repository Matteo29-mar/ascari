const DEVICE_STORAGE_KEY = "ascari-dealer-device-id";

export function getOrCreateDealerDeviceId() {
  let value = window.localStorage.getItem(DEVICE_STORAGE_KEY);
  if (value) return value;

  value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ascari-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(DEVICE_STORAGE_KEY, value);
  return value;
}

export function getDealerDeviceLabel() {
  const ua = navigator.userAgent;
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Edg/i.test(ua)) return "Microsoft Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "Browser";
}
